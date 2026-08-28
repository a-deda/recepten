/** Claude accepteert afbeeldingen tot 5 MB; blijf daar ruim onder. */
const MAX_ZIJDE = 2000;
const KWALITEIT = 0.85;
export const MAX_BESTAND_BYTES = 20 * 1024 * 1024;

/**
 * Rekent de doelafmetingen uit: alleen verkleinen, nooit vergroten, en de
 * verhouding blijft intact. Apart gehouden van het canvaswerk zodat het te
 * testen is zonder browser.
 */
export function pasAfmetingen(
  breedte: number,
  hoogte: number,
  max = MAX_ZIJDE,
): { breedte: number; hoogte: number } {
  const grootste = Math.max(breedte, hoogte);
  if (grootste <= max) return { breedte, hoogte };
  const factor = max / grootste;
  return {
    breedte: Math.round(breedte * factor),
    hoogte: Math.round(hoogte * factor),
  };
}

export function bestandExtensie(bestand: File): string {
  const punt = bestand.name.lastIndexOf('.');
  if (punt > 0 && bestand.name.length - punt <= 5) {
    return bestand.name.slice(punt).toLowerCase();
  }
  return bestand.type === 'application/pdf' ? '.pdf' : '.jpg';
}

export function isBruikbaar(bestand: File): boolean {
  return bestand.type.startsWith('image/') || bestand.type === 'application/pdf';
}

/**
 * Verkleint een foto in de browser voordat hij de lucht in gaat.
 *
 * Een iPhone-foto is al gauw 4 MB en Claude weigert boven de 5. Zonder deze
 * stap zou je een foto maken, wachten, en dan een mislukking zien — precies de
 * wrijving die dit product moet wegnemen. Pdf's en kleine bestanden gaan
 * onaangeraakt door.
 */
export async function verkleinIndienNodig(bestand: File): Promise<File> {
  if (!bestand.type.startsWith('image/')) return bestand;
  if (bestand.type === 'image/gif') return bestand;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(bestand);
  } catch {
    // Onbekend of kapot formaat: onaangeraakt doorsturen en de server laten
    // oordelen, in plaats van hier al te weigeren.
    return bestand;
  }

  const doel = pasAfmetingen(bitmap.width, bitmap.height);
  if (doel.breedte === bitmap.width && bestand.size < 4 * 1024 * 1024) {
    bitmap.close();
    return bestand;
  }

  const canvas = document.createElement('canvas');
  canvas.width = doel.breedte;
  canvas.height = doel.hoogte;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return bestand;
  }
  ctx.drawImage(bitmap, 0, 0, doel.breedte, doel.hoogte);
  bitmap.close();

  const blob = await new Promise<Blob | null>((klaar) =>
    canvas.toBlob(klaar, 'image/jpeg', KWALITEIT),
  );
  if (!blob || blob.size >= bestand.size) return bestand;

  return new File([blob], bestand.name.replace(/\.\w+$/, '') + '.jpg', {
    type: 'image/jpeg',
  });
}
