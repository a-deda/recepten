import { randomUUID } from 'node:crypto';
import type { Config } from '@netlify/functions';
import { db, vereist } from './_lib/supabase.js';
import { json } from './_lib/auth.js';
import { inzendingSchema } from './_lib/types.js';

/**
 * Inzendingen vanuit de app zelf (naast de mailroute).
 *
 * Deze endpoint werkt NIET op het gedeelde geheim: dat hoort niet in een
 * browserbundel. Hij verifieert het Supabase-token van je inlogsessie, en
 * accepteert alleen de eigenaar — het is een app voor één gebruiker, dus een
 * willekeurige andere Supabase-gebruiker heeft hier niets te zoeken.
 *
 * Verder komt een inzending in exact dezelfde queue terecht als een mail, en
 * gaat door dezelfde parser. Eén pijplijn, twee ingangen.
 */
export default async function submit(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Alleen POST' }, 405);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Niet ingelogd' }, 401);

  const { data: gebruiker, error: authFout } = await db().auth.getUser(token);
  if (authFout || !gebruiker.user) return json({ error: 'Sessie ongeldig' }, 401);
  if (gebruiker.user.id !== vereist('OWNER_ID')) {
    return json({ error: 'Geen toegang' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Body is geen geldige JSON' }, 400);
  }

  try {
    return body.actie === 'status'
      ? await status(body)
      : await nieuweInzending(body, gebruiker.user.email ?? 'app');
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    console.error('submit:', melding);
    return json({ error: melding }, 500);
  }
}

async function nieuweInzending(
  body: Record<string, unknown>,
  email: string,
): Promise<Response> {
  const tekst = String(body.tekst ?? '').trim();
  const bijlagen = Array.isArray(body.attachments) ? body.attachments : [];

  if (!tekst && bijlagen.length === 0) {
    return json({ error: 'Geef een link, wat tekst, of een bestand mee.' }, 400);
  }

  // Hergebruikt het schema van de mailroute, zodat beide ingangen gegarandeerd
  // dezelfde vorm in de queue leggen.
  const parsed = inzendingSchema.safeParse({
    message_id: `app-${randomUUID()}`,
    from: email,
    subject: 'Toegevoegd in de app',
    body: tekst,
    attachments: bijlagen,
  });
  if (!parsed.success) {
    return json({ error: 'Ongeldige inzending', details: parsed.error.issues }, 400);
  }

  const { data, error } = await db()
    .from('intake_queue')
    // notified_at meteen zetten: bij een inzending uit de app zie je de
    // uitkomst op je scherm, dus een bevestigingsmail is dubbelop.
    .insert({
      message_id: parsed.data.message_id,
      payload: parsed.data,
      status: 'pending',
      notified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  await pookWorker();
  return json({ id: data.id });
}

async function status(body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? '');
  if (!id) return json({ error: 'id ontbreekt' }, 400);

  const { data, error } = await db()
    .from('intake_queue')
    .select('status, error, result, recipe_id')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return json(data);
}

/**
 * De worker draait als background function; deze aanroep wacht niet op het
 * werk. De frontend polt daarna op de status.
 */
async function pookWorker(): Promise<void> {
  const basis = process.env.URL ?? process.env.DEPLOY_URL;
  if (!basis) {
    console.error('submit: geen site-URL bekend, worker niet gepookt');
    return;
  }

  try {
    await fetch(`${basis}/.netlify/functions/worker-background`, {
      method: 'POST',
      headers: { 'x-intake-secret': vereist('INTAKE_SECRET') },
    });
  } catch (fout) {
    // Niet fataal: de minuut-trigger van Apps Script pookt hem alsnog.
    console.error('submit: worker pokén mislukt', fout);
  }
}

export const config: Config = { path: '/api/submit' };
