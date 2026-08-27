import type { Config } from '@netlify/functions';
import { db, vereist, BUCKET } from './_lib/supabase.js';
import { geheimKlopt, json } from './_lib/auth.js';

/**
 * Brug tussen Apps Script en Supabase.
 *
 * Waarom deze bestaat: Supabase weigert een secret key bij verzoeken die op
 * een browser lijken ("Forbidden use of secret API key in browser"), en de
 * UrlFetchApp van Apps Script stuurt een User-Agent die daaronder valt — een
 * header die je daar niet mag overschrijven. De sleutel hoort dus niet in
 * Apps Script thuis, en staat nu alleen hier, server-side.
 *
 * Bijlagen gaan nog steeds NIET door deze function heen: Apps Script vraagt
 * een signed upload URL op en zet de bytes daar rechtstreeks neer. Daarmee
 * blijft de ~6 MB-grens op de request body omzeild, wat een randvoorwaarde is
 * en geen optimalisatie (§3).
 */
export default async function bridge(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Alleen POST' }, 405);
  if (!geheimKlopt(request.headers.get('x-intake-secret'))) {
    return json({ error: 'Onbevoegd' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Body is geen geldige JSON' }, 400);
  }

  try {
    switch (body.actie) {
      case 'upload-url':
        return await uploadUrl(body);
      case 'keep-alive':
        return await keepAlive();
      case 'te-melden':
        return await teMelden();
      case 'gemeld':
        return await gemeld(body);
      case 'export':
        return await exporteer(body);
      default:
        return json({ error: `Onbekende actie: ${String(body.actie)}` }, 400);
    }
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    console.error('bridge:', body.actie, melding);
    return json({ error: melding }, 500);
  }
}

/**
 * Geeft een eenmalige upload-URL terug. Apps Script hoeft daarvoor geen
 * Supabase-sleutel te kennen en ook de owner-uuid niet: het pad wordt hier
 * gebouwd, en de eerste map móét de owner zijn omdat de RLS-policy op
 * storage.objects daarop matcht.
 */
async function uploadUrl(body: Record<string, unknown>): Promise<Response> {
  const messageId = String(body.message_id ?? '').trim();
  const index = Number(body.index ?? 0);
  const extensie = String(body.extensie ?? '.jpg');

  if (!messageId) return json({ error: 'message_id ontbreekt' }, 400);

  // Alleen tekens die veilig in een pad passen; een Gmail-id is al beperkt,
  // maar de extensie komt uit een bestandsnaam van buiten.
  const veiligeExtensie = /^\.[a-z0-9]{1,5}$/i.test(extensie) ? extensie.toLowerCase() : '.bin';
  const pad = `${vereist('OWNER_ID')}/${messageId.replace(/[^\w-]/g, '')}-${index}${veiligeExtensie}`;

  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUploadUrl(pad, { upsert: true });

  if (error || !data) {
    throw new Error(`Upload-URL maken mislukte: ${error?.message ?? 'leeg antwoord'}`);
  }

  return json({ signedUrl: data.signedUrl, path: data.path });
}

/**
 * Houdt het gratis project uit de pauze (§9). Eén goedkope select telt als
 * API-activiteit.
 */
async function keepAlive(): Promise<Response> {
  const { count, error } = await db()
    .from('recipes')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return json({ ok: true, recepten: count ?? 0 });
}

/** Rijen die klaar of gefaald zijn en nog geen bevestigingsmail kregen. */
async function teMelden(): Promise<Response> {
  const { data, error } = await db()
    .from('intake_queue')
    .select('id, status, error, result, payload, message_id')
    .is('notified_at', null)
    .in('status', ['done', 'failed'])
    .limit(20);
  if (error) throw new Error(error.message);
  return json({ rijen: data ?? [] });
}

async function gemeld(body: Record<string, unknown>): Promise<Response> {
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) return json({ bijgewerkt: 0 });

  const { error } = await db()
    .from('intake_queue')
    .update({ notified_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(error.message);
  return json({ bijgewerkt: ids.length });
}

/** Alle recepten, gepagineerd, voor de wekelijkse backup naar Drive (§9). */
async function exporteer(body: Record<string, unknown>): Promise<Response> {
  const offset = Number(body.offset ?? 0);
  const limit = Math.min(Number(body.limit ?? 1000), 1000);

  const { data, error } = await db()
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  return json({ recepten: data ?? [], meer: (data ?? []).length === limit });
}

export const config: Config = { path: '/api/bridge' };
