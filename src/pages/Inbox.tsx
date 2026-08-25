import { Link, useNavigate } from 'react-router-dom';

import { useRecepten, useZetStatus } from '../lib/queries';

/**
 * Triage (§6). Drie acties per item, elk groot genoeg voor één duim.
 *
 * Zonder dit wordt de vergaarbak binnen twee maanden een vuilnisbelt en
 * verlies je het vertrouwen in het overzicht. Met triage kost het vijf
 * seconden per item, op een moment dat jij kiest.
 */
export function Inbox() {
  const { data: recepten, isLoading } = useRecepten('', 'inbox');
  const zetStatus = useZetStatus();
  const navigeer = useNavigate();

  return (
    <main className="scherm">
      <header className="scherm__kop">
        <Link to="/" className="terug">
          ← Overzicht
        </Link>
        <h1 className="display scherm__titel">Nieuw</h1>
      </header>

      {isLoading ? (
        <p className="laden">Even laden…</p>
      ) : recepten && recepten.length > 0 ? (
        <ul className="lijst lijst--triage">
          {recepten.map((recept) => (
            <li key={recept.id} className="triage">
              <Link to={`/r/${recept.id}`} className="triage__titel display">
                {recept.title}
              </Link>
              <p className="triage__meta">
                {recept.total_minutes !== null && (
                  <span className="cijfer">{recept.total_minutes} min</span>
                )}
              </p>
              <div className="triage__acties">
                <button
                  type="button"
                  className="knop knop--primair"
                  onClick={() => zetStatus.mutate({ id: recept.id, status: 'library' })}
                >
                  Bewaren
                </button>
                <button
                  type="button"
                  className="knop"
                  onClick={() => navigeer(`/r/${recept.id}/bewerken`)}
                >
                  Bewerken
                </button>
                <button
                  type="button"
                  className="knop knop--stil"
                  onClick={() => zetStatus.mutate({ id: recept.id, status: 'discarded' })}
                >
                  Weg
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="leeg">Niets te keuren. </p>
      )}
    </main>
  );
}
