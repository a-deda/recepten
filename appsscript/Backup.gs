/**
 * Wekelijkse backup naar Drive (PRD §9).
 *
 * Bouw dit in week één, niet "als het draait". Twintig regels, nul kosten, en
 * het beschermt precies datgene waarvoor je dit bouwt: de verzameling zelf.
 *
 * De trigger wordt aangemaakt door installeer() in Code.gs. De recepten komen
 * via /api/bridge binnen; er staat ook hier geen Supabase-sleutel.
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

/** Paginerend ophalen; ook bij duizend recepten blijft dit één call per 1000. */
function haalAlleRecepten_() {
  var alles = [];
  var offset = 0;

  while (true) {
    var antwoord = roepNetlify_('/api/bridge', {
      actie: 'export',
      offset: offset,
      limit: 1000
    });

    alles = alles.concat(antwoord.recepten || []);
    if (!antwoord.meer) break;
    offset += 1000;
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
