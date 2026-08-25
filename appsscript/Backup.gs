/**
 * Wekelijkse backup naar Drive (PRD §9).
 *
 * Bouw dit in week één, niet "als het draait". Twintig regels, nul kosten, en
 * het beschermt precies datgene waarvoor je dit bouwt: de verzameling zelf.
 *
 * De trigger wordt aangemaakt door installeer() in Code.gs.
 */

var BACKUP_MAP = 'Receptenbak backups';
var BEWAAR_AANTAL = 12; // ongeveer een kwartaal aan wekelijkse exports

function backupNaarDrive() {
  var recepten = haalAlleRecepten_();

  var bestandsnaam =
    'recepten-' +
    Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd') +
    '.json';

  var map = zoekOfMaakMap_(BACKUP_MAP);
  map.createFile(
    bestandsnaam,
    JSON.stringify(recepten, null, 2),
    MimeType.PLAIN_TEXT
  );

  ruimOudeOp_(map);
  console.log(bestandsnaam + ': ' + recepten.length + ' recepten weggeschreven.');
}

/** Paginerend ophalen; ook bij duizend recepten blijft dit één API-call per 1000. */
function haalAlleRecepten_() {
  var alles = [];
  var offset = 0;
  var pagina = 1000;

  while (true) {
    var res = UrlFetchApp.fetch(
      eig_('SUPABASE_URL') +
        '/rest/v1/recipes?select=*&order=created_at.asc' +
        '&offset=' + offset + '&limit=' + pagina,
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
      throw new Error('backup: recipes lezen gaf ' + res.getResponseCode());
    }

    var rijen = JSON.parse(res.getContentText());
    alles = alles.concat(rijen);
    if (rijen.length < pagina) break;
    offset += pagina;
  }

  return alles;
}

function zoekOfMaakMap_(naam) {
  var mappen = DriveApp.getFoldersByName(naam);
  return mappen.hasNext() ? mappen.next() : DriveApp.createFolder(naam);
}

/** Oude exports opruimen zodat de map niet eindeloos groeit. */
function ruimOudeOp_(map) {
  var bestanden = [];
  var it = map.getFiles();
  while (it.hasNext()) bestanden.push(it.next());

  bestanden.sort(function (a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });

  for (var i = BEWAAR_AANTAL; i < bestanden.length; i++) {
    bestanden[i].setTrashed(true);
  }
}
