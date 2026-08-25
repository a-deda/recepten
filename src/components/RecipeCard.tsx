import { Link } from 'react-router-dom';
import type { ReceptKaart } from '../lib/types';

const BRON_ICOON: Record<string, string> = {
  url: '🔗',
  image: '📷',
  pdf: '📄',
  text: '✍️',
  book: '📕',
};

const BRON_LABEL: Record<string, string> = {
  url: 'Van een website',
  image: 'Van een foto',
  pdf: 'Uit een pdf',
  text: 'Losse tekst',
  book: 'Uit een kookboek',
};

/** "3 dagen geleden" is hier onnodig precies; maanden zijn genoeg houvast. */
function gekooktLabel(datum: string): string {
  const dagen = Math.floor((Date.now() - new Date(datum).getTime()) / 86_400_000);
  if (dagen <= 0) return 'vandaag gekookt';
  if (dagen === 1) return 'gisteren gekookt';
  if (dagen < 30) return `${dagen} dagen geleden gekookt`;
  const maanden = Math.round(dagen / 30);
  return maanden === 1 ? 'een maand geleden gekookt' : `${maanden} maanden geleden gekookt`;
}

export function RecipeCard({ recept }: { recept: ReceptKaart }) {
  const bron = recept.source_type ?? 'text';

  return (
    <li className="kaart">
      <Link to={`/r/${recept.id}`} className="kaart__link">
        <span className="kaart__icoon" aria-hidden="true">
          {BRON_ICOON[bron]}
        </span>
        <span className="kaart__tekst">
          <span className="display kaart__titel">{recept.title}</span>
          <span className="kaart__meta">
            <span className="visueel-verborgen">{BRON_LABEL[bron]}. </span>
            {recept.total_minutes !== null && (
              <span className="cijfer">{recept.total_minutes} min</span>
            )}
            {recept.last_cooked !== null && (
              <span className="kaart__gekookt">{gekooktLabel(recept.last_cooked)}</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
