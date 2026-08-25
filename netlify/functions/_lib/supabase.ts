import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client: omzeilt RLS. Alleen server-side. De frontend gebruikt
 * de anon key en blijft binnen zijn eigen policies.
 */
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = vereist('SUPABASE_URL');
  const key = vereist('SUPABASE_SERVICE_ROLE_KEY');

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function vereist(naam: string): string {
  const waarde = process.env[naam];
  if (!waarde) {
    throw new Error(
      `Ontbrekende omgevingsvariabele ${naam}. Zie .env.example en SETUP.md.`,
    );
  }
  return waarde;
}

export const BUCKET = 'recipe-images';
