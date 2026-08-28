import Anthropic from '@anthropic-ai/sdk';
import { claude, MODEL, effortVoor } from './anthropic.js';
import { parseResultaatSchema, type ParseResultaat, type ParserInvoer } from './types.js';

/**
 * Parser-contract (PRD §5). Eén prompt, één schema, ongeacht de bron —
 * geen site-specifieke scrapers die verjaren.
 */
const SYSTEEM = `Je zet ruwe input om naar gestructureerde recepten voor een persoonlijke receptenbak.

Regels:
- Geef je antwoord uitsluitend via de tool verwerk_inzending. Geen toelichting daarbuiten.
- Vertaal titel, samenvatting, ingrediënten en stappen naar natuurlijk Nederlands, ook als de bron een andere taal heeft.
- Reken hoeveelheden NIET om. Laat "qty" exact staan zoals in de bron. Een Amerikaanse cup is geen Nederlandse kop en 350 °F is geen 180 °C — omrekenen is een aparte bewerking waar fouten in sluipen. Staat er een niet-metrische eenheid, laat die dan onvertaald staan ("cup", "oz", "tbsp") en noteer in "parse_notes" dat het recept niet-metrische maten gebruikt.
- Behoud gerechtsnamen en termen die geen gangbare Nederlandse tegenhanger hebben: "ragù alla bolognese" blijft staan, "shakshuka" blijft staan. Vertaal geen eigennamen.
- Twijfel je over de Nederlandse naam van een ingrediënt, zet dan de Nederlandse naam neer die je het meest waarschijnlijk acht en noteer de brontekst in "parse_notes". Gok nooit stilzwijgend.
- Zet in "language" de taal van de BRON (ISO-code, bijvoorbeeld "nl" of "en"), niet de taal van je antwoord. Zo blijft zichtbaar dat er vertaald is.
- Verzin geen hoeveelheden. Ontbreekt een hoeveelheid of eenheid, laat "qty" of "unit" leeg (null).
- Splits samengestelde stappen in genummerde losse handelingen. Eén handeling per stap.
- Houd stappen kort genoeg om op één telefoonscherm te passen: maximaal ongeveer 220 tekens. Is een stap langer, splits hem.
- Herken tijden in stapteksten en zet het aantal minuten in "minutes" (voor de timers in kookmodus). Geen tijd genoemd? null.
- Twijfel je ergens over, schrijf dat in "parse_notes" in plaats van te gokken.
- Is dit geen recept (een nieuwsbrief, een cookiemuur, een loginpagina, een lege of onleesbare pagina), zet dan "is_recipe" op false met een korte, concrete reden in "reason" en laat "recipes" leeg. Een leeg of half recept teruggeven is fout: liever een duidelijke mislukking.
- Staan er meerdere recepten in de input, geef dan meerdere items in "recipes".

Kookboekverwijzing: bestaat de input alleen uit een boektitel, een paginanummer en wat hoofdingrediënten, dan is dat een geldig recept. Vul "source_book" ("Ottolenghi Simple, p. 142"), zet de ingrediënten die genoemd worden in "ingredients" en laat "steps" leeg. Dat is geen mislukking.`;

const RECEPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'summary',
    'ingredients',
    'steps',
    'servings',
    'total_minutes',
    'source_url',
    'source_book',
    'language',
    'parse_notes',
  ],
  properties: {
    title: { type: 'string', description: 'Titel van het gerecht in de brontaal.' },
    summary: {
      type: ['string', 'null'],
      description: 'Eén zin: wat is dit gerecht. Null als de bron niets zegt.',
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['qty', 'unit', 'item', 'note'],
        properties: {
          qty: { type: ['string', 'null'], description: 'Bijvoorbeeld "250" of "1/2".' },
          unit: { type: ['string', 'null'], description: 'Bijvoorbeeld "g", "el", "blik".' },
          item: { type: 'string' },
          note: { type: ['string', 'null'], description: 'Bijvoorbeeld "fijngesneden".' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'text', 'minutes'],
        properties: {
          n: { type: 'integer', description: 'Stapnummer, begint bij 1.' },
          text: { type: 'string' },
          minutes: {
            type: ['integer', 'null'],
            description: 'Aantal minuten dat deze stap duurt, als de tekst dat noemt.',
          },
        },
      },
    },
    servings: { type: ['integer', 'null'] },
    total_minutes: { type: ['integer', 'null'] },
    source_url: { type: ['string', 'null'] },
    source_book: { type: ['string', 'null'], description: '"Ottolenghi Simple, p. 142"' },
    language: { type: 'string' },
    parse_notes: { type: ['string', 'null'] },
  },
} as const;

const TOOL: Anthropic.Beta.BetaTool = {
  name: 'verwerk_inzending',
  description: 'Levert de geparste recepten, of meldt dat dit geen recept is.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_recipe', 'reason', 'recipes'],
    properties: {
      is_recipe: { type: 'boolean' },
      reason: {
        type: ['string', 'null'],
        description: 'Bij is_recipe=false: waarom niet. Anders null.',
      },
      recipes: { type: 'array', items: RECEPT_SCHEMA },
    },
  },
};

function bouwBericht(invoer: ParserInvoer): Anthropic.Beta.BetaMessageParam {
  const blokken: Anthropic.Beta.BetaContentBlockParam[] = [];

  // Pdf's gaan als document naar Claude: hij leest ze zelf, met opmaak, en
  // een scan zonder tekstlaag werkt daardoor net zo goed als een digitale pdf.
  for (const document of invoer.documenten) {
    blokken.push({
      type: 'document',
      title: document.naam,
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: document.base64,
      },
    });
  }

  for (const afbeelding of invoer.afbeeldingen) {
    blokken.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: afbeelding.mediaType as 'image/jpeg',
        data: afbeelding.base64,
      },
    });
  }

  const context = [
    `Brontype: ${invoer.bron}.`,
    invoer.sourceUrl ? `Bron-URL: ${invoer.sourceUrl}` : null,
    invoer.afbeeldingen.length > 0
      ? 'De foto hierboven is de bron; de tekst eronder is wat de afzender erbij schreef.'
      : null,
    invoer.documenten.length > 0
      ? 'De pdf hierboven is de bron; de tekst eronder is wat de afzender erbij schreef.'
      : null,
    '',
    invoer.tekst || '(geen begeleidende tekst)',
  ]
    .filter((r) => r !== null)
    .join('\n');

  blokken.push({ type: 'text', text: context });
  return { role: 'user', content: blokken };
}

function leesToolResultaat(bericht: Anthropic.Beta.BetaMessage): unknown {
  for (const blok of bericht.content) {
    if (blok.type === 'tool_use' && blok.name === TOOL.name) {
      // Tool-invoer altijd als geparste JSON behandelen, nooit als string
      // matchen: de escaping kan per model verschillen.
      return blok.input;
    }
  }
  throw new Error(
    'Claude gaf geen gestructureerd antwoord terug. Probeer de inzending opnieuw.',
  );
}

/** Eén parse-ronde. Gooit bij een API- of schemafout. */
async function parseerEenmaal(invoer: ParserInvoer, extraHint?: string): Promise<ParseResultaat> {
  const berichten: Anthropic.Beta.BetaMessageParam[] = [bouwBericht(invoer)];
  if (extraHint) {
    berichten.push({ role: 'user', content: extraHint });
  }

  const antwoord = await roepAan({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEEM,
    output_config: { effort: effortVoor(invoer.bron) },
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: berichten,
  });

  if (antwoord.stop_reason === 'refusal') {
    throw new Error(
      `Claude weigerde deze inzending te verwerken (${antwoord.stop_details?.category ?? 'onbekend'}).`,
    );
  }

  return parseResultaatSchema.parse(leesToolResultaat(antwoord));
}

/**
 * Roept Claude aan met server-side fallback bij een weigering. Weigert de API
 * de beta-vlag, dan valt hij terug op een gewone call — de parser is te
 * belangrijk om te laten struikelen over een optionele feature.
 */
async function roepAan(
  params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'betas'>,
): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await claude().beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (fout) {
    if (fout instanceof Anthropic.BadRequestError) {
      return await claude().beta.messages.create(params);
    }
    throw fout;
  }
}

/**
 * Parseert een inzending. Bij een schemafout krijgt Claude één herkansing met
 * de validatiefout erbij; daarna faalt de inzending zichtbaar in de queue.
 */
export async function parseer(invoer: ParserInvoer): Promise<ParseResultaat> {
  try {
    return await parseerEenmaal(invoer);
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    if (fout instanceof Anthropic.APIError) throw fout;
    return await parseerEenmaal(
      invoer,
      `Je vorige antwoord voldeed niet aan het schema (${melding}). ` +
        'Geef het opnieuw, exact volgens de tool.',
    );
  }
}

export const _test = { SYSTEEM, TOOL, bouwBericht, leesToolResultaat };
