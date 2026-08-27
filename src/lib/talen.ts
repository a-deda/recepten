/**
 * `language` bevat de taal van de BRON, niet van de opgeslagen tekst — die is
 * sinds de vertaalstap altijd Nederlands. Zo blijft zichtbaar dat een recept
 * vertaald is, wat uitmaakt als een formulering raar leest: dan weet je of je
 * naar de bron moet kijken of naar de vertaling.
 */
const TALEN: Record<string, string> = {
  en: 'het Engels',
  de: 'het Duits',
  fr: 'het Frans',
  it: 'het Italiaans',
  es: 'het Spaans',
  pt: 'het Portugees',
  tr: 'het Turks',
  sv: 'het Zweeds',
  da: 'het Deens',
  no: 'het Noors',
  pl: 'het Pools',
  ar: 'het Arabisch',
  ja: 'het Japans',
  zh: 'het Chinees',
  ko: 'het Koreaans',
  th: 'het Thais',
  id: 'het Indonesisch',
};

/** Null als de bron al Nederlands was; dan valt er niets te melden. */
export function vertaaldUit(language: string | null | undefined): string | null {
  if (!language) return null;
  const code = language.trim().toLowerCase().slice(0, 2);
  if (code === 'nl' || code === '') return null;
  return TALEN[code] ?? `het ${language}`;
}
