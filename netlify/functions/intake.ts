import { timingSafeEqual } from 'node:crypto';
import type { Config } from '@netlify/functions';
import { db, vereist } from './_lib/supabase.js';
import { inzendingSchema } from './_lib/types.js';

/**
 * Intake (PRD §3). Deze endpoint doet zo min mogelijk: geheim controleren,
 * de rauwe inzending wegschrijven met status `pending`, en meteen 200
 * antwoorden. Al het trage werk (fetch, Claude, vision) gebeurt in de worker.
 * Zo kan een grote foto de 10 seconden-limiet niet meer opblazen — de meest
 * waarschijnlijke stille storing uit de PRD.
 */
export default async function intake(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Alleen POST' }, 405);
  }
  if (!geheimKlopt(request.headers.get('x-intake-secret'))) {
    return json({ error: 'Onbevoegd' }, 401);
  }

  let ruw: unknown;
  try {
    ruw = await request.json();
  } catch {
    return json({ error: 'Body is geen geldige JSON' }, 400);
  }

  const parsed = inzendingSchema.safeParse(ruw);
  if (!parsed.success) {
    return json({ error: 'Ongeldige inzending', details: parsed.error.issues }, 400);
  }
  const inzending = parsed.data;

  const { data, error } = await db()
    .from('intake_queue')
    .insert({ message_id: inzending.message_id, payload: inzending, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique violation op message_id. Apps Script heeft deze mail al
    // eerder ingestuurd (bijvoorbeeld na een timeout). Dat is geen fout:
    // geef dezelfde rij terug zodat een retry nooit dubbel parseert.
    if (error.code === '23505') {
      const { data: bestaand } = await db()
        .from('intake_queue')
        .select('id, status')
        .eq('message_id', inzending.message_id)
        .single();
      return json({ id: bestaand?.id ?? null, duplicate: true, status: bestaand?.status });
    }
    console.error('intake: insert mislukt', error);
    return json({ error: 'Wegschrijven mislukt' }, 500);
  }

  return json({ id: data.id, duplicate: false });
}

function geheimKlopt(meegestuurd: string | null): boolean {
  if (!meegestuurd) return false;
  const verwacht = Buffer.from(vereist('INTAKE_SECRET'));
  const gekregen = Buffer.from(meegestuurd);
  // Lengte eerst: timingSafeEqual gooit bij ongelijke lengte.
  return (
    verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen)
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config: Config = { path: '/api/intake' };
