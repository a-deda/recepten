# Opzetten

Dit zijn de stappen die ik niet voor je kan doen: accounts aanmaken, sleutels
ophalen, en één keer koken. Reken op een uur voor stap 1 t/m 7.

Volgorde is belangrijk: elke stap levert een waarde op die de volgende nodig
heeft.

---

## 1. Supabase-project

1. Maak op [supabase.com](https://supabase.com) een gratis project.
2. **SQL Editor** → draai de bestanden uit `supabase/migrations/` op volgorde:
   `0001_schema.sql`, `0002_rls.sql`, `0003_storage.sql`, `0004_functions.sql`.
3. **Authentication → Providers → Email**: zet *Confirm email* aan en
   *Enable email provider* aan. Magic link werkt dan zonder wachtwoord.
4. **Authentication → Users → Add user**: je eigen e-mailadres. Noteer de
   `uuid` van die gebruiker — dat is straks `OWNER_ID`.
5. **Project Settings → API**: noteer
   - `Project URL` → `SUPABASE_URL` en `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

> De service-role key omzeilt RLS. Hij hoort in Netlify-omgevingsvariabelen en
> in Apps Script Script Properties, nergens anders. Niet in `.env` die je deelt,
> niet in de frontend, niet in git.

## 2. Anthropic-sleutel

[console.anthropic.com](https://console.anthropic.com) → API Keys → nieuwe
sleutel → `ANTHROPIC_API_KEY`. Zet een spending limit; bij dit volume kost het
enkele euro's per jaar, maar een limiet kost niets.

## 3. Gedeeld geheim

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Dat is `INTAKE_SECRET`. Apps Script en de intake-endpoint delen hem.

## 4. Netlify

1. Koppel deze repo aan een nieuwe site. Build command en publish directory
   staan al in `netlify.toml`.
2. **Site configuration → Environment variables**, zet:

   | Naam | Waarde |
   |---|---|
   | `SUPABASE_URL` | uit stap 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | uit stap 1 |
   | `ANTHROPIC_API_KEY` | uit stap 2 |
   | `INTAKE_SECRET` | uit stap 3 |
   | `OWNER_ID` | de user-uuid uit stap 1 |
   | `VITE_SUPABASE_URL` | zelfde als `SUPABASE_URL` |
   | `VITE_SUPABASE_ANON_KEY` | uit stap 1 |

3. Deploy. Noteer de site-URL.
4. Zet die URL ook in Supabase onder **Authentication → URL Configuration →
   Site URL**, anders werkt de magic link niet.

**Controleer meteen of background functions op jouw plan draaien.** Roep aan:

```bash
curl -i -X POST -H "x-intake-secret: $INTAKE_SECRET" \
  https://<jouw-site>/.netlify/functions/worker-background
```

Een `202` is goed. Krijg je een `404`, dan ondersteunt je plan geen background
functions. Hernoem `netlify/functions/worker-background.ts` naar `worker.ts`,
zet `MAX_RIJEN_PER_RUN` op `1`, en laat Apps Script de worker in een lus pokén
tot hij `{"verwerkt":0}` teruggeeft. De code is er verder klaar voor.

## 5. Apart Gmail-account

Maak een **nieuw** Gmail-account, bijvoorbeeld `recepten.<iets>@gmail.com`.

Niet een plus-alias op je eigen adres: een Apps Script met Gmail-scope leest
*alle* mail in het account waar het draait. Je wilt geen script met leesrechten
op je persoonlijke inbox, ook al is het je eigen script. Dit kost twee minuten.

Zet het adres in je contacten, zodat doorsturen vanaf je telefoon één tik is.
Dat is de goedkoopste wrijvingsreductie in het hele project.

## 6. Apps Script

1. Log in op het nieuwe account, ga naar
   [script.google.com](https://script.google.com) → **Nieuw project**.
2. Plak `appsscript/Code.gs` en `appsscript/Backup.gs` als twee bestanden.
3. **Projectinstellingen** → "Manifestbestand appsscript.json weergeven" aan →
   plak de inhoud van `appsscript/appsscript.json`.
4. **Projectinstellingen → Scripteigenschappen**, zet:

   | Naam | Waarde |
   |---|---|
   | `SUPABASE_URL` | uit stap 1 |
   | `SUPABASE_SERVICE_KEY` | de service-role key uit stap 1 |
   | `INTAKE_URL` | `https://<jouw-site>/api/intake` |
   | `WORKER_URL` | `https://<jouw-site>/.netlify/functions/worker-background` |
   | `INTAKE_SECRET` | uit stap 3 |
   | `OWNER_ID` | de user-uuid uit stap 1 |

5. Draai één keer met de hand de functie **`installeer`**. Geef toestemming als
   het scherm daarom vraagt. Dit maakt de labels `inbox` en `verwerkt` en zet
   twee triggers klaar: elke minuut pollen, zondagnacht backuppen.
6. **Gmail → Instellingen → Filters** → nieuw filter: *Aan* bevat je
   receptenadres → *Label toepassen: inbox*. Zonder dit label doet de poller
   niets.

## 7. Meet de parser vóór je hem vertrouwt

Zet in `scripts/testbronnen.txt` de tien blogs die **jij** echt gebruikt — een
faalpercentage op andermans bronnen zegt niets — en draai:

```bash
ANTHROPIC_API_KEY=... npm run parse-eval
```

Je krijgt het percentage dat lukt, de gemiddelde tijd, en per mislukking de
reden. Weet je faalpercentage voordat je twintig recepten instuurt.

---

## Werkt het?

Loop deze zes na. Elk punt dekt een andere route door de pijplijn.

1. **Blog-URL mailen** → binnen twee minuten een recept in Supabase met status
   `inbox`, plus een antwoordmail "Toegevoegd: …".
2. **Foto van een kookboekpagina mailen** → controleert het Storage-pad en de
   vision-route.
3. **Losse tekst mailen** ("Ottolenghi Simple, p. 142, aubergine en yoghurt")
   → een recept met `source_book` gevuld en lege stappen.
4. **Een nieuwsbrief doorsturen** → moet terugkomen als "Mislukt: …" met een
   reden, en géén leeg recept in je bak zetten. Gaat dit mis, dan is dat het
   ergste faalgeval: dan wordt de bak alsnog een vuilnisbelt.
5. **Inloggen op je telefoon** → magic link, lijst binnen een seconde,
   zoekveld vindt een recept op een ingrediënt.
6. **Eén echt gerecht koken met de app.** Dat is de enige review die telt.

## Wat geen enkele test hier voor je doet

- Of de **wake lock** het houdt op jouw telefoon.
- Of de **tapzones** werken met vette handen.
- Of de tekst **leesbaar** is onder jouw keukenlamp, op een halve meter.
- Of de **timer een schermvergrendeling overleeft** (de code rekent met een
  eindtijdstip juist daarvoor, maar meten is weten).

Plan daar één echte kooksessie voor in.

## Na acht dagen stilte

Het gratis Supabase-project pauzeert bij inactiviteit. De minuut-trigger doet
daarom een goedkope `select` op `recipes`. Vertrouw daar niet blind op:
**controleer na acht dagen zonder gebruik of het project nog draait.** Doet
het dat niet, dan is een GitHub Actions-cron die dezelfde select doet de
gratis terugvaloptie.

## Als er iets stukgaat

| Verschijnsel | Kijk hier |
|---|---|
| Geen bevestigingsmail | Apps Script → **Uitvoeringen**; de poller gooit een fout bij problemen |
| Mail komt niet binnen | Staat het Gmail-filter goed? Heeft de mail het label `inbox`? |
| `401` op de intake | `INTAKE_SECRET` verschilt tussen Netlify en Script Properties |
| Recept blijft `pending` | Wordt de worker gepookt? Zie de background-functions-check in stap 4 |
| "Mislukt: pagina gaf status 403" | Cookiemuur of Cloudflare. Kopieer de tekst en mail die |
| Instagram-link faalt | Verwacht: loginmuur. Kopieer de caption en mail die |
| Foto's laden niet in de app | Staat het Storage-pad onder `<OWNER_ID>/…`? De RLS-policy eist dat |

Gefaalde inzendingen blijven in `intake_queue` staan met status `failed` en de
volledige payload. Als de prompt later beter is, kun je ze opnieuw draaien
zonder de bron terug te zoeken.
