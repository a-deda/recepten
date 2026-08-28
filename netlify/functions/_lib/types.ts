import { z } from 'zod';

/** Wat Apps Script naar /api/intake stuurt. */
export const inzendingSchema = z.object({
  /** Gmail-message-id; maakt een retry idempotent. */
  message_id: z.string().min(1),
  from: z.string().default(''),
  reply_to: z.string().optional(),
  subject: z.string().default(''),
  body: z.string().default(''),
  attachments: z
    .array(
      z.object({
        /** Pad in de Storage-bucket recipe-images. */
        path: z.string().min(1),
        mime: z.string().default('application/octet-stream'),
        name: z.string().default(''),
      }),
    )
    .default([]),
});

export type Inzending = z.infer<typeof inzendingSchema>;

/** Eén ingrediëntregel. Alles behalve `item` mag ontbreken (§5: niets verzinnen). */
export const ingredientSchema = z.object({
  qty: z.string().nullable(),
  unit: z.string().nullable(),
  item: z.string(),
  note: z.string().nullable(),
});

export const stepSchema = z.object({
  n: z.number().int().positive(),
  text: z.string(),
  /** Tijd uit de staptekst, voor de timers in kookmodus. */
  minutes: z.number().int().positive().nullable(),
});

export const receptSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullable(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
  servings: z.number().int().positive().nullable(),
  total_minutes: z.number().int().positive().nullable(),
  source_url: z.string().nullable(),
  source_book: z.string().nullable(),
  language: z.string().default('nl'),
  parse_notes: z.string().nullable(),
});

export type Recept = z.infer<typeof receptSchema>;

/**
 * Het antwoord van de parser. `is_recipe: false` is geen randgeval maar de
 * kern van §5: een doorgestuurde nieuwsbrief of een pagina achter een
 * cookiemuur moet als mislukking terugkomen, niet als leeg recept.
 */
export const parseResultaatSchema = z.object({
  is_recipe: z.boolean(),
  reason: z.string().nullable(),
  recipes: z.array(receptSchema),
});

export type ParseResultaat = z.infer<typeof parseResultaatSchema>;

export type BronType = 'url' | 'image' | 'pdf' | 'text' | 'book';

/** Wat de router uit een inzending haalt en aan de parser voert. */
export interface ParserInvoer {
  bron: BronType;
  /** Tekst die de parser moet lezen (leeg bij een pure afbeelding). */
  tekst: string;
  /** Afbeeldingen als base64, voor de vision-route. */
  afbeeldingen: Array<{ mediaType: string; base64: string; path: string }>;
  /** Pdf's als base64. Claude leest die zelf, inclusief opmaak en scans. */
  documenten: Array<{ base64: string; path: string; naam: string }>;
  sourceUrl: string | null;
  /** Precies wat er binnenkwam — gaat onbewerkt in raw_input. */
  rawInput: string;
}
