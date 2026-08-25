import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Stap } from '../lib/types';
import { TimerButton } from './TimerButton';

const MAX_PX = 34;
const MIN_PX = 28; // ondergrens uit §8; daaronder lees je het niet op een halve meter
const STAP_PX = 2;

/**
 * Eén stap per scherm, gecentreerd, zonder scroll (§8 regel 3).
 *
 * Past een stap niet, dan schaalt de tekst omlaag tot 28px. Past hij dán nog
 * steeds niet, dan was de stap te lang en had de parser hem moeten splitsen.
 * Dat wordt zichtbaar gemeld, en alleen in dat geval mag er gescrold worden:
 * tekst stilzwijgend afkappen zou je een halve instructie geven zonder dat je
 * het merkt, en dat is erger dan één keer scrollen.
 */
export function StepView({ stap }: { stap: Stap }) {
  const vak = useRef<HTMLDivElement>(null);
  const tekst = useRef<HTMLParagraphElement>(null);
  const [grootte, setGrootte] = useState(MAX_PX);
  const [teLang, setTeLang] = useState(false);

  useLayoutEffect(() => {
    setGrootte(MAX_PX);
    setTeLang(false);
  }, [stap.n]);

  useEffect(() => {
    const container = vak.current;
    const alinea = tekst.current;
    if (!container || !alinea) return;

    // Meet de alinea tegen de vrije hoogte binnen de padding. De container
    // zelf uitlezen werkt hier niet: bij verticaal gecentreerde flexinhoud
    // telt `scrollHeight` alleen de overloop aan de onderkant mee, dus een
    // stap die aan twee kanten buiten beeld valt zou "passen" heten.
    const stijl = getComputedStyle(container);
    const beschikbaar =
      container.clientHeight -
      parseFloat(stijl.paddingTop) -
      parseFloat(stijl.paddingBottom);

    if (alinea.getBoundingClientRect().height <= beschikbaar) return;

    if (grootte > MIN_PX) setGrootte((vorig) => Math.max(MIN_PX, vorig - STAP_PX));
    else setTeLang(true);
  }, [grootte, stap.n]);

  return (
    <div className={'stap' + (teLang ? ' stap--te-lang' : '')} ref={vak}>
      <p className="stap__tekst" ref={tekst} style={{ fontSize: `${grootte}px` }}>
        {stap.text}
      </p>

      {teLang && (
        <p className="stap__waarschuwing">
          Deze stap past niet op één scherm — te lang geparst.
        </p>
      )}

      {stap.minutes !== null && <TimerButton stap={stap.n} minuten={stap.minutes} />}
    </div>
  );
}
