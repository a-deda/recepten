import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useBewaarRecept, useRecept } from '../lib/queries';
import {
  ingredientenNaarTekst,
  stappenNaarTekst,
  tekstNaarIngredienten,
  tekstNaarStappen,
} from '../lib/receptTekst';

interface Formulier {
  title: string;
  summary: string;
  servings: string;
  total_minutes: string;
  source_url: string;
  source_book: string;
  ingredienten: string;
  stappen: string;
  notes: string;
}

const LEEG: Formulier = {
  title: '',
  summary: '',
  servings: '',
  total_minutes: '',
  source_url: '',
  source_book: '',
  ingredienten: '',
  stappen: '',
  notes: '',
};

/**
 * Hetzelfde formulier voor handmatig toevoegen en voor bewerken vanuit triage,
 * met de geparste velden voorgevuld (§6).
 *
 * Een kookboekverwijzing is hier gewoon een recept met een lege stappenlijst
 * en een ingevuld `source_book` (§2) — er is geen apart formulier voor nodig.
 */
export function RecipeEdit() {
  const { id } = useParams();
  const navigeer = useNavigate();
  const { data: recept, isLoading } = useRecept(id);
  const bewaar = useBewaarRecept();
  const [form, setForm] = useState<Formulier>(LEEG);

  useEffect(() => {
    if (!recept) return;
    setForm({
      title: recept.title,
      summary: recept.summary ?? '',
      servings: recept.servings?.toString() ?? '',
      total_minutes: recept.total_minutes?.toString() ?? '',
      source_url: recept.source_url ?? '',
      source_book: recept.source_book ?? '',
      ingredienten: ingredientenNaarTekst(recept.ingredients),
      stappen: stappenNaarTekst(recept.steps),
      notes: recept.notes ?? '',
    });
  }, [recept]);

  function veld<K extends keyof Formulier>(sleutel: K) {
    return {
      value: form[sleutel],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setForm((vorig) => ({ ...vorig, [sleutel]: e.target.value })),
    };
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault();

    const nieuweId = await bewaar.mutateAsync({
      id,
      velden: {
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        servings: form.servings ? Number(form.servings) : null,
        total_minutes: form.total_minutes ? Number(form.total_minutes) : null,
        source_url: form.source_url.trim() || null,
        source_book: form.source_book.trim() || null,
        ingredients: tekstNaarIngredienten(form.ingredienten),
        steps: tekstNaarStappen(form.stappen),
        notes: form.notes.trim() || null,
        // Bewerken vanuit triage betekent: goedkeuren. Wie de moeite neemt te
        // corrigeren, wil het recept houden.
        status: 'library',
        ...(id ? {} : { source_type: form.source_book ? 'book' : 'text' }),
      },
    });

    navigeer(`/r/${nieuweId}`);
  }

  if (id && isLoading) return <p className="laden">Even laden…</p>;

  return (
    <main className="scherm">
      <header className="scherm__kop">
        <Link to={id ? `/r/${id}` : '/'} className="terug">
          ← Terug
        </Link>
        <h1 className="display scherm__titel">{id ? 'Bewerken' : 'Nieuw recept'}</h1>
      </header>

      <form className="formulier" onSubmit={opslaan}>
        <label htmlFor="titel">Titel</label>
        <input id="titel" required {...veld('title')} />

        <label htmlFor="samenvatting">Samenvatting</label>
        <input id="samenvatting" {...veld('summary')} />

        <div className="formulier__rij">
          <div>
            <label htmlFor="porties">Porties</label>
            <input id="porties" type="number" inputMode="numeric" min="1" {...veld('servings')} />
          </div>
          <div>
            <label htmlFor="minuten">Totale tijd (min)</label>
            <input id="minuten" type="number" inputMode="numeric" min="1" {...veld('total_minutes')} />
          </div>
        </div>

        <label htmlFor="ingredienten">
          Ingrediënten <span className="hint">één per regel: “250 g bloem — gezeefd”</span>
        </label>
        <textarea id="ingredienten" rows={8} {...veld('ingredienten')} />

        <label htmlFor="stappen">
          Stappen <span className="hint">één per regel, tijd erachter: “Bak 12 min (12 min)”</span>
        </label>
        <textarea id="stappen" rows={10} {...veld('stappen')} />

        <label htmlFor="boek">
          Kookboek <span className="hint">“Ottolenghi Simple, p. 142”</span>
        </label>
        <input id="boek" {...veld('source_book')} />

        <label htmlFor="bron">Bron-URL</label>
        <input id="bron" type="url" inputMode="url" {...veld('source_url')} />

        <label htmlFor="notities">Jouw aantekeningen</label>
        <textarea id="notities" rows={4} {...veld('notes')} />

        <button type="submit" className="knop knop--primair knop--groot" disabled={bewaar.isPending}>
          {bewaar.isPending ? 'Opslaan…' : 'Opslaan'}
        </button>
        {bewaar.error && <p className="fout">Opslaan mislukt: {String(bewaar.error)}</p>}
      </form>
    </main>
  );
}
