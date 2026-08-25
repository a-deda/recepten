import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resterendeSeconden, type Timer } from './timers';

interface TimerContext {
  timers: Timer[];
  nu: number;
  zet: (stap: number, minuten: number) => void;
  stop: (stap: number) => void;
  timerVoor: (stap: number) => Timer | undefined;
}

const Context = createContext<TimerContext | null>(null);

/**
 * De provider staat bóven de stapweergave. Dat is geen stijlkwestie: zou de
 * timerstate in de stapcomponent zitten, dan verdwijnt een lopende timer zodra
 * je doortikt — precies wat §8 verbiedt ("loopt door bij stapwissel").
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [nu, setNu] = useState(() => Date.now());
  const audioRef = useRef<AudioContext | null>(null);

  // Eén tik per seconde voor de hele boom; elke timer rekent zelf terug vanaf
  // zijn eindmoment.
  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => setNu(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timers.length]);

  // Aflopen bewaken. Ook dit werkt op de klok, dus een timer die tijdens een
  // schermvergrendeling afliep, gaat af zodra je terugkomt.
  useEffect(() => {
    for (const timer of timers) {
      if (!timer.afgelopen && resterendeSeconden(timer, nu) === 0) {
        meld(audioRef.current);
        setTimers((vorige) =>
          vorige.map((t) => (t.stap === timer.stap ? { ...t, afgelopen: true } : t)),
        );
      }
    }
  }, [nu, timers]);

  const zet = useCallback((stap: number, minuten: number) => {
    // De AudioContext moet tijdens een echte aanraking ontgrendeld worden,
    // anders blijft het geluid straks stil: browsers staan audio zonder
    // gebruikersgebaar niet toe.
    audioRef.current ??= maakAudioContext();
    void audioRef.current?.resume();

    setTimers((vorige) => [
      ...vorige.filter((t) => t.stap !== stap),
      {
        stap,
        eindeOp: Date.now() + minuten * 60_000,
        totaalSeconden: minuten * 60,
        afgelopen: false,
      },
    ]);
    setNu(Date.now());
  }, []);

  const stop = useCallback((stap: number) => {
    setTimers((vorige) => vorige.filter((t) => t.stap !== stap));
  }, []);

  const waarde = useMemo<TimerContext>(
    () => ({
      timers,
      nu,
      zet,
      stop,
      timerVoor: (stap: number) => timers.find((t) => t.stap === stap),
    }),
    [timers, nu, zet, stop],
  );

  return <Context.Provider value={waarde}>{children}</Context.Provider>;
}

export function useTimers(): TimerContext {
  const context = useContext(Context);
  if (!context) throw new Error('useTimers hoort binnen een TimerProvider.');
  return context;
}

function maakAudioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/** Geluid én trilling: in een keuken met een afzuigkap wint de trilling. */
function meld(audio: AudioContext | null) {
  if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
  if (!audio) return;

  const nu = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, nu + i * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.35, nu + i * 0.45 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, nu + i * 0.45 + 0.3);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(nu + i * 0.45);
    oscillator.stop(nu + i * 0.45 + 0.32);
  }
}
