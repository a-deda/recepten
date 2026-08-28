import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useInzendingStatus, useToevoegen } from '../lib/queries';
import { MAX_BESTAND_BYTES, isBruikbaar } from '../lib/afbeelding';

/**
 * Toevoegen vanuit de app: een link, wat tekst, foto's of een pdf.
 *
 * Naast de mailroute, niet in plaats daarvan. Mailen blijft het snelst als je
 * al in een browser of app zit; dit scherm is er voor het geval dat niet zo is
 * — een kookboek op tafel, of een pdf die op je telefoon staat.
 */
export function Add() {
  const navigeer = useNavigate();
  const toevoegen = useToevoegen();
  const [tekst, setTekst] = useState('');
  const [bestanden, setBestanden] = useState<File[]>([]);
  const [melding, setMelding] = useState<string | null>(null);
  const [inzendingId, setInzendingId] = useState<string | null>(null);
  const bestandsveld = useRef<HTMLInputElement>(null);

  const { data: status } = useInzendingStatus(inzendingId);
  const bezig = toevoegen.isPending || (inzendingId !== null && status?.status !== 'failed' && status?.status !== 'done');

  function kiesBestanden(gekozen: FileList | null) {
    if (!gekozen) return;
    const nieuw: File[] = [];
    for (const bestand of Array.from(gekozen)) {
      if (!isBruikbaar(bestand)) {
        setMelding(`${bestand.name} is geen foto of pdf.`);
        continue;
      }
      if (bestand.size > MAX_BESTAND_BYTES) {
        setMelding(`${bestand.name} is groter dan 20 MB.`);
        continue;
      }
      nieuw.push(bestand);
    }
    setBestanden((vorige) => [...vorige, ...nieuw]);
  }

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setMelding(null);
    try {
      setInzendingId(await toevoegen.mutateAsync({ tekst, bestanden }));
    } catch (fout) {
      setMelding(fout instanceof Error ? fout.message : String(fout));
    }
  }

  function opnieuw() {
    setInzendingId(null);
    setTekst('');
    setBestanden([]);
    setMelding(null);
    if (bestandsveld.current) bestandsveld.current.value = '';
  }

  // --- Uitkomst ------------------------------------------------------------
  if (status?.status === 'done') {
    const titels = status.result?.titles ?? [];
    return (
      <main className="scherm">
        <header className="scherm__kop">
          <Link to="/" className="terug">← Overzicht</Link>
        </header>
        <p className="uitkomst uitkomst--goed">
          Toegevoegd: <strong>{titels.join(', ') || 'recept'}</strong>
        </p>
        <p className="uitkomst__uitleg">
          {titels.length > 1 ? 'Ze staan' : 'Hij staat'} in je inbox om te keuren.
        </p>
        {status.recipe_id && (
          <button
            type="button"
            className="knop knop--primair knop--groot"
            onClick={() => navigeer(`/r/${status.recipe_id}`)}
          >
            Bekijken
          </button>
        )}
        <button type="button" className="knop" onClick={opnieuw}>
          Nog een toevoegen
        </button>
      </main>
    );
  }

  if (status?.status === 'failed') {
    return (
      <main className="scherm">
        <header className="scherm__kop">
          <Link to="/" className="terug">← Overzicht</Link>
        </header>
        <p className="uitkomst uitkomst--fout">Mislukt</p>
        <p className="uitkomst__uitleg">{status.error}</p>
        <p className="uitkomst__uitleg">
          De inzending blijft bewaard. Vaak helpt het om de tekst van de pagina
          zelf te plakken — bij een cookiemuur komt de parser er niet doorheen.
        </p>
        <button type="button" className="knop knop--primair knop--groot" onClick={opnieuw}>
          Opnieuw proberen
        </button>
      </main>
    );
  }

  // --- Formulier -----------------------------------------------------------
  return (
    <main className="scherm">
      <header className="scherm__kop">
        <Link to="/" className="terug">← Overzicht</Link>
        <h1 className="display scherm__titel">Toevoegen</h1>
      </header>

      <form className="formulier" onSubmit={verstuur}>
        <label htmlFor="invoer">
          Link of tekst{' '}
          <span className="hint">een recept-URL, of de tekst die je ergens kopieerde</span>
        </label>
        <textarea
          id="invoer"
          rows={5}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          placeholder="https://… of plak hier de ingrediënten en stappen"
          disabled={bezig}
        />

        <label htmlFor="bestanden">
          Foto's of pdf <span className="hint">een kookboekpagina, een screenshot, een pdf</span>
        </label>
        <input
          id="bestanden"
          ref={bestandsveld}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => kiesBestanden(e.target.files)}
          disabled={bezig}
        />

        {bestanden.length > 0 && (
          <ul className="bestandenlijst">
            {bestanden.map((bestand, i) => (
              <li key={`${bestand.name}-${i}`}>
                <span>{bestand.name}</span>
                <button
                  type="button"
                  className="knop knop--stil knop--klein"
                  onClick={() => setBestanden((v) => v.filter((_, j) => j !== i))}
                  disabled={bezig}
                >
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}

        {melding && <p className="fout">{melding}</p>}

        <button
          type="submit"
          className="knop knop--primair knop--groot"
          disabled={bezig || (tekst.trim() === '' && bestanden.length === 0)}
        >
          {bezig ? 'Bezig met lezen…' : 'Toevoegen'}
        </button>

        {bezig && (
          <p className="uitkomst__uitleg">
            Claude leest de bron. Dit duurt meestal een seconde of tien; bij een
            foto wat langer.
          </p>
        )}
      </form>

      <p className="uitkomst__uitleg">
        Weet je alles al? <Link to="/nieuw">Vul het zelf in</Link>.
      </p>
    </main>
  );
}
