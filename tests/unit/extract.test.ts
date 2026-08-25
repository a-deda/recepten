import { describe, expect, it } from 'vitest';
import {
  bepaalBron,
  htmlNaarTekst,
  jsonLdRecept,
  vindUrl,
} from '../../netlify/functions/_lib/extract';
import type { Inzending } from '../../netlify/functions/_lib/types';

function inzending(velden: Partial<Inzending>): Inzending {
  return {
    message_id: 'x',
    from: 'jij@voorbeeld.nl',
    subject: '',
    body: '',
    attachments: [],
    ...velden,
  };
}

describe('routeren op inhoud', () => {
  it('herkent een URL in de body', () => {
    expect(bepaalBron(inzending({ body: 'kijk: https://blog.nl/pasta' }))).toBe('url');
  });

  it('kiest de foto boven de tekst', () => {
    expect(
      bepaalBron(
        inzending({
          body: 'https://blog.nl/pasta',
          attachments: [{ path: 'u/1.jpg', mime: 'image/jpeg', name: '1.jpg' }],
        }),
      ),
    ).toBe('image');
  });

  it('herkent een pdf-bijlage', () => {
    expect(
      bepaalBron(
        inzending({
          attachments: [{ path: 'u/1.pdf', mime: 'application/pdf', name: '1.pdf' }],
        }),
      ),
    ).toBe('pdf');
  });

  it('herkent een kookboekverwijzing aan het paginanummer', () => {
    expect(bepaalBron(inzending({ body: 'Ottolenghi Simple, p. 142 — aubergine' }))).toBe('book');
    expect(bepaalBron(inzending({ body: 'Blz. 88 uit de Zilveren Lepel' }))).toBe('book');
  });

  it('valt terug op platte tekst', () => {
    expect(bepaalBron(inzending({ body: 'ui, knoflook, tomaat, basilicum' }))).toBe('text');
  });

  it('strippt leestekens achter een URL', () => {
    expect(vindUrl('zie https://blog.nl/pasta.')).toBe('https://blog.nl/pasta');
  });
});

describe('JSON-LD', () => {
  it('vindt een Recipe-node', () => {
    const html = `<html><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Recipe","name":"Pasta"}
    </script></html>`;
    expect(jsonLdRecept(html)).toContain('"name":"Pasta"');
  });

  it('vindt een Recipe in een @graph', () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Soep"}]}
    </script>`;
    expect(jsonLdRecept(html)).toContain('Soep');
  });

  it('slaat kapotte JSON-LD over zonder te struikelen', () => {
    const html = `<script type="application/ld+json">{kapot,</script>`;
    expect(jsonLdRecept(html)).toBeNull();
  });

  it('geeft null als er geen recept in staat', () => {
    const html = `<script type="application/ld+json">{"@type":"Article"}</script>`;
    expect(jsonLdRecept(html)).toBeNull();
  });
});

describe('html naar tekst', () => {
  it('gooit script en style weg', () => {
    const tekst = htmlNaarTekst(
      '<style>.a{color:red}</style><p>Ui snijden</p><script>alert(1)</script>',
    );
    expect(tekst).toContain('Ui snijden');
    expect(tekst).not.toContain('alert');
    expect(tekst).not.toContain('color:red');
  });

  it('zet blokeindes om in regeleindes', () => {
    expect(htmlNaarTekst('<li>een</li><li>twee</li>')).toBe('een\ntwee');
  });

  it('decodeert entiteiten', () => {
    expect(htmlNaarTekst('<p>zout &amp; peper</p>')).toBe('zout & peper');
  });
});
