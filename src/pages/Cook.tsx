import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useGekookt, useRecept } from '../lib/queries';
import { useWakeLock } from '../lib/useWakeLock';
import { TimerProvider, useTimers } from '../lib/useTimers';
import { CookClock } from '../components/CookClock';
import { StepView } from '../components/StepView';
import { IngredientSheet } from '../components/IngredientSheet';
import type { Recept } from '../lib/types';

/**
 * Kookmodus (§8). Telefoon op het aanrecht, vette handen, halve meter afstand,
 * matige belichting. Alles hier is voor die situatie, niet voor een demo.
 */
export function Cook() {
  const { id } = useParams();
  const { data: recept, isLoading } = useRecept(id);

  if (isLoading) return <p className="laden">Even laden…</p>;
  if (!recept) return <p className="fout">Recept niet gevonden.</p>;

  return (
    <TimerProvider>
      <Kookscherm recept={recept} />
    </TimerProvider>
  );
}

export function Kookscherm({ recept }: { recept: Recept }) {
  const navigeer = useNavigate();
  const [stapIndex, setStapIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const wakeLock = useWakeLock(true);
  const { timers } = useTimers();

  const stappen = recept.steps;
  const laatste = stapIndex >= stappen.length - 1;

  // Donker vanaf het eerste frame; de klasse zet de tokens om.
  useEffect(() => {
    document.body.classList.add('kookmodus');
    return () => document.body.classList.remove('kookmodus');
  }, []);

  function volgende() {
    if (laatste) setKlaar(true);
    else setStapIndex((i) => i + 1);
  }

  function vorige() {
    if (klaar) setKlaar(false);
    else setStapIndex((i) => Math.max(0, i - 1));
  }

  const veeg = useVeeg({
    omhoog: () => setSheetOpen(true),
    omlaag: () => setSheetOpen(false),
  });

  if (klaar) {
    return <Afsluiten recept={recept} onTerug={vorige} />;
  }

  function bijTik(e: React.MouseEvent<HTMLDivElement>) {
    // Alles wat zelf een bedoeling heeft — timerknop, sluitknop, de
    // ingrediëntensheet — handelt zijn eigen tik af.
    if ((e.target as HTMLElement).closest('button, textarea, a, .sheet')) return;

    const { left, width, top, height } = e.currentTarget.getBoundingClientRect();
    // De bovenste 15% is van de sluitknop; daar navigeer je niet mee (§8).
    if (e.clientY - top < height * 0.15) return;

    if (e.clientX - left < width / 3) vorige();
    else volgende();
  }

  return (
    <div className="kook" onClick={bijTik} {...veeg}>
      <div className="kook__kop">
        {/* Ruim aanrakingsgebied, en niets anders in de bovenste 15% (§8 regel 1). */}
        <button
          type="button"
          className="kook__sluit"
          aria-label="Kookmodus verlaten"
          onClick={() => navigeer(`/r/${recept.id}`)}
        >
          ✕
        </button>
        <span className="cijfer kook__teller">
          {stapIndex + 1} / {stappen.length}
        </span>
      </div>

      <CookClock stappen={stappen} huidige={stapIndex + 1} />

      {wakeLock !== 'actief' && (
        <p className="kook__waarschuwing">
          Deze browser houdt het scherm niet aan — zet je schermvergrendeling
          tijdelijk langer.
        </p>
      )}

      <StepView stap={stappen[stapIndex]} />

      {/*
        Tikzones: links een derde terug, rechts twee derde vooruit. Geen swipe
        voor stapnavigatie — te makkelijk per ongeluk, en per ongeluk
        doortikken moet met één tik links te herstellen zijn (§8 regel 2).

        De tik wordt op het hele scherm afgehandeld in plaats van op twee
        onzichtbare knoppen. Anders zou alles wat bovenop ligt — een lange,
        scrollbare stap bijvoorbeeld — de tik opvangen en zit je vast. Deze
        twee knoppen blijven staan voor toetsenbord en schermlezer, maar
        vangen zelf geen aanraking (pointer-events: none in de CSS).
      */}
      <button
        type="button"
        className="kook__zone kook__zone--links"
        aria-label="Vorige stap"
        onClick={vorige}
      />
      <button
        type="button"
        className="kook__zone kook__zone--rechts"
        aria-label={laatste ? 'Naar afsluiten' : 'Volgende stap'}
        onClick={volgende}
      />

      <div className="kook__voet">
        <span className="kook__hint">Veeg omhoog voor ingrediënten</span>
        {timers.length > 0 && (
          <span className="kook__timers">
            <span className="cijfer">{timers.length}</span>{' '}
            {timers.length === 1 ? 'timer' : 'timers'}
          </span>
        )}
      </div>

      <IngredientSheet
        ingredienten={recept.ingredients}
        open={sheetOpen}
        onSluit={() => setSheetOpen(false)}
      />
    </div>
  );
}

/**
 * Laatste scherm (§8). Het notitieveld is het punt: dat is de data die na
 * twintig gerechten waarde geeft die je nergens anders krijgt. Groot veld,
 * kleine overslaan-knop.
 */
function Afsluiten({ recept, onTerug }: { recept: Recept; onTerug: () => void }) {
  const navigeer = useNavigate();
  const gekookt = useGekookt();
  const [notitie, setNotitie] = useState('');

  async function bevestig() {
    await gekookt.mutateAsync({ id: recept.id, notitie });
    navigeer(`/r/${recept.id}`);
  }

  return (
    <div className="kook kook--afsluiten">
      <div className="kook__kop">
        <button
          type="button"
          className="kook__sluit"
          aria-label="Terug naar de laatste stap"
          onClick={onTerug}
        >
          ←
        </button>
      </div>

      <h1 className="display kook__klaar">Klaar?</h1>

      <label htmlFor="kooknotitie" className="kook__label">
        Wat wil je onthouden voor de volgende keer?
      </label>
      <textarea
        id="kooknotitie"
        className="kook__notitie"
        rows={6}
        value={notitie}
        onChange={(e) => setNotitie(e.target.value)}
        placeholder="Te zout. Volgende keer de helft van de bouillon."
      />

      <button
        type="button"
        className="kook-knop kook-knop--primair"
        onClick={bevestig}
        disabled={gekookt.isPending}
      >
        {gekookt.isPending ? 'Opslaan…' : 'Gekookt'}
      </button>

      <button
        type="button"
        className="kook__overslaan"
        onClick={() => navigeer(`/r/${recept.id}`)}
      >
        Overslaan
      </button>
    </div>
  );
}

/** Verticale veeg voor de ingrediëntensheet — niet voor stapnavigatie. */
function useVeeg({ omhoog, omlaag }: { omhoog: () => void; omlaag: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const punt = e.touches[0];
      start.current = { x: punt.clientX, y: punt.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const punt = e.changedTouches[0];
      const dx = punt.clientX - start.current.x;
      const dy = punt.clientY - start.current.y;
      start.current = null;

      // Alleen een duidelijk verticale haal telt; anders is het gewoon een tik.
      if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy)) return;
      if (dy < 0) omhoog();
      else omlaag();
    },
  };
}
