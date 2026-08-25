import type { Ingredient } from '../lib/types';

/** Veeg omhoog voor de volledige lijst, veeg omlaag om te sluiten (§8). */
export function IngredientSheet({
  ingredienten,
  open,
  onSluit,
}: {
  ingredienten: Ingredient[];
  open: boolean;
  onSluit: () => void;
}) {
  return (
    <div
      className={'sheet' + (open ? ' sheet--open' : '')}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="sheet__greep" aria-hidden="true" />
      <h2 className="sheet__titel">Ingrediënten</h2>
      <ul className="sheet__lijst">
        {ingredienten.map((ing, i) => (
          <li key={i}>
            <span className="cijfer sheet__hoeveelheid">
              {[ing.qty, ing.unit].filter(Boolean).join(' ')}
            </span>
            <span>
              {ing.item}
              {ing.note && <span className="sheet__notitie"> — {ing.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="kook-knop" onClick={onSluit}>
        Sluiten
      </button>
    </div>
  );
}
