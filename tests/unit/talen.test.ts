import { describe, expect, it } from 'vitest';
import { vertaaldUit } from '../../src/lib/talen';

describe('vertaaldUit', () => {
  it('meldt niets bij een Nederlandse bron', () => {
    expect(vertaaldUit('nl')).toBeNull();
    expect(vertaaldUit('NL')).toBeNull();
  });

  it('noemt de taal bij een vertaalde bron', () => {
    expect(vertaaldUit('en')).toBe('het Engels');
    expect(vertaaldUit('it')).toBe('het Italiaans');
  });

  it('gaat om met een regiovariant', () => {
    expect(vertaaldUit('en-US')).toBe('het Engels');
    expect(vertaaldUit('nl-BE')).toBeNull();
  });

  it('valt terug op de code zelf bij een onbekende taal', () => {
    expect(vertaaldUit('fi')).toBe('het fi');
  });

  it('meldt niets als de taal ontbreekt', () => {
    expect(vertaaldUit(null)).toBeNull();
    expect(vertaaldUit('')).toBeNull();
  });
});
