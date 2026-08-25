/**
 * Stuurt een inzending naar /api/intake zonder Gmail ertussen — handig om de
 * pijplijn te testen voordat Apps Script draait.
 *
 *   netlify dev                                   # in een ander venster
 *   npm run send-test-intake -- "https://…/recept"
 *   npm run send-test-intake -- "Boek: Ottolenghi Simple, p. 142. Aubergine, yoghurt."
 *
 * Vereist INTAKE_SECRET en (optioneel) INTAKE_URL in je omgeving.
 */
const invoer = process.argv.slice(2).join(' ').trim();
if (!invoer) {
  console.error('Geef een URL of wat tekst mee.');
  process.exit(1);
}

const url = process.env.INTAKE_URL ?? 'http://localhost:8888/api/intake';
const geheim = process.env.INTAKE_SECRET;
if (!geheim) {
  console.error('INTAKE_SECRET ontbreekt.');
  process.exit(1);
}

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-intake-secret': geheim },
  body: JSON.stringify({
    message_id: `test-${Date.now()}`,
    from: 'test@lokaal',
    subject: 'Testinzending',
    body: invoer,
    attachments: [],
  }),
});

console.log(res.status, await res.text());
console.log(
  '\nPook nu de worker:\n' +
    `  curl -X POST -H "x-intake-secret: $INTAKE_SECRET" ${new URL(url).origin}/.netlify/functions/worker-background`,
);

export {};
