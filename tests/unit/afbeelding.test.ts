import { describe, expect, it } from 'vitest';
import { pasAfmetingen, bestandExtensie, isBruikbaar } from '../../src/lib/afbeelding';

function bestand(naam: string, type: string): File {
  return new File(['x'], naam, { type });
}

describe('pasAfmetingen', () => {
  it('laat een kleine foto met rust', () => {
    expect(pasAfmetingen(800, 600)).toEqual({ breedte: 800, hoogte: 600 });
  });

  it('verkleint naar de langste zijde', () => {
    expect(pasAfmetingen(4000, 3000)).toEqual({ breedte: 2000, hoogte: 1500 });
  });

  it('werkt ook staand', () => {
    expect(pasAfmetingen(3000, 4000)).toEqual({ breedte: 1500, hoogte: 2000 });
  });

  it('houdt de verhouding intact', () => {
    const { breedte, hoogte } = pasAfmetingen(4032, 3024);
    expect(breedte / hoogte).toBeCloseTo(4032 / 3024, 2);
  });

  it('vergroot nooit', () => {
    expect(pasAfmetingen(100, 100, 2000)).toEqual({ breedte: 100, hoogte: 100 });
  });
});

describe('bestandsherkenning', () => {
  it('accepteert foto en pdf', () => {
    expect(isBruikbaar(bestand('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isBruikbaar(bestand('a.pdf', 'application/pdf'))).toBe(true);
  });

  it('weigert de rest', () => {
    expect(isBruikbaar(bestand('a.docx', 'application/vnd.openxmlformats'))).toBe(false);
  });

  it('haalt de extensie uit de naam', () => {
    expect(bestandExtensie(bestand('recept.HEIC', 'image/heic'))).toBe('.heic');
  });

  it('valt terug op het mimetype', () => {
    expect(bestandExtensie(bestand('scan', 'application/pdf'))).toBe('.pdf');
    expect(bestandExtensie(bestand('foto', 'image/jpeg'))).toBe('.jpg');
  });
});
