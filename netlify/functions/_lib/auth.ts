import { timingSafeEqual } from 'node:crypto';
import { vereist } from './supabase.js';

/**
 * Alle drie de endpoints staan publiek en delen één geheim met Apps Script.
 * Vergelijken gebeurt in constante tijd; lengte eerst, want timingSafeEqual
 * gooit bij ongelijke lengte.
 */
export function geheimKlopt(meegestuurd: string | null): boolean {
  if (!meegestuurd) return false;
  const verwacht = Buffer.from(vereist('INTAKE_SECRET'));
  const gekregen = Buffer.from(meegestuurd);
  return verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
