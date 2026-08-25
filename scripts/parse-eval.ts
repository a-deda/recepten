/**
 * Meet het faalpercentage van de parser op echte bronnen.
 *
 *   npm run parse-eval               # gebruikt scripts/testbronnen.txt
 *   npm run parse-eval -- mijn.txt   # of je eigen lijst
 *
 * Vereist ANTHROPIC_API_KEY. Raakt Supabase niet aan: de URL-route heeft
 * alleen het netwerk nodig.
 *
 * Doe dit vóór je de funnel vertrouwt (PRD §11). Een parser die op jouw tien
 * belangrijkste bronnen 60% haalt, is een ander product dan een parser die
 * 95% haalt — en dat wil je weten voordat je twintig recepten instuurt.
 */
import { readFileSync } from 'node:fs';
import { extraheer } from '../netlify/functions/_lib/extract.js';
import { parseer } from '../netlify/functions/_lib/parser.js';

const bestand = process.argv[2] ?? 'scripts/testbronnen.txt';

const urls = readFileSync(bestand, 'utf8')
  .split('\n')
  .map((r) => r.trim())
  .filter((r) => r.length > 0 && !r.startsWith('#'));

if (urls.length === 0) {
  console.error(`Geen URL's gevonden in ${bestand}.`);
  process.exit(1);
}

interface Uitkomst {
  url: string;
  ok: boolean;
  titel?: string;
  stappen?: number;
  ingredienten?: number;
  metTijden?: number;
  reden?: string;
  seconden: number;
}

const uitkomsten: Uitkomst[] = [];

for (const [i, url] of urls.entries()) {
  const start = Date.now();
  process.stdout.write(`[${i + 1}/${urls.length}] ${url} … `);
  try {
    const invoer = await extraheer({
      message_id: `eval-${i}`,
      from: 'eval@lokaal',
      subject: '',
      body: url,
      attachments: [],
    });
    const resultaat = await parseer(invoer);
    const seconden = (Date.now() - start) / 1000;

    if (!resultaat.is_recipe || resultaat.recipes.length === 0) {
      uitkomsten.push({
        url,
        ok: false,
        reden: resultaat.reason ?? 'geen recept herkend',
        seconden,
      });
      console.log(`GEEN RECEPT — ${resultaat.reason ?? '?'}`);
      continue;
    }

    const recept = resultaat.recipes[0];
    uitkomsten.push({
      url,
      ok: true,
      titel: recept.title,
      stappen: recept.steps.length,
      ingredienten: recept.ingredients.length,
      metTijden: recept.steps.filter((s) => s.minutes !== null).length,
      seconden,
    });
    console.log(
      `OK — "${recept.title}" (${recept.ingredients.length} ingr., ` +
        `${recept.steps.length} stappen, ${seconden.toFixed(1)}s)`,
    );
  } catch (fout) {
    const seconden = (Date.now() - start) / 1000;
    const reden = fout instanceof Error ? fout.message : String(fout);
    uitkomsten.push({ url, ok: false, reden, seconden });
    console.log(`FOUT — ${reden}`);
  }
}

const gelukt = uitkomsten.filter((u) => u.ok);
const percentage = Math.round((gelukt.length / uitkomsten.length) * 100);
const gemTijd =
  uitkomsten.reduce((s, u) => s + u.seconden, 0) / uitkomsten.length;
const zonderTijden = gelukt.filter((u) => (u.metTijden ?? 0) === 0);

console.log('\n─────────────────────────────────────────────');
console.log(`Gelukt:            ${gelukt.length}/${uitkomsten.length}  (${percentage}%)`);
console.log(`Gemiddelde tijd:   ${gemTijd.toFixed(1)}s per bron`);
console.log(`Zonder stap-tijden: ${zonderTijden.length} (die krijgen geen timer in kookmodus)`);

if (uitkomsten.some((u) => !u.ok)) {
  console.log('\nMislukt:');
  for (const u of uitkomsten.filter((x) => !x.ok)) {
    console.log(`  ${u.url}\n    ${u.reden}`);
  }
}

// Faalt de helft, dan is de funnel nog niet klaar om op te vertrouwen.
process.exit(percentage < 50 ? 1 : 0);
