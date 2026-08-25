export type ReceptStatus = 'inbox' | 'library' | 'discarded';
export type BronType = 'url' | 'image' | 'pdf' | 'text' | 'book';

export interface Ingredient {
  qty: string | null;
  unit: string | null;
  item: string;
  note: string | null;
}

export interface Stap {
  n: number;
  text: string;
  minutes: number | null;
}

/** Wat de lijst nodig heeft — bewust smal, zodat het overzicht snel staat. */
export interface ReceptKaart {
  id: string;
  title: string;
  status: ReceptStatus;
  source_type: BronType | null;
  total_minutes: number | null;
  last_cooked: string | null;
  cook_count: number;
  created_at: string;
}

export interface Recept extends ReceptKaart {
  summary: string | null;
  ingredients: Ingredient[];
  steps: Stap[];
  servings: number | null;
  source_url: string | null;
  source_book: string | null;
  image_path: string | null;
  language: string | null;
  parse_notes: string | null;
  notes: string | null;
}

export const KAART_KOLOMMEN =
  'id, title, status, source_type, total_minutes, last_cooked, cook_count, created_at';

export const VOLLEDIGE_KOLOMMEN = `${KAART_KOLOMMEN}, summary, ingredients, steps, servings, source_url, source_book, image_path, language, parse_notes, notes`;
