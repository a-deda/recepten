/**
 * Testharnas voor kookmodus.
 *
 * Kookmodus is het onderdeel waar de PRD de meeste harde eisen aan stelt
 * (tapzones, geen scroll, raakdoelen, duur-evenredige segmenten). Die eisen
 * zijn te toetsen zonder Supabase: dit harnas mount het echte scherm met een
 * vast recept, zodat Playwright de regels uit §8 kan nalopen.
 *
 * Wat hier níet mee te testen valt, staat in SETUP.md: wake lock op jouw
 * telefoon, vette handen, je eigen keukenlamp, en of de timer een
 * schermvergrendeling overleeft.
 */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '../../../src/styles/tokens.css';
import '../../../src/styles/app.css';
import '../../../src/styles/kook.css';

import { Kookscherm } from '../../../src/pages/Cook';
import { TimerProvider } from '../../../src/lib/useTimers';
import type { Recept } from '../../../src/lib/types';

const RECEPT: Recept = {
  id: 'harnas',
  title: 'Stoofvlees',
  status: 'library',
  source_type: 'text',
  total_minutes: 195,
  last_cooked: null,
  cook_count: 0,
  created_at: new Date().toISOString(),
  summary: 'Lang stoven, weinig werk.',
  ingredients: [
    { qty: '800', unit: 'g', item: 'runderriblappen', note: 'in blokken' },
    { qty: '2', unit: null, item: 'uien', note: null },
    { qty: '1', unit: 'el', item: 'mosterd', note: null },
  ],
  steps: [
    { n: 1, text: 'Snijd de uien in halve ringen.', minutes: null },
    { n: 2, text: 'Bak het vlees rondom bruin in de pan.', minutes: 8 },
    { n: 3, text: 'Voeg de uien toe en bak ze glazig.', minutes: 5 },
    { n: 4, text: 'Laat het geheel zachtjes sudderen met de deksel schuin.', minutes: 180 },
    {
      n: 5,
      // Bewust veel te lang: dit is hoe een slecht gesplitste parse eruitziet.
      // De app hoort dat te melden in plaats van de tekst stil af te kappen.
      text:
        'Roer er op het laatst de mosterd doorheen, proef, en maak op smaak met ' +
        'zout en peper. Laat het gerecht daarna nog een paar minuten staan zodat ' +
        'de smaken zich zetten voordat je opdient met aardappelpuree of frieten ' +
        'en een flinke lepel van de saus erover, want die saus is het halve werk ' +
        'en zonde om in de pan te laten staan. Controleer voor het opdienen of ' +
        'het vlees echt uit elkaar valt als je er met een vork in prikt; is dat ' +
        'niet zo, laat het dan nog een half uur staan met de deksel schuin op de ' +
        'pan en roer af en toe zodat er niets aanbakt. Zet ondertussen de borden ' +
        'alvast warm, snijd een half stokbrood in dikke plakken, en schenk de ' +
        'rest van het bier of de wijn die je voor het stoven gebruikt hebt uit ' +
        'in glazen, want koken duurt lang genoeg om er iets bij te drinken.',
      minutes: null,
    },
  ],
  servings: 4,
  source_url: null,
  source_book: null,
  image_path: null,
  language: 'nl',
  parse_notes: null,
  notes: null,
};

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <TimerProvider>
        <Kookscherm recept={RECEPT} />
      </TimerProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
