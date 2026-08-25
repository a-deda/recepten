import type { Ingredient, Stap } from './types';

/**
 * Ingrediënten en stappen worden als platte tekst bewerkt, niet als
 * velden-in-velden. Op een telefoon met één duim is één tekstvlak sneller dan
 * drie inputs per regel, en de heen-en-weervertaling is klein genoeg om
 * volledig te testen.
 */

const HOEVEELHEID = /^([\d.,/½¼¾⅓⅔-]+)\s*/;
const EENHEDEN = new Set([
  'g', 'gr', 'gram', 'kg', 'ml', 'cl', 'dl', 'l', 'liter',
  'el', 'tl', 'eetlepel', 'eetlepels', 'theelepel', 'theelepels',
  'snuf', 'snufje', 'teen', 'tenen', 'blik', 'blikje', 'bos', 'bosje',
  'stuk', 'stuks', 'plak', 'plakken', 'takje', 'takjes', 'pak', 'pakje',
]);

export function ingredientenNaarTekst(ingredienten: Ingredient[]): string {
  return ingredienten
    .map((ing) => {
      const links = [ing.qty, ing.unit, ing.item].filter(Boolean).join(' ');
      return ing.note ? `${links} — ${ing.note}` : links;
    })
    .join('\n');
}

export function tekstNaarIngredienten(tekst: string): Ingredient[] {
  return tekst
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel.length > 0)
    .map((regel) => {
      const [hoofd, ...restNotitie] = regel.split(/\s+—\s+|\s+-\s+/);
      const note = restNotitie.length > 0 ? restNotitie.join(' - ').trim() : null;

      let rest = hoofd.trim();
      let qty: string | null = null;
      let unit: string | null = null;

      const match = rest.match(HOEVEELHEID);
      if (match) {
        qty = match[1];
        rest = rest.slice(match[0].length).trim();

        const woorden = rest.split(/\s+/);
        if (woorden.length > 1 && EENHEDEN.has(woorden[0].toLowerCase())) {
          unit = woorden[0];
          rest = woorden.slice(1).join(' ');
        }
      }

      return { qty, unit, item: rest, note };
    });
}

const TIJD_ACHTERAAN = /\s*\((\d+)\s*min\.?\)\s*$/i;

export function stappenNaarTekst(stappen: Stap[]): string {
  return stappen
    .map((stap) => (stap.minutes !== null ? `${stap.text} (${stap.minutes} min)` : stap.text))
    .join('\n');
}

export function tekstNaarStappen(tekst: string): Stap[] {
  return tekst
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel.length > 0)
    .map((regel, i) => {
      const match = regel.match(TIJD_ACHTERAAN);
      // Genummerde regels ("1. Snijd de ui") mogen: het nummer komt uit de
      // volgorde, niet uit de tekst.
      const zonderNummer = (match ? regel.replace(TIJD_ACHTERAAN, '') : regel)
        .replace(/^\d+[.)]\s*/, '')
        .trim();
      return {
        n: i + 1,
        text: zonderNummer,
        minutes: match ? Number(match[1]) : null,
      };
    });
}
