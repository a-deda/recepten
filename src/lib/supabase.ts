import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt. Zie .env.example.',
  );
}

/**
 * Anon key in de browser is prima: RLS bepaalt wat je ziet, niet de sleutel.
 * De service-role key komt hier nooit.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const BUCKET = 'recipe-images';
