import { describe, expect, it } from 'vitest';
import { formatteerTijd, resterendeSeconden, voortgang } from '../../src/lib/timers';
import type { Timer } from '../../src/lib/timers';

const START = 1_700_000_000_000;

function timer(minuten: number): Timer {
  return {
    stap: 1,
    eindeOp: START + minuten * 60_000,
    totaalSeconden: minuten * 60,
    afgelopen: false,
  };
}

describe('timers', () => {
  it('rekent terug vanaf een absoluut eindmoment', () => {
    expect(resterendeSeconden(timer(10), START)).toBe(600);
    expect(resterendeSeconden(timer(10), START + 60_000)).toBe(540);
  });

  it('overleeft een schermvergrendeling', () => {
    // Dit is de reden dat de timer op een timestamp werkt en niet op een
    // aftellende teller: tijdens een vergrendeling loopt er geen interval,
    // maar de klok loopt door.
    const t = timer(12);
    const naVergrendeling = START + 10 * 60_000;
    expect(resterendeSeconden(t, naVergrendeling)).toBe(120);
  });

  it('gaat niet onder nul', () => {
    expect(resterendeSeconden(timer(1), START + 5 * 60_000)).toBe(0);
  });

  it('geeft voortgang tussen 0 en 1', () => {
    expect(voortgang(timer(10), START)).toBeCloseTo(0, 5);
    expect(voortgang(timer(10), START + 5 * 60_000)).toBeCloseTo(0.5, 2);
    expect(voortgang(timer(10), START + 99 * 60_000)).toBe(1);
  });

  it('toont tijd als m:ss', () => {
    expect(formatteerTijd(600)).toBe('10:00');
    expect(formatteerTijd(65)).toBe('1:05');
    expect(formatteerTijd(0)).toBe('0:00');
  });
});
