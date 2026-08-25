import { useTimers } from '../lib/useTimers';
import { formatteerTijd, resterendeSeconden } from '../lib/timers';

/** "Zet timer (12 min)" onder de staptekst; daarna de aftelling zelf. */
export function TimerButton({ stap, minuten }: { stap: number; minuten: number }) {
  const { zet, stop, timerVoor, nu } = useTimers();
  const timer = timerVoor(stap);

  if (!timer) {
    return (
      <button type="button" className="kook-knop" onClick={() => zet(stap, minuten)}>
        Zet timer (<span className="cijfer">{minuten}</span> min)
      </button>
    );
  }

  const resterend = resterendeSeconden(timer, nu);

  return (
    <button
      type="button"
      className={'kook-knop' + (timer.afgelopen ? ' kook-knop--klaar' : ' kook-knop--loopt')}
      onClick={() => stop(stap)}
    >
      {timer.afgelopen ? (
        <>Klaar — tik om te sluiten</>
      ) : (
        <>
          Nog <span className="cijfer">{formatteerTijd(resterend)}</span>
        </>
      )}
    </button>
  );
}
