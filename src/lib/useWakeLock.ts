import { useEffect, useState } from 'react';

type WakeLockStatus = 'actief' | 'niet-ondersteund' | 'geweigerd';

/**
 * Houdt het scherm aan tijdens het koken (§8).
 *
 * De valkuil zit niet in het aanvragen maar in het teruggeven: een wake lock
 * gaat automatisch verloren zodra het scherm even uitgaat of je naar een
 * andere tab schakelt, en komt niet vanzelf terug. Zonder de
 * visibilitychange-hook staat je scherm na de eerste keer weer uit, precies
 * wanneer je vette handen hebt.
 */
export function useWakeLock(actief: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(
    'wakeLock' in navigator ? 'actief' : 'niet-ondersteund',
  );

  useEffect(() => {
    if (!actief || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let gestopt = false;

    async function vraagAan() {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (gestopt) {
          void lock.release();
          lock = null;
          return;
        }
        setStatus('actief');
      } catch {
        // Meestal omdat het document niet zichtbaar is; dan probeert de
        // visibilitychange-hook het straks opnieuw.
        setStatus('geweigerd');
      }
    }

    function bijZichtbaar() {
      if (document.visibilityState === 'visible') void vraagAan();
    }

    void vraagAan();
    document.addEventListener('visibilitychange', bijZichtbaar);

    return () => {
      gestopt = true;
      document.removeEventListener('visibilitychange', bijZichtbaar);
      void lock?.release();
    };
  }, [actief]);

  return status;
}
