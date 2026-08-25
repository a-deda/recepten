import type { Stap } from './types';

export interface Segment {
  stap: number;
  minuten: number | null;
  /** Aandeel van de totale breedte, 0…1. Alle aandelen samen zijn 1. */
  aandeel: number;
}

/**
 * De kookklok (§13). De voortgangsbalk is geen rij gelijke bolletjes: de
 * breedte van elk segment weerspiegelt de duur van die stap. Hakken is smal,
 * een uur in de oven is breed.
 *
 * Zo zie je vóór je begint de vorm van het recept — waar de wachtmomenten
 * zitten en waar het druk wordt. Het encodeert iets waars over de inhoud in
 * plaats van alleen positie te tonen.
 *
 * Deze functie doet één ding: de verhouding. Ze kapt niets af, want een
 * plafond op de breedte zou een korte stap breder kunnen maken dan een lange
 * en precies de bewering omdraaien die de balk doet. Dat een segment van één
 * minuut naast een oven van een uur zichtbaar blijft, regelt de CSS met een
 * `min-width`; flexbox verdeelt de rest dan vanzelf.
 */
const BASIS_MINUTEN = 2;

export function berekenSegmenten(stappen: Stap[]): Segment[] {
  if (stappen.length === 0) return [];

  // Stappen zonder tijd krijgen een basisduur: een hakstap is echt korter dan
  // een sudderstap, maar niet oneindig kort.
  const gewichten = stappen.map((stap) => Math.max(stap.minutes ?? BASIS_MINUTEN, 1));
  const totaal = gewichten.reduce((som, g) => som + g, 0);

  return stappen.map((stap, i) => ({
    stap: stap.n,
    minuten: stap.minutes,
    aandeel: gewichten[i] / totaal,
  }));
}
