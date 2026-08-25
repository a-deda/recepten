import { describe, expect, it } from 'vitest';
import { berekenSegmenten } from '../../src/lib/kookklok';
import type { Stap } from '../../src/lib/types';

function stap(n: number, minutes: number | null): Stap {
  return { n, text: `stap ${n}`, minutes };
}

describe('kookklok', () => {
  it('geeft segmenten waarvan de breedte de duur volgt', () => {
    const segmenten = berekenSegmenten([stap(1, 5), stap(2, 10)]);
    // Tien minuten hoort twee keer zo breed te zijn als vijf. Dit is de hele
    // bewering die de balk doet; gaat dit stuk, dan liegt hij.
    expect(segmenten[1].aandeel / segmenten[0].aandeel).toBeCloseTo(2, 5);
  });

  it('houdt de volgorde van breed en smal intact bij grote verschillen', () => {
    const segmenten = berekenSegmenten([stap(1, 2), stap(2, 3), stap(3, 60), stap(4, 2)]);
    expect(segmenten[2].aandeel).toBeGreaterThan(segmenten[1].aandeel);
    expect(segmenten[1].aandeel).toBeGreaterThan(segmenten[0].aandeel);
    expect(segmenten[0].aandeel).toBeCloseTo(segmenten[3].aandeel, 10);
  });

  it('telt op tot precies de volle breedte', () => {
    const segmenten = berekenSegmenten([stap(1, 3), stap(2, null), stap(3, 45)]);
    const som = segmenten.reduce((s, seg) => s + seg.aandeel, 0);
    expect(som).toBeCloseTo(1, 10);
  });

  it('geeft stappen zonder tijd een basisduur in plaats van niets', () => {
    const segmenten = berekenSegmenten([stap(1, null), stap(2, null)]);
    expect(segmenten[0].aandeel).toBeCloseTo(0.5, 10);
  });

  it('behandelt een stap van nul minuten als minstens één minuut', () => {
    const segmenten = berekenSegmenten([stap(1, 0), stap(2, 1)]);
    expect(segmenten[0].aandeel).toBeCloseTo(segmenten[1].aandeel, 10);
  });

  it('kan met een leeg recept om', () => {
    expect(berekenSegmenten([])).toEqual([]);
  });
});
