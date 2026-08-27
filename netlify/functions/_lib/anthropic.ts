import Anthropic from '@anthropic-ai/sdk';
import { vereist } from './supabase.js';

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: vereist('ANTHROPIC_API_KEY') });
  }
  return client;
}

/**
 * Eén plek voor het model, zodat je het kunt wisselen zonder de parser aan te
 * raken. Override met de env-variabele ANTHROPIC_MODEL.
 *
 * Sonnet 5 kost bij 240 recepten per jaar ongeveer $3 tegen $7-15 voor Opus 5
 * — en het hele speelveld van beschikbare modellen is maar zeven euro per jaar
 * breed. Parsen is bovendien mechanisch werk met een afgedwongen schema, niet
 * het soort taak waar het duurste model zich terugverdient. Blijkt Sonnet op
 * jouw bronnen tekort te schieten, dan is `npm run parse-eval` de manier om
 * dat te zien en niet je onderbuik.
 */
export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

/**
 * Parsen is mechanisch werk: lage effort houdt het snel en goedkoop. Bij
 * afbeeldingen ligt de lat hoger (schuine foto's, slechte belichting).
 */
export function effortVoor(bron: string): 'low' | 'medium' {
  return bron === 'image' || bron === 'pdf' ? 'medium' : 'low';
}
