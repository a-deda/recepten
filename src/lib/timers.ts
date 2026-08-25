export interface Timer {
  /** Stapnummer waar de timer bij hoort. */
  stap: number;
  /** Absoluut eindmoment in ms sinds epoch. */
  eindeOp: number;
  totaalSeconden: number;
  afgelopen: boolean;
}

/**
 * Timers rekenen met een absoluut eindmoment, niet met een aftellende teller.
 *
 * Dat is het hele punt: `setInterval` staat stil als het scherm vergrendelt of
 * de tab naar de achtergrond gaat. Een timestamp overleeft dat — bij terugkeer
 * klopt de resterende tijd nog steeds, ook als de telefoon tien minuten in je
 * zak zat.
 */
export function resterendeSeconden(timer: Timer, nu: number = Date.now()): number {
  return Math.max(0, Math.ceil((timer.eindeOp - nu) / 1000));
}

export function formatteerTijd(seconden: number): string {
  const m = Math.floor(seconden / 60);
  const s = seconden % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Aandeel verstreken tijd, 0…1. Voedt de vulling van de kookklok. */
export function voortgang(timer: Timer, nu: number = Date.now()): number {
  const verstreken = timer.totaalSeconden - resterendeSeconden(timer, nu);
  if (timer.totaalSeconden <= 0) return 1;
  return Math.min(1, Math.max(0, verstreken / timer.totaalSeconden));
}
