/**
 * Receptenbak — Apps Script poller (PRD §3).
 *
 * Draait op een APART Gmail-account, niet op je persoonlijke. Een script met
 * Gmail-scope leest álle mail in dat account; je wilt geen leesrechten op je
 * eigen inbox, ook al is het je eigen script.
 *
 * Eén trigger, elke minuut, vier taken per run:
 *   1. ongelezen mail met label `inbox` ophalen
 *   2. bijlagen rechtstreeks naar Supabase Storage (niet door de function heen:
 *      Netlify accepteert ~6 MB en een iPhone-foto van 4 MB wordt base64 ruim 5)
 *   3. Supabase wakker houden met één goedkope select
 *   4. bevestigingsmails terugsturen voor verwerkte rijen
 *
 * Installatie: zie SETUP.md. Alle waarden komen uit Script Properties, er staat
 * geen geheim in deze code.
 */

var LABEL = 'inbox';
var LABEL_KLAAR = 'verwerkt';
var MAX_THREADS_PER_RUN = 10;
var MAX_BIJLAGE_BYTES = 20 * 1024 * 1024;

function eig_(naam) {
  var waarde = PropertiesService.getScriptProperties().getProperty(naam);
  if (!waarde) {
    throw new Error('Script Property ' + naam + ' ontbreekt. Zie SETUP.md.');
  }
  return waarde;
}

/** De enige functie waar de trigger op staat. */
function pollen() {
  var fouten = [];

  try {
    verwerkNieuweMail_();
  } catch (e) {
    fouten.push('mail: ' + e.message);
  }

  try {
    houdSupabaseWakker_();
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
    throw new Error('Label "' + LABEL + '" bestaat niet in dit account.');
  }
  var klaarLabel = GmailApp.getUserLabelByName(LABEL_KLAAR) ||
    GmailApp.createLabel(LABEL_KLAAR);

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

  var payload = {
    message_id: messageId,
    from: bericht.getFrom(),
    reply_to: bericht.getReplyTo() || bericht.getFrom(),
    subject: bericht.getSubject() || '',
    body: bericht.getPlainBody() || '',
    attachments: bijlagen
  };

  var res = UrlFetchApp.fetch(eig_('INTAKE_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': eig_('INTAKE_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    throw new Error('intake gaf ' + res.getResponseCode() + ': ' + res.getContentText());
  }

  pookWorker_();
}

/**
 * Bijlagen gaan rechtstreeks naar Storage; de function krijgt alleen paden.
 * Dit is geen optimalisatie maar een randvoorwaarde (§3).
 *
 * Pad: <OWNER_ID>/<messageId>-<n>.<ext> — de eerste map moet de owner-uuid
 * zijn, anders laat de RLS-policy op storage.objects de frontend het bestand
 * niet lezen.
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

    var extensie = bestandsextensie_(bijlage.getName(), mime);
    var pad = eig_('OWNER_ID') + '/' + messageId + '-' + i + extensie;

    var res = UrlFetchApp.fetch(
      eig_('SUPABASE_URL') + '/storage/v1/object/recipe-images/' + encodeURI(pad),
      {
        method: 'post',
        contentType: mime,
        headers: {
          // Beide headers, net als elke andere aanroep hier en net als de
          // officiële client doet. De nieuwe sleutels (sb_secret_…) worden op
          // de `apikey`-header herkend; alleen een Bearer meesturen werkte
          // met de oude JWT-sleutels en is nu een stille faalkans.
          apikey: eig_('SUPABASE_SERVICE_KEY'),
          Authorization: 'Bearer ' + eig_('SUPABASE_SERVICE_KEY'),
          'x-upsert': 'true'
        },
        payload: bijlage.copyBlob().getBytes(),
        muteHttpExceptions: true
      }
    );

    if (res.getResponseCode() >= 300) {
      throw new Error(
        'Upload van ' + bijlage.getName() + ' gaf ' + res.getResponseCode() +
          ': ' + res.getContentText()
      );
    }

    resultaat.push({ path: pad, mime: mime, name: bijlage.getName() });
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
  var res = UrlFetchApp.fetch(eig_('WORKER_URL'), {
    method: 'post',
    headers: { 'x-intake-secret': eig_('INTAKE_SECRET') },
    payload: '',
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) {
    console.error('worker gaf ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

// ---------------------------------------------------------------------------
// 3: Supabase wakker houden
// ---------------------------------------------------------------------------

/**
 * Eén goedkope select telt als API-activiteit en houdt het gratis project uit
 * de pauze (§9). Verifieer dit na acht dagen stilte in plaats van erop te
 * vertrouwen; pauzeert het project tóch, dan is een GitHub Actions-cron de
 * terugvaloptie.
 */
function houdSupabaseWakker_() {
  var res = UrlFetchApp.fetch(
    eig_('SUPABASE_URL') + '/rest/v1/recipes?select=id&limit=1',
    {
      method: 'get',
      headers: {
        apikey: eig_('SUPABASE_SERVICE_KEY'),
        Authorization: 'Bearer ' + eig_('SUPABASE_SERVICE_KEY')
      },
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() >= 300) {
    throw new Error('keep-alive gaf ' + res.getResponseCode());
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
  var res = UrlFetchApp.fetch(
    eig_('SUPABASE_URL') +
      '/rest/v1/intake_queue' +
      '?select=id,status,error,result,payload,message_id' +
      '&notified_at=is.null&status=in.(done,failed)&limit=20',
    {
      method: 'get',
      headers: {
        apikey: eig_('SUPABASE_SERVICE_KEY'),
        Authorization: 'Bearer ' + eig_('SUPABASE_SERVICE_KEY')
      },
      muteHttpExceptions: true
    }
  );

  if (res.getResponseCode() >= 300) {
    throw new Error('queue lezen gaf ' + res.getResponseCode());
  }

  var rijen = JSON.parse(res.getContentText());

  for (var i = 0; i < rijen.length; i++) {
    var rij = rijen[i];
    try {
      beantwoord_(rij);
      markeerGemeld_(rij.id);
    } catch (e) {
      console.error('Bevestiging voor ' + rij.id + ' mislukt: ' + e.message);
    }
  }
}

function beantwoord_(rij) {
  var payload = rij.payload || {};
  var ontvanger = payload.reply_to || payload.from;
  if (!ontvanger) {
    // Geen afzender om op te antwoorden (bijvoorbeeld een testinzending):
    // wel als gemeld markeren, anders blijft hij elke minuut terugkomen.
    return;
  }

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
  } else {
    GmailApp.sendEmail(ontvanger, onderwerp, tekst);
  }
}

function markeerGemeld_(id) {
  var res = UrlFetchApp.fetch(
    eig_('SUPABASE_URL') + '/rest/v1/intake_queue?id=eq.' + id,
    {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        apikey: eig_('SUPABASE_SERVICE_KEY'),
        Authorization: 'Bearer ' + eig_('SUPABASE_SERVICE_KEY'),
        Prefer: 'return=minimal'
      },
      payload: JSON.stringify({ notified_at: new Date().toISOString() }),
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() >= 300) {
    throw new Error('notified_at zetten gaf ' + res.getResponseCode());
  }
}

// ---------------------------------------------------------------------------
// Eenmalige installatie
// ---------------------------------------------------------------------------

/** Draai dit één keer met de hand: maakt labels en beide triggers aan. */
function installeer() {
  if (!GmailApp.getUserLabelByName(LABEL)) GmailApp.createLabel(LABEL);
  if (!GmailApp.getUserLabelByName(LABEL_KLAAR)) GmailApp.createLabel(LABEL_KLAAR);

  var bestaand = ScriptApp.getProjectTriggers();
  for (var i = 0; i < bestaand.length; i++) {
    ScriptApp.deleteTrigger(bestaand[i]);
  }

  ScriptApp.newTrigger('pollen').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('backupNaarDrive').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();

  console.log('Klaar. Labels en triggers staan.');
}
