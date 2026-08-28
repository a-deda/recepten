# Receptenbak

Je eigen receptenbak. Je mailt een link, een foto, een pdf of wat losse tekst
naar één adres; Claude maakt er een gestructureerd recept van; jij keurt het
goed of gooit het weg; en in de keuken staat er een kookmodus die met vette
handen te bedienen is.

Eén gebruiker, telefoon eerst, nul hostingkosten. De volledige onderbouwing
staat in de PRD; dit bestand beschrijft alleen wat er in de repo zit.

## Wat er werkt

| Onderdeel | Waar |
|---|---|
| Funnel (mail → Storage → queue → Claude → recept) | `appsscript/`, `netlify/functions/` |
| Toevoegen in de app (link, tekst, foto's, pdf) | `src/pages/Add.tsx`, `netlify/functions/submit.ts` |
| Brug: alle databasetoegang voor Apps Script | `netlify/functions/bridge.ts` |
| Parser (één prompt, één schema, alle bronnen) | `netlify/functions/_lib/parser.ts` |
| Datamodel, RLS, RPC's | `supabase/migrations/` |
| Overzicht, zoeken, triage, detail, bewerken | `src/pages/` |
| Kookmodus met kookklok en timers | `src/pages/Cook.tsx`, `src/components/`, `src/lib/` |
| Wekelijkse backup naar Drive | `appsscript/Backup.gs` |

## Aan de slag

Eerst de accounts en sleutels: **[SETUP.md](SETUP.md)** loopt dat stap voor
stap door. Daarna:

```bash
npm install
cp .env.example .env      # vul in wat SETUP.md je gegeven heeft
npm run dev               # frontend op http://localhost:5173
netlify dev               # frontend + functions op http://localhost:8888
```

## Commando's

```bash
npm run typecheck     # tsc over app, functions en e2e
npm test              # unit tests (parser-routering, kookklok, timers, tekstvelden)
npm run e2e           # kookmodus op 390×844 en 360×740
npm run build         # productiebundel
npm run parse-eval    # faalpercentage van de parser op tien echte bronnen
```

## Ontwerpregels die in code vastliggen

Een paar dingen zien er willekeurig uit maar zijn dat niet. Verander ze niet
zonder de reden te lezen die erbij staat:

- **`src/styles/tokens.css`** is de enige plek met kleuren en typografie.
  Componenten gebruiken variabelen, geen hex-waarden.
- **Tekst op het accent is altijd donker.** Het accent haalt 4.5:1 op de
  donkere achtergrond, maar niet op de lichte.
- **Timers rekenen met een eindtijdstip, niet met een aftellende teller** —
  anders overleven ze geen schermvergrendeling (`src/lib/timers.ts`).
- **De timerprovider staat boven de stapweergave**, anders verdwijnt een
  lopende timer bij een stapwissel (`src/lib/useTimers.tsx`).
- **De wake lock wordt opnieuw aangevraagd bij `visibilitychange`** — hij komt
  niet vanzelf terug (`src/lib/useWakeLock.ts`).
- **De kookklok kapt geen segmenten af.** De breedte is de duur; een plafond
  zou een korte stap breder kunnen maken dan een lange en de bewering die de
  balk doet omdraaien (`src/lib/kookklok.ts`).
- **`raw_input` wordt altijd bewaard.** Met een betere prompt kun je herparsen
  zonder de bron opnieuw te zoeken.
- **De parser vertaalt naar het Nederlands, maar rekent niets om.** Een
  Amerikaanse cup is geen Nederlandse kop en 350 °F is geen 180 °C; dat
  omrekenen is een aparte bewerking met eigen fouten. Niet-metrische maten
  blijven staan en worden in `parse_notes` gemeld.
- **`language` bevat de taal van de bron, niet van de opgeslagen tekst.** Die
  is altijd Nederlands. Zo blijft zichtbaar dát er vertaald is, wat uitmaakt
  als een formulering raar leest.
- **Gefaalde inzendingen worden nooit opgeruimd.** Ze zijn het materiaal voor
  die herparse.
- **De app-ingang werkt op je inlogsessie, niet op het gedeelde geheim.** Dat
  hoort niet in een browserbundel. `/api/submit` verifieert je Supabase-token
  en accepteert alleen de eigenaar; daarna komt een inzending in dezelfde
  queue en door dezelfde parser als een mail. Eén pijplijn, twee ingangen.
- **Pdf's gaan onbewerkt naar Claude, zonder tekstextractie vooraf.** Dat
  scheelt een bibliotheek die zich slecht laat bundelen (pdfjs verwacht
  browserglobals als `DOMMatrix`) én het werkt beter: Claude ziet de opmaak, en
  een gescande pdf zonder tekstlaag komt er net zo goed doorheen.
- **Foto's worden in de browser verkleind vóór het uploaden.** Een
  telefoonfoto is zo 4 MB en Claude weigert boven de 5; zonder die stap zou je
  wachten op een mislukking.
- **In Apps Script staat geen Supabase-sleutel.** Supabase weigert secret keys
  bij verzoeken die op een browser lijken, en de User-Agent van Apps Script
  valt daaronder. Alles loopt via `/api/bridge`; bijlagen gaan met een signed
  upload URL alsnog rechtstreeks naar Storage, zodat de 6 MB-grens op de
  request body omzeild blijft.

## Wat er bewust niet in zit

Tags, maaltijdplanner, boodschappenlijst, macro's, porties schalen, delen,
meerdere gebruikers, videotranscriptie, offline-modus, native app, import uit
andere apps. Elk van die dingen is verdedigbaar; geen ervan is nodig om te
toetsen of dit product gebruikt gaat worden.
