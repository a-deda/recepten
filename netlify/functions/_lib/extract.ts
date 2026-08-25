import { PDFParse } from 'pdf-parse';
import { db, BUCKET } from './supabase.js';
import type { Inzending, ParserInvoer, BronType } from './types.js';

const FETCH_TIMEOUT_MS = 8000;
const MAX_TEKST = 60_000;
/** Claude accepteert afbeeldingen tot 5 MB per stuk (base64 telt niet mee). */
const MAX_AFBEELDING_BYTES = 5 * 1024 * 1024;

/** Een echte UA: veel foodblogs serveren botten een lege pagina. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const URL_PATROON = /https?:\/\/[^\s<>"')]+/i;
/** "p. 142", "pag 12", "blz. 88" — genoeg om `book` van `text` te scheiden. */
const BOEK_PATROON = /\b(p\.?|pag\.?|pagina|blz\.?)\s?\d{1,4}\b/i;

export function vindUrl(tekst: string): string | null {
  const match = tekst.match(URL_PATROON);
  return match ? match[0].replace(/[.,;)]+$/, '') : null;
}

export function bepaalBron(inzending: Inzending): BronType {
  const afbeelding = inzending.attachments.find((a) =>
    a.mime.startsWith('image/'),
  );
  if (afbeelding) return 'image';
  if (inzending.attachments.some((a) => a.mime === 'application/pdf')) return 'pdf';

  const tekst = `${inzending.subject}\n${inzending.body}`;
  if (vindUrl(tekst)) return 'url';
  if (BOEK_PATROON.test(tekst)) return 'book';
  return 'text';
}

/**
 * schema.org-Recipe uit JSON-LD trekken. Nederlandse foodblogs hebben dit
 * vaak al staan; dan hoeft Claude niet door de navigatie en cookiebanner
 * heen te lezen. Levert een compacte, betrouwbare invoer op.
 */
export function jsonLdRecept(html: string): string | null {
  const blokken = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const blok of blokken) {
    let data: unknown;
    try {
      data = JSON.parse(blok[1].trim());
    } catch {
      continue; // Kapotte JSON-LD is gewoon geen treffer, geen fout.
    }
    const recept = zoekRecipeNode(data);
    if (recept) return JSON.stringify(recept);
  }
  return null;
}

function zoekRecipeNode(node: unknown, diepte = 0): unknown | null {
  if (diepte > 6 || node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const treffer = zoekRecipeNode(item, diepte + 1);
      if (treffer) return treffer;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  const isRecipe = Array.isArray(type)
    ? type.some((t) => String(t).toLowerCase() === 'recipe')
    : String(type ?? '').toLowerCase() === 'recipe';
  if (isRecipe) return obj;

  for (const waarde of Object.values(obj)) {
    const treffer = zoekRecipeNode(waarde, diepte + 1);
    if (treffer) return treffer;
  }
  return null;
}

/** Ruwe HTML naar leesbare tekst. Geen DOM nodig, geen selectorbibliotheek. */
export function htmlNaarTekst(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export async function haalPagina(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `Pagina gaf status ${res.status}. Waarschijnlijk een cookiemuur of ` +
          'loginmuur — plak de tekst in de mailbody en stuur opnieuw.',
      );
    }
    return await res.text();
  } catch (fout) {
    if (fout instanceof Error && fout.name === 'AbortError') {
      throw new Error('Pagina reageerde niet binnen 8 seconden.');
    }
    throw fout;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadUitStorage(pad: string): Promise<Uint8Array> {
  const { data, error } = await db().storage.from(BUCKET).download(pad);
  if (error || !data) {
    throw new Error(`Bijlage ${pad} niet te lezen: ${error?.message ?? 'leeg'}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Routeert een inzending naar het juiste kanaal (§3) en levert precies wat de
 * parser nodig heeft. Eén prompt, één schema — alleen de invoer verschilt.
 */
export async function extraheer(inzending: Inzending): Promise<ParserInvoer> {
  const bron = bepaalBron(inzending);
  const bodyTekst = `${inzending.subject}\n\n${inzending.body}`.trim();
  const rawInput = JSON.stringify(
    {
      from: inzending.from,
      subject: inzending.subject,
      body: inzending.body,
      attachments: inzending.attachments.map((a) => a.path),
    },
    null,
    2,
  );

  if (bron === 'image') {
    const afbeeldingen = [];
    for (const bijlage of inzending.attachments.filter((a) =>
      a.mime.startsWith('image/'),
    )) {
      const bytes = await downloadUitStorage(bijlage.path);
      if (bytes.byteLength > MAX_AFBEELDING_BYTES) {
        throw new Error(
          `Foto ${bijlage.name || bijlage.path} is groter dan 5 MB. ` +
            'Stuur hem kleiner of maak een nieuwe foto.',
        );
      }
      afbeeldingen.push({
        mediaType: bijlage.mime,
        base64: Buffer.from(bytes).toString('base64'),
        path: bijlage.path,
      });
    }
    return { bron, tekst: bodyTekst, afbeeldingen, sourceUrl: null, rawInput };
  }

  if (bron === 'pdf') {
    const bijlage = inzending.attachments.find(
      (a) => a.mime === 'application/pdf',
    )!;
    const bytes = await downloadUitStorage(bijlage.path);
    const parser = new PDFParse({ data: bytes });
    try {
      const resultaat = await parser.getText();
      const tekst = resultaat.text.trim();
      if (!tekst) {
        throw new Error(
          'Geen tekst in de pdf gevonden — waarschijnlijk een scan. ' +
            'Stuur hem als foto, dan leest Claude hem als afbeelding.',
        );
      }
      return {
        bron,
        tekst: `${bodyTekst}\n\n${tekst}`.slice(0, MAX_TEKST),
        afbeeldingen: [],
        sourceUrl: null,
        rawInput,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (bron === 'url') {
    const url = vindUrl(bodyTekst)!;
    const html = await haalPagina(url);
    const gestructureerd = jsonLdRecept(html);
    const tekst = gestructureerd
      ? `schema.org-Recipe van ${url}:\n${gestructureerd}`
      : `Pagina ${url}:\n${htmlNaarTekst(html)}`;
    return {
      bron,
      tekst: tekst.slice(0, MAX_TEKST),
      afbeeldingen: [],
      sourceUrl: url,
      rawInput,
    };
  }

  // text en book: de mailbody is de invoer.
  return {
    bron,
    tekst: bodyTekst.slice(0, MAX_TEKST),
    afbeeldingen: [],
    sourceUrl: null,
    rawInput,
  };
}
