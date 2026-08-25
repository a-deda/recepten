import { useTimers } from '../lib/useTimers';
import { voortgang } from '../lib/timers';
import { berekenSegmenten } from '../lib/kookklok';
import type { Stap } from '../lib/types';

/**
 * De kookklok in beeld. Segmenten met een lopende timer vullen zich in het
 * accent; afgeronde stappen zijn gedempt gevuld; de huidige stap heeft een
 * lichte rand.
 */
export function CookClock({
  stappen,
  huidige,
}: {
  stappen: Stap[];
  huidige: number;
}) {
  const { timerVoor, nu } = useTimers();
  const segmenten = berekenSegmenten(stappen);

  return (
    <div
      className="kookklok"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={stappen.length}
      aria-valuenow={huidige}
      aria-label={`Stap ${huidige} van ${stappen.length}`}
    >
      {segmenten.map((segment, i) => {
        const timer = timerVoor(segment.stap);
        const gevuld = timer
          ? voortgang(timer, nu)
          : i < huidige - 1
            ? 1
            : 0;

        return (
          <span
            key={segment.stap}
            className={
              'kookklok__segment' +
              (i === huidige - 1 ? ' kookklok__segment--huidig' : '') +
              (timer ? ' kookklok__segment--timer' : '')
            }
            style={{ flexGrow: segment.aandeel }}
          >
            <span
              className="kookklok__vulling"
              style={{ transform: `scaleX(${gevuld})` }}
            />
          </span>
        );
      })}
    </div>
  );
}
