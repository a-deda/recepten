import { describe, expect, it } from 'vitest';
import {
  ingredientenNaarTekst,
  stappenNaarTekst,
  tekstNaarIngredienten,
  tekstNaarStappen,
} from '../../src/lib/receptTekst';

describe('ingrediënten heen en weer', () => {
  it('splitst hoeveelheid, eenheid, item en notitie', () => {
    const [regel] = tekstNaarIngredienten('250 g bloem — gezeefd');
    expect(regel).toEqual({ qty: '250', unit: 'g', item: 'bloem', note: 'gezeefd' });
  });

  it('laat qty leeg als er geen hoeveelheid staat', () => {
    const [regel] = tekstNaarIngredienten('peper');
    expect(regel.qty).toBeNull();
    expect(regel.item).toBe('peper');
  });

  it('ziet een woord dat geen eenheid is niet aan voor een eenheid', () => {
    const [regel] = tekstNaarIngredienten('2 rode uien');
    expect(regel.unit).toBeNull();
    expect(regel.item).toBe('rode uien');
  });

  it('overleeft een rondje heen en weer', () => {
    const tekst = '250 g bloem — gezeefd\n2 eieren\n1 snuf zout';
    expect(ingredientenNaarTekst(tekstNaarIngredienten(tekst))).toBe(tekst);
  });
});

describe('stappen heen en weer', () => {
  it('haalt de tijd uit de regel', () => {
    const [stap] = tekstNaarStappen('Bak de ui glazig (8 min)');
    expect(stap).toEqual({ n: 1, text: 'Bak de ui glazig', minutes: 8 });
  });

  it('hernummert op volgorde en strippt handgetypte nummers', () => {
    const stappen = tekstNaarStappen('3. Snijd de ui\n1. Verhit de olie');
    expect(stappen.map((s) => s.n)).toEqual([1, 2]);
    expect(stappen[0].text).toBe('Snijd de ui');
  });

  it('overleeft een rondje heen en weer', () => {
    const tekst = 'Snijd de ui fijn\nBak de ui glazig (8 min)';
    expect(stappenNaarTekst(tekstNaarStappen(tekst))).toBe(tekst);
  });

  it('negeert lege regels', () => {
    expect(tekstNaarStappen('Eerst dit\n\n\nDan dat')).toHaveLength(2);
  });
});
