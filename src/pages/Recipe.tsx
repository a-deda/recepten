import { Link, useParams } from 'react-router-dom';

import { useAfbeelding, useRecept } from '../lib/queries';
import { vertaaldUit } from '../lib/talen';

function hoeveelheid(qty: string | null, unit: string | null): string {
  return [qty, unit].filter(Boolean).join(' ');
}

/** Detailpagina (§7). Eén prominente knop: Koken. */
export function Recipe() {
  const { id } = useParams();
  const { data: recept, isLoading, error } = useRecept(id);
  const { data: fotoUrl } = useAfbeelding(recept?.image_path);

  if (isLoading) return <p className="laden">Even laden…</p>;
  if (error || !recept) return <p className="fout">Recept niet gevonden.</p>;

  const kanKoken = recept.steps.length > 0;
  const bron_taal = vertaaldUit(recept.language);

  return (
    <main className="scherm detail">
      <header className="scherm__kop">
        <Link to="/" className="terug">
          ← Overzicht
        </Link>
        <Link to={`/r/${recept.id}/bewerken`} className="knop knop--klein">
          Bewerken
        </Link>
      </header>

      {fotoUrl && (
        <img className="detail__foto" src={fotoUrl} alt="" width={800} height={600} />
      )}

      <h1 className="display detail__titel">{recept.title}</h1>
      {recept.summary && <p className="detail__samenvatting">{recept.summary}</p>}

      <p className="detail__meta">
        {recept.servings !== null && (
          <span>
            <span className="cijfer">{recept.servings}</span> porties
          </span>
        )}
        {recept.total_minutes !== null && (
          <span>
            <span className="cijfer">{recept.total_minutes}</span> min
          </span>
        )}
        {recept.cook_count > 0 && (
          <span>
            <span className="cijfer">{recept.cook_count}</span>× gekookt
          </span>
        )}
      </p>

      {kanKoken ? (
        <Link to={`/r/${recept.id}/koken`} className="knop knop--primair knop--groot">
          Koken
        </Link>
      ) : (
        <p className="detail__geen-stappen">
          Geen stappen bij dit recept — kookmodus heeft hier niets te tonen.
        </p>
      )}

      {recept.ingredients.length > 0 && (
        <section className="detail__blok">
          <h2>Ingrediënten</h2>
          <ul className="ingredienten">
            {recept.ingredients.map((ing, i) => (
              <li key={i}>
                <span className="cijfer ingredienten__hoeveelheid">
                  {hoeveelheid(ing.qty, ing.unit)}
                </span>
                <span>
                  {ing.item}
                  {ing.note && <span className="ingredienten__notitie"> — {ing.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recept.steps.length > 0 && (
        <section className="detail__blok">
          <h2>Stappen</h2>
          <ol className="stappen">
            {recept.steps.map((stap) => (
              <li key={stap.n}>
                <span className="cijfer stappen__nummer">{stap.n}</span>
                <span>
                  {stap.text}
                  {stap.minutes !== null && (
                    <span className="cijfer stappen__tijd"> ({stap.minutes} min)</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="detail__blok detail__bron">
        <h2>Bron</h2>
        {recept.source_book && <p>{recept.source_book}</p>}
        {recept.source_url && (
          <p>
            <a href={recept.source_url} target="_blank" rel="noreferrer">
              {new URL(recept.source_url).hostname}
            </a>
          </p>
        )}
        {!recept.source_book && !recept.source_url && <p>Losse inzending.</p>}
        {bron_taal && (
          <p className="detail__parse-notitie">Vertaald uit {bron_taal}.</p>
        )}
        {recept.parse_notes && (
          <p className="detail__parse-notitie">Claude twijfelde over: {recept.parse_notes}</p>
        )}
      </section>

      {recept.notes && (
        <section className="detail__blok">
          <h2>Jouw aantekeningen</h2>
          <p className="detail__notities">{recept.notes}</p>
        </section>
      )}
    </main>
  );
}
