import { db, vereist } from './_lib/supabase.js';
import { geheimKlopt } from './_lib/auth.js';
import { extraheer } from './_lib/extract.js';
import { parseer } from './_lib/parser.js';
import { inzendingSchema, type Recept } from './_lib/types.js';

/**
 * Queue-verwerker (PRD §3). Draait als background function: Netlify antwoordt
 * de aanroeper meteen met 202 en geeft deze code tot 15 minuten. Daarmee is de
 * 10 seconden-limiet geen risico meer, ook niet bij een keukenfoto.
 *
 * Apps Script pookt deze endpoint na elke intake. Er is geen tweede planner:
 * de trigger die er toch al elke minuut is, doet dit erbij.
 */

/** Bovengrens per run. Voorkomt dat één run 15 minuten volloopt. */
const MAX_RIJEN_PER_RUN = 25;
const BATCH = 3;

interface QueueRij {
  id: string;
  payload: unknown;
}

export default async function worker(request: Request): Promise<Response> {
  if (!geheimKlopt(request.headers.get('x-intake-secret'))) {
    return new Response('Onbevoegd', { status: 401 });
  }

  let verwerkt = 0;
  while (verwerkt < MAX_RIJEN_PER_RUN) {
    const rijen = await claim(BATCH);
    if (rijen.length === 0) break;

    // Rijen binnen een batch parallel: elke rij wacht vooral op het netwerk.
    await Promise.all(rijen.map((rij) => verwerkRij(rij)));
    verwerkt += rijen.length;
  }

  console.log(`worker: ${verwerkt} inzending(en) verwerkt`);
  return new Response(JSON.stringify({ verwerkt }), {
    headers: { 'content-type': 'application/json' },
  });
}

async function claim(batch: number): Promise<QueueRij[]> {
  const { data, error } = await db().rpc('claim_intake', { p_batch: batch });
  if (error) throw new Error(`claim_intake mislukte: ${error.message}`);
  return (data ?? []) as QueueRij[];
}

async function verwerkRij(rij: QueueRij): Promise<void> {
  try {
    const inzending = inzendingSchema.parse(rij.payload);
    const invoer = await extraheer(inzending);
    const resultaat = await parseer(invoer);

    if (!resultaat.is_recipe || resultaat.recipes.length === 0) {
      await faal(
        rij.id,
        resultaat.reason ?? 'Claude herkende hier geen recept in.',
      );
      return;
    }

    // Meerdere recepten in één mail worden losse rijen (§12, open punt 2).
    const ids: string[] = [];
    const titels: string[] = [];
    for (const recept of resultaat.recipes) {
      const id = await bewaarRecept(recept, invoer);
      ids.push(id);
      titels.push(recept.title);
    }

    await db()
      .from('intake_queue')
      .update({
        status: 'done',
        error: null,
        recipe_id: ids[0],
        result: { titles: titels },
      })
      .eq('id', rij.id);
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    console.error(`worker: rij ${rij.id} mislukt:`, melding);
    await faal(rij.id, melding);
  }
}

/**
 * Gefaalde rijen blijven staan (§12, open punt 3). Ze zijn de basis voor een
 * herkansing zodra de prompt beter is — de payload met de ruwe input zit er
 * nog in.
 */
async function faal(id: string, reden: string): Promise<void> {
  await db()
    .from('intake_queue')
    .update({ status: 'failed', error: reden.slice(0, 2000) })
    .eq('id', id);
}

async function bewaarRecept(
  recept: Recept,
  invoer: Awaited<ReturnType<typeof extraheer>>,
): Promise<string> {
  const { data, error } = await db()
    .from('recipes')
    .insert({
      owner_id: vereist('OWNER_ID'),
      status: 'inbox', // Niets komt direct in de bibliotheek (§6).
      title: recept.title,
      summary: recept.summary,
      ingredients: recept.ingredients,
      steps: hernummer(recept.steps),
      servings: recept.servings,
      total_minutes: recept.total_minutes ?? somMinuten(recept.steps),
      source_type: invoer.bron,
      source_url: recept.source_url ?? invoer.sourceUrl,
      source_book: recept.source_book,
      image_path: invoer.afbeeldingen[0]?.path ?? null,
      // Altijd bewaren: als de prompt over drie maanden beter is, kun je
      // herparsen zonder de bron opnieuw te zoeken (§4).
      raw_input: invoer.rawInput,
      language: recept.language,
      parse_notes: recept.parse_notes,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Recept "${recept.title}" opslaan mislukte: ${error.message}`);
  }
  return data.id as string;
}

/** Stapnummers sluitend maken; Claude telt af en toe door of slaat over. */
function hernummer(steps: Recept['steps']): Recept['steps'] {
  return steps.map((stap, i) => ({ ...stap, n: i + 1 }));
}

function somMinuten(steps: Recept['steps']): number | null {
  const totaal = steps.reduce((som, stap) => som + (stap.minutes ?? 0), 0);
  return totaal > 0 ? totaal : null;
}
