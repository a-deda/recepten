import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, BUCKET } from './supabase';
import { bestandExtensie, verkleinIndienNodig } from './afbeelding';
import {
  KAART_KOLOMMEN,
  VOLLEDIGE_KOLOMMEN,
  type Recept,
  type ReceptKaart,
  type ReceptStatus,
} from './types';

/**
 * Zoeken over titel + samenvatting + ingrediënten (§7). Eén veld, geen
 * filters, geen tags. Schiet zoeken na vier weken tekort, dán is dat het
 * signaal voor semantisch zoeken.
 */
export function useRecepten(zoekterm: string, status: ReceptStatus = 'library') {
  return useQuery({
    queryKey: ['recepten', status, zoekterm],
    // De lijst moet binnen 300 ms staan: houd de vorige lijst zichtbaar
    // terwijl een nieuwe zoekterm laadt, in plaats van te flitsen.
    placeholderData: (vorige) => vorige,
    staleTime: 30_000,
    queryFn: async (): Promise<ReceptKaart[]> => {
      let query = supabase
        .from('recipes')
        .select(KAART_KOLOMMEN)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(200);

      const term = zoekterm.trim();
      if (term.length > 0) {
        query = query.textSearch('search_tsv', term, {
          type: 'websearch',
          config: 'dutch',
        });
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ReceptKaart[];
    },
  });
}

/** Teller "3 nieuw" bovenaan het overzicht (§6). */
export function useInboxAantal() {
  return useQuery({
    queryKey: ['inbox-aantal'],
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'inbox');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useRecept(id: string | undefined) {
  return useQuery({
    queryKey: ['recept', id],
    enabled: Boolean(id),
    staleTime: 30_000,
    queryFn: async (): Promise<Recept> => {
      const { data, error } = await supabase
        .from('recipes')
        .select(VOLLEDIGE_KOLOMMEN)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as Recept;
    },
  });
}

export function useZetStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReceptStatus }) => {
      const { error } = await supabase.from('recipes').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recepten'] });
      void client.invalidateQueries({ queryKey: ['inbox-aantal'] });
    },
  });
}

export function useBewaarRecept() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, velden }: { id?: string; velden: Partial<Recept> }) => {
      if (id) {
        const { data, error } = await supabase
          .from('recipes')
          .update(velden)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        return data.id as string;
      }

      const { data: sessie } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('recipes')
        .insert({ ...velden, owner_id: sessie.user?.id })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void client.invalidateQueries({ queryKey: ['recepten'] });
      void client.invalidateQueries({ queryKey: ['recept', id] });
      void client.invalidateQueries({ queryKey: ['inbox-aantal'] });
    },
  });
}

/**
 * Eén round-trip aan het eind van kookmodus: last_cooked, cook_count én de
 * notitie in één keer. Die notitie is het punt (§8 regel 4).
 */
export function useGekookt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notitie }: { id: string; notitie: string }) => {
      const { error } = await supabase.rpc('mark_cooked', {
        p_recipe: id,
        p_note: notitie.trim() === '' ? null : notitie,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variabelen) => {
      void client.invalidateQueries({ queryKey: ['recept', variabelen.id] });
      void client.invalidateQueries({ queryKey: ['recepten'] });
    },
  });
}

/** Private bucket: de foto komt via een tijdelijke, ondertekende URL binnen. */
export function useAfbeelding(pad: string | null | undefined) {
  return useQuery({
    queryKey: ['afbeelding', pad],
    enabled: Boolean(pad),
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(pad!, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });
}

// ---------------------------------------------------------------------------
// Toevoegen vanuit de app (naast de mailroute)
// ---------------------------------------------------------------------------

export interface InzendingStatus {
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  result: { titles?: string[] } | null;
  recipe_id: string | null;
}

async function metSessie(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Je sessie is verlopen. Log opnieuw in.');
  return token;
}

async function roepSubmit<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await metSessie()}`,
    },
    body: JSON.stringify(body),
  });

  const antwoord = await res.json();
  if (!res.ok) throw new Error(antwoord.error ?? `Server gaf ${res.status}`);
  return antwoord as T;
}

/**
 * Bestanden gaan rechtstreeks van de browser naar Storage, niet door een
 * function heen: die accepteert ~6 MB en een telefoonfoto komt daaroverheen.
 * Daarna gaat alleen het pad mee naar /api/submit — dezelfde vorm als de
 * mailroute gebruikt.
 */
export function useToevoegen() {
  return useMutation({
    mutationFn: async ({
      tekst,
      bestanden,
    }: {
      tekst: string;
      bestanden: File[];
    }): Promise<string> => {
      const { data: sessie } = await supabase.auth.getUser();
      const uid = sessie.user?.id;
      if (!uid) throw new Error('Je sessie is verlopen. Log opnieuw in.');

      const attachments = [];
      for (const ruw of bestanden) {
        const bestand = await verkleinIndienNodig(ruw);
        const pad = `${uid}/${crypto.randomUUID()}${bestandExtensie(bestand)}`;

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(pad, bestand, { contentType: bestand.type });

        if (error) {
          // Een kale RLS-melding zegt niet wélke policy ontbreekt. Deze is in
          // de praktijk altijd dezelfde: het insert-recht op je eigen map.
          const rls = /row-level security|violates.*policy/i.test(error.message);
          throw new Error(
            rls
              ? `Uploaden van ${ruw.name} mag niet. Draai migratie ` +
                '0005_storage_upload.sql in de Supabase SQL Editor — die geeft ' +
                'de app schrijfrecht op je eigen map in Storage.'
              : `Uploaden van ${ruw.name} mislukte: ${error.message}`,
          );
        }

        attachments.push({ path: pad, mime: bestand.type, name: ruw.name });
      }

      const { id } = await roepSubmit<{ id: string }>({ tekst, attachments });
      return id;
    },
  });
}

/**
 * Polt tot de worker klaar is. In de app krijg je geen bevestigingsmail, dus
 * de uitkomst — inclusief de reden bij een mislukking — moet hier op je scherm
 * verschijnen.
 */
export function useInzendingStatus(id: string | null) {
  const client = useQueryClient();

  return useQuery({
    queryKey: ['inzending', id],
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'failed' ? false : 2000;
    },
    queryFn: async (): Promise<InzendingStatus> => {
      const antwoord = await roepSubmit<InzendingStatus>({ actie: 'status', id });
      if (antwoord.status === 'done') {
        void client.invalidateQueries({ queryKey: ['recepten'] });
        void client.invalidateQueries({ queryKey: ['inbox-aantal'] });
      }
      return antwoord;
    },
  });
}
