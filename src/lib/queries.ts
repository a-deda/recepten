import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, BUCKET } from './supabase';
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
