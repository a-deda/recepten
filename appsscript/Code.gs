/**
 * Receptenbak — Apps Script poller (PRD §3).
 *
 * Draait op een APART Gmail-account, niet op je persoonlijke. Een script met
 * Gmail-scope leest álle mail in dat account; je wilt geen leesrechten op je
 * eigen inbox, ook al is het je eigen script.
 *
 * Eén trigger, elke minuut, vier taken per run:
 *   1. ongelezen mail met het label Receptenbak/nieuw ophalen
 *   2. bijlagen rechtstreeks naar Supabase Storage, via een signed upload URL
 *      (niet door de function heen: Netlify accepteert ~6 MB en een
 *      iPhone-foto van 4 MB wordt base64 ruim 5)
 *   3. Supabase wakker houden
 *   4. bevestigingsmails terugsturen voor verwerkte rijen
 *
 * Er staat hier GEEN Supabase-sleutel. Supabase weigert secret keys bij
 * verzoeken die op een browser lijken, en de User-Agent van UrlFetchApp valt
 * daaronder — een header die je hier niet mag overschrijven. Alle
 * databasetoegang loopt daarom via /api/bridge op Netlify, waar de sleutel
 * hoort. Dit script kent alleen het gedeelde geheim.
 *
 * Installatie: zie SETUP.md.
 */

// Genest onder één ouderlabel, zodat het in de Gmail-zijbalk bij elkaar staat.
// Let op: 'inbox' kan hier NIET staan. Gmail reserveert INBOX, SENT, DRAFT,
// SPAM, TRASH, STARRED, IMPORTANT, UNREAD en CHAT als systeemlabels, en
// weigert een gebruikerslabel met die naam met "Invalid label name".
var LABEL = 'Receptenbak/nieuw';
var LABEL_KLAAR = 'Receptenbak/verwerkt';
var MAX_THREADS_PER_RUN = 10;
var MAX_BIJLAGE_BYTES = 20 * 1024 * 1024;

// Draait de worker niet als background function op jouw Netlify-plan, dan is
// dit het enige dat verandert: '/api/worker' met de synchrone variant.
var WORKER_PAD = '/.netlify/functions/worker-background';

function eig_(naam) {
  var waarde = PropertiesService.getScriptProperties().getProperty(naam);
  if (!waarde) {
    throw new Error('Script Property ' + naam + ' ontbreekt. Zie SETUP.md.');
  }
  return waarde.trim();
}

function siteUrl_() {
  return eig_('SITE_URL').replace(/\/+$/, '');
}

/**
 * Elke aanroep naar Netlify loopt hierdoorheen: één plek voor het geheim, één
 * plek waar een foutmelding het antwoord van de server meeneemt in plaats van
 * alleen een statuscode.
 */
function roepNetlify_(pad, payload) {
  var opties = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': eig_('INTAKE_SECRET') },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  };

  var url = siteUrl_() + pad;
  var res = UrlFetchApp.fetch(url, opties);
  var code = res.getResponseCode();

  if (code >= 300) {
    // De volledige URL erbij: bij een 404 is de vraag bijna altijd "welk adres
    // heeft hij dan opgevraagd", en dat kun je niet raden uit het pad alleen.
    throw new Error(url + ' gaf ' + code + ': ' + res.getContentText());
  }

  var tekst = res.getContentText();
  return tekst ? JSON.parse(tekst) : {};
}

/** De enige functie waar de minuut-trigger op staat. */
function pollen() {
  var fouten = [];

  try {
    verwerkNieuweMail_();
  } catch (e) {
    fouten.push('mail: ' + e.message);
  }

  // Eén keer per run, ná de mail: de worker pakt tot 25 rijen per aanroep, dus
  // per bericht pokén is verspilling. Belangrijker: een mislukte poke hoort
  // hier in `fouten` te belanden. Logde hij alleen naar de console, dan blijft
  // je queue op `pending` staan zonder dat iets erover klaagt — precies de
  // stille storing die dit project niet mag hebben (§11).
  try {
    pookWorker_();
  } catch (e) {
    fouten.push('worker: ' + e.message);
  }

  try {
    roepNetlify_('/api/bridge', { actie: 'keep-alive' });
  } catch (e) {
    fouten.push('keep-alive: ' + e.message);
  }

  try {
    stuurBevestigingen_();
  } catch (e) {
    fouten.push('bevestigingen: ' + e.message);
  }

  if (fouten.length > 0) {
    // Zichtbaar in Uitvoeringen; een stille storing is het ergste faalgeval.
    throw new Error(fouten.join(' | '));
  }
}

// ---------------------------------------------------------------------------
// 1 + 2: mail ophalen en bijlagen uploaden
// ---------------------------------------------------------------------------

function verwerkNieuweMail_() {
  var label = GmailApp.getUserLabelByName(LABEL);
  if (!label) {
    throw new Error('Label "' + LABEL + '" bestaat niet. Draai installeer().');
  }
  maakLabel_(LABEL_KLAAR);
  var klaarLabel = GmailApp.getUserLabelByName(LABEL_KLAAR);

  var threads = label.getThreads(0, MAX_THREADS_PER_RUN);

  for (var t = 0; t < threads.length; t++) {
    var berichten = threads[t].getMessages();
    var alleGelukt = true;

    for (var m = 0; m < berichten.length; m++) {
      var bericht = berichten[m];
      if (!bericht.isUnread()) continue;

      try {
        stuurInzending_(bericht);
        bericht.markRead();
      } catch (e) {
        alleGelukt = false;
        console.error('Mail ' + bericht.getId() + ' mislukt: ' + e.message);
        // Ongelezen laten: de volgende run probeert het opnieuw. De intake is
        // idempotent op message_id, dus een dubbele poging kost niets.
      }
    }

    if (alleGelukt) {
      threads[t].removeLabel(label).addLabel(klaarLabel);
    }
  }
}

function stuurInzending_(bericht) {
  var messageId = bericht.getId();
  var bijlagen = uploadBijlagen_(bericht, messageId);

  roepNetlify_('/api/intake', {
    message_id: messageId,
    from: bericht.getFrom(),
    reply_to: bericht.getReplyTo() || bericht.getFrom(),
    subject: bericht.getSubject() || '',
    body: bericht.getPlainBody() || '',
    attachments: bijlagen
  });
}

/**
 * Bijlagen gaan rechtstreeks naar Storage, niet door de intake-function heen.
 * Dit is geen optimalisatie maar een randvoorwaarde (§3): Netlify accepteert
 * ongeveer 6 MB request body en een foto van 4 MB wordt base64 ruim 5.
 *
 * De brug levert een eenmalige upload-URL; die bevat zelf het token, dus hier
 * is geen sleutel nodig. De brug bepaalt ook het pad, want de eerste map moet
 * de owner-uuid zijn — daar matcht de RLS-policy op storage.objects op.
 */
function uploadBijlagen_(bericht, messageId) {
  var bijlagen = bericht.getAttachments({
    includeInlineImages: true,
    includeAttachments: true
  });
  var resultaat = [];

  for (var i = 0; i < bijlagen.length; i++) {
    var bijlage = bijlagen[i];
    var mime = bijlage.getContentType() || '';
    var bruikbaar = mime.indexOf('image/') === 0 || mime === 'application/pdf';
    if (!bruikbaar) continue;

    if (bijlage.getSize() > MAX_BIJLAGE_BYTES) {
      throw new Error('Bijlage ' + bijlage.getName() + ' is groter dan 20 MB.');
    }

    var antwoord = roepNetlify_('/api/bridge', {
      actie: 'upload-url',
      message_id: messageId,
      index: i,
      extensie: bestandsextensie_(bijlage.getName(), mime)
    });

    var res = UrlFetchApp.fetch(antwoord.signedUrl, {
      method: 'put',
      contentType: mime,
      payload: bijlage.copyBlob().getBytes(),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() >= 300) {
      throw new Error(
        'Upload van ' + bijlage.getName() + ' gaf ' + res.getResponseCode() +
          ': ' + res.getContentText()
      );
    }

    resultaat.push({ path: antwoord.path, mime: mime, name: bijlage.getName() });
  }

  return resultaat;
}

function bestandsextensie_(naam, mime) {
  var punt = naam.lastIndexOf('.');
  if (punt > 0 && naam.length - punt <= 5) return naam.substring(punt).toLowerCase();
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/heic') return '.heic';
  return '.jpg';
}

/**
 * De worker is een background function: hij antwoordt meteen 202 en werkt
 * daarna tot 15 minuten door. Deze aanroep blokkeert de trigger dus niet.
 */
function pookWorker_() {
  var url = siteUrl_() + WORKER_PAD;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'x-intake-secret': eig_('INTAKE_SECRET') },
    payload: '',
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code >= 400) {
    var hint = code === 404
      ? ' — een 404 betekent meestal dat background functions niet beschikbaar ' +
        'zijn op je Netlify-plan. Zie SETUP.md stap 4 voor de synchrone variant.'
      : '';
    throw new Error(url + ' gaf ' + code + ': ' + res.getContentText() + hint);
  }
}

// ---------------------------------------------------------------------------
// 4: bevestigingsmails
// ---------------------------------------------------------------------------

/**
 * Verplicht in blok 1, niet later (§11). Zonder dit verdwijnt een mail zonder
 * spoor en weet je pas weken later dat de funnel stukstaat.
 *
 * Gmail is hier zowel de ingang als de uitgang: geen mailservice nodig.
 */
function stuurBevestigingen_() {
  var antwoord = roepNetlify_('/api/bridge', { actie: 'te-melden' });
  var rijen = antwoord.rijen || [];
  var gemeld = [];

  for (var i = 0; i < rijen.length; i++) {
    try {
      beantwoord_(rijen[i]);
      gemeld.push(rijen[i].id);
    } catch (e) {
      console.error('Bevestiging voor ' + rijen[i].id + ' mislukt: ' + e.message);
    }
  }

  if (gemeld.length > 0) {
    roepNetlify_('/api/bridge', { actie: 'gemeld', ids: gemeld });
  }
}

function beantwoord_(rij) {
  var payload = rij.payload || {};
  var ontvanger = payload.reply_to || payload.from;

  var onderwerp, tekst;

  if (rij.status === 'done') {
    var titels = (rij.result && rij.result.titles) || [];
    onderwerp = 'Toegevoegd: ' + (titels[0] || 'recept');
    tekst =
      titels.length > 1
        ? 'Toegevoegd:\n\n- ' + titels.join('\n- ') + '\n\nZe staan in je inbox om te keuren.'
        : 'Toegevoegd: ' + (titels[0] || 'recept') + '\n\nHij staat in je inbox om te keuren.';
  } else {
    onderwerp = 'Mislukt: ' + (payload.subject || 'inzending');
    tekst =
      'Mislukt: ' + (rij.error || 'onbekende reden') +
      '\n\nDe inzending blijft bewaard; met een betere parser kun je hem opnieuw draaien.';
  }

  // Antwoorden in dezelfde thread als de oorspronkelijke mail, zodat de
  // bevestiging naast je inzending staat.
  var origineel = null;
  try {
    origineel = GmailApp.getMessageById(rij.message_id);
  } catch (e) {
    origineel = null;
  }

  if (origineel) {
    origineel.reply(tekst);
  } else if (ontvanger) {
    GmailApp.sendEmail(ontvanger, onderwerp, tekst);
  }
  // Geen afzender om op te antwoorden (bijvoorbeeld een testinzending): niets
  // sturen, maar de rij wél als gemeld markeren, anders komt hij elke minuut
  // terug.
}

// ---------------------------------------------------------------------------
// Eenmalige installatie en diagnose
// ---------------------------------------------------------------------------

/** Draai dit één keer met de hand: maakt labels en beide triggers aan. */
function installeer() {
  maakLabel_(LABEL);
  maakLabel_(LABEL_KLAAR);

  var bestaand = ScriptApp.getProjectTriggers();
  for (var i = 0; i < bestaand.length; i++) {
    ScriptApp.deleteTrigger(bestaand[i]);
  }

  ScriptApp.newTrigger('pollen').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('backupNaarDrive').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();

  console.log(
    'Klaar. Labels "' + LABEL + '" en "' + LABEL_KLAAR + '" staan, ' +
      'plus twee triggers (elke minuut pollen, zondag 4 uur backuppen).'
  );
}

/**
 * Maakt een label als het nog niet bestaat, en zegt duidelijk wat er misging
 * als Gmail het weigert — anders sta je met een kale "Invalid argument" en een
 * regelnummer.
 */
function maakLabel_(naam) {
  if (GmailApp.getUserLabelByName(naam)) return;

  try {
    GmailApp.createLabel(naam);
  } catch (e) {
    throw new Error(
      'Label "' + naam + '" kon niet worden aangemaakt: ' + e.message +
        '. Gmail weigert namen die botsen met een systeemlabel (inbox, sent, ' +
        'draft, spam, trash, starred, important, unread, chat). Kies een ' +
        'andere naam bovenin dit bestand.'
    );
  }
}

/** Draai dit als er iets niet werkt: toetst beide instellingen en de brug. */
function controleerInstellingen() {
  var props = PropertiesService.getScriptProperties();

  var namen = ['SITE_URL', 'INTAKE_SECRET'];
  for (var i = 0; i < namen.length; i++) {
    var waarde = props.getProperty(namen[i]);
    if (!waarde) {
      console.log(namen[i] + ': ONTBREEKT');
      continue;
    }
    var geheim = namen[i].indexOf('SECRET') >= 0;
    console.log(
      namen[i] + ': ' +
        (geheim ? waarde.substring(0, 6) + '… (' + waarde.length + ' tekens)' : waarde) +
        (waarde !== waarde.trim() ? '  ⚠️ WITRUIMTE AAN BEGIN OF EIND' : '')
    );
  }

  console.log('Roept aan: ' + siteUrl_() + '/api/bridge');
  var antwoord = roepNetlify_('/api/bridge', { actie: 'keep-alive' });
  console.log('Brug antwoordde: ' + JSON.stringify(antwoord));
  try {
    pookWorker_();
    console.log('Worker: ok (' + siteUrl_() + WORKER_PAD + ')');
  } catch (e) {
    console.log('Worker: MISLUKT — ' + e.message);
  }

  console.log('Labels: ' +
    (GmailApp.getUserLabelByName(LABEL) ? 'ok' : 'ONTBREEKT') + ' / ' +
    (GmailApp.getUserLabelByName(LABEL_KLAAR) ? 'ok' : 'ONTBREEKT'));
  console.log('Triggers: ' + ScriptApp.getProjectTriggers().length);
}
