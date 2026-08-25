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
 * raken. Kosten per import blijven centen op dit volume (§3).
 */
export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

/**
 * Parsen is mechanisch werk: lage effort houdt het snel en goedkoop. Bij
 * afbeeldingen ligt de lat hoger (schuine foto's, slechte belichting).
 */
export function effortVoor(bron: string): 'low' | 'medium' {
  return bron === 'image' || bron === 'pdf' ? 'medium' : 'low';
}
