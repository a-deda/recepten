import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useInboxAantal, useRecepten } from '../lib/queries';
import { usePwaInstall } from '../lib/usePwaInstall';
import { RecipeCard } from '../components/RecipeCard';
import { SearchField } from '../components/SearchField';

/**
 * Eén scherm (§7). Lijst, één zoekveld, meer niet. De teller bovenaan is de
 * enige plek waar de vergaarbak zich meldt.
 */
export function Library() {
  const [zoekterm, setZoekterm] = useState('');
  const { data: recepten, isLoading, error } = useRecepten(zoekterm, 'library');
  const { data: nieuw = 0 } = useInboxAantal();
  const { kanInstalleren, installeer } = usePwaInstall();

  return (
    <main className="scherm">
      <header className="scherm__kop">
        <h1 className="display scherm__titel">Receptenbak</h1>
        <div className="scherm__acties">
          {kanInstalleren && (
            <button type="button" className="knop knop--klein knop--stil" onClick={installeer}>
              Op beginscherm
            </button>
          )}
          <Link to="/nieuw" className="knop knop--klein">
            Toevoegen
          </Link>
        </div>
      </header>

      {nieuw > 0 && (
        <Link to="/inbox" className="teller">
          <span className="cijfer teller__getal">{nieuw}</span> nieuw — keuren
        </Link>
      )}

      <SearchField waarde={zoekterm} onWijzig={setZoekterm} />

      {error && <p className="fout">Kon de lijst niet laden: {String(error)}</p>}

      {isLoading ? (
        <p className="laden">Even laden…</p>
      ) : recepten && recepten.length > 0 ? (
        <ul className="lijst">
          {recepten.map((recept) => (
            <RecipeCard key={recept.id} recept={recept} />
          ))}
        </ul>
      ) : zoekterm ? (
        <p className="leeg">Niets gevonden voor “{zoekterm}”.</p>
      ) : (
        <p className="leeg">
          Nog niets in de bibliotheek. Mail een recept naar je receptenadres, of{' '}
          <Link to="/nieuw">voeg er zelf een toe</Link>.
        </p>
      )}
    </main>
  );
}
