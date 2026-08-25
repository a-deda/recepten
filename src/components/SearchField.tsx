import { useEffect, useState } from 'react';

/**
 * Eén veld. Debounce van 200 ms: elke toetsaanslag een query zou het overzicht
 * trager maken dan de 300 ms die het mag kosten.
 */
export function SearchField({
  waarde,
  onWijzig,
}: {
  waarde: string;
  onWijzig: (term: string) => void;
}) {
  const [lokaal, setLokaal] = useState(waarde);

  useEffect(() => {
    const timer = setTimeout(() => onWijzig(lokaal), 200);
    return () => clearTimeout(timer);
  }, [lokaal, onWijzig]);

  return (
    <div className="zoek">
      <label htmlFor="zoek" className="visueel-verborgen">
        Zoek in je recepten
      </label>
      <input
        id="zoek"
        type="search"
        value={lokaal}
        onChange={(e) => setLokaal(e.target.value)}
        placeholder="Zoeken op titel of ingrediënt"
        autoComplete="off"
      />
    </div>
  );
}
