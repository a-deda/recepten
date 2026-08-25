import { expect, test, type Page } from '@playwright/test';

const HARNAS = '/tests/e2e/harnas/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNAS);
  await expect(page.locator('.stap__tekst')).toBeVisible();
});


/**
 * Tikken zoals in de keuken: op een plek op het scherm, niet op een element.
 * De app handelt de tik af op basis van waar je hem zet (§8).
 */
async function tik(page: Page, kant: 'links' | 'rechts') {
  const { width, height } = page.viewportSize()!;
  await page.touchscreen.tap(kant === 'links' ? width * 0.15 : width * 0.8, height * 0.55);
}

async function stapTekst(page: Page): Promise<string> {
  return (await page.locator('.stap__tekst').innerText()).trim();
}

test('tik rechts gaat vooruit, tik links terug', async ({ page }) => {
  const eerste = await stapTekst(page);
  expect(page.locator('.kook__teller')).toHaveText('1 / 5');

  await tik(page, 'rechts');
  await expect(page.locator('.kook__teller')).toHaveText('2 / 5');
  expect(await stapTekst(page)).not.toBe(eerste);

  // Per ongeluk doorgetikt moet met één tik links te herstellen zijn (§8).
  await tik(page, 'links');
  await expect(page.locator('.kook__teller')).toHaveText('1 / 5');
  expect(await stapTekst(page)).toBe(eerste);
});

test('de eerste stap kan niet verder terug dan zichzelf', async ({ page }) => {
  await tik(page, 'links');
  await expect(page.locator('.kook__teller')).toHaveText('1 / 5');
});

test('een normale stap past op één scherm zonder scrollen', async ({ page }) => {
  for (const stap of [1, 2, 3, 4]) {
    await expect(page.locator('.kook__teller')).toHaveText(`${stap} / 5`);

    const scrollt = await page.locator('.stap').evaluate(
      (el) => el.scrollHeight > el.clientHeight + 1,
    );
    expect(scrollt, `stap ${stap} hoort te passen`).toBe(false);
    await expect(page.locator('.stap__waarschuwing')).toHaveCount(0);

    await tik(page, 'rechts');
  }
});

test('een te lange stap meldt zichzelf in plaats van tekst af te kappen', async ({ page }) => {
  // Stap 5 in het harnas is bewust te lang. §8 zegt: dan had de parser hem
  // moeten splitsen. De app kapt hem niet stil af — dat zou je een halve
  // instructie geven zonder dat je het merkt.
  for (let i = 0; i < 4; i++) {
    await tik(page, 'rechts');
  }
  await expect(page.locator('.kook__teller')).toHaveText('5 / 5');
  await expect(page.locator('.stap__waarschuwing')).toBeVisible();

  const volledig = await page.locator('.stap__tekst').evaluate(
    (el) => el.scrollHeight <= el.clientHeight + 1,
  );
  expect(volledig, 'de tekst zelf mag niet afgekapt zijn').toBe(true);
});

test('de pagina scrollt nooit horizontaal', async ({ page }) => {
  const paginaScrollt = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(paginaScrollt).toBe(false);
});

test('de instructie blijft groot genoeg om op afstand te lezen', async ({ page }) => {
  const grootte = await page.locator('.stap__tekst').evaluate(
    (el) => parseFloat(getComputedStyle(el).fontSize),
  );
  expect(grootte).toBeGreaterThanOrEqual(28);
});

test('de sluitknop is ruim aanraakbaar en staat linksboven', async ({ page }) => {
  const knop = page.getByRole('button', { name: 'Kookmodus verlaten' });
  const vak = (await knop.boundingBox())!;
  expect(vak.width).toBeGreaterThanOrEqual(48);
  expect(vak.height).toBeGreaterThanOrEqual(48);
  expect(vak.x).toBeLessThan(page.viewportSize()!.width / 3);
});

test('de kookklok weerspiegelt de duur van de stappen', async ({ page }) => {
  const breedtes = await page
    .locator('.kookklok__segment')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

  expect(breedtes).toHaveLength(5);
  // Stap 4 is drie uur sudderen; stap 3 is vijf minuten. De wachtstap hoort
  // in één oogopslag als het brede blok te herkennen te zijn.
  const breedste = Math.max(...breedtes);
  expect(breedtes[3]).toBe(breedste);
  expect(breedtes[3]).toBeGreaterThan(breedtes[2] * 3);
  for (const breedte of breedtes) {
    expect(breedte).toBeGreaterThan(4);
  }
});

test('een timer verschijnt alleen bij stappen met een tijd', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Zet timer/ })).toHaveCount(0);

  await tik(page, 'rechts');
  const timerKnop = page.getByRole('button', { name: /Zet timer/ });
  await expect(timerKnop).toBeVisible();
  expect((await timerKnop.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test('een lopende timer overleeft een stapwissel', async ({ page }) => {
  await tik(page, 'rechts');
  await page.getByRole('button', { name: /Zet timer/ }).tap();
  await expect(page.locator('.kook__timers')).toHaveText('1 timer');

  // Doortikken en terug: de timer van stap 2 loopt nog steeds (§8).
  await tik(page, 'rechts');
  await expect(page.locator('.kook__timers')).toHaveText('1 timer');

  await tik(page, 'links');
  await expect(page.getByRole('button', { name: /Nog/ })).toBeVisible();
});

test('veeg omhoog opent de ingrediënten, veeg omlaag sluit ze', async ({ page }) => {
  const sheet = page.locator('.sheet');
  await expect(sheet).toHaveAttribute('aria-hidden', 'true');

  await veeg(page, 'omhoog');
  await expect(sheet).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.sheet__lijst li')).toHaveCount(3);

  await veeg(page, 'omlaag');
  await expect(sheet).toHaveAttribute('aria-hidden', 'true');
});

test('na de laatste stap volgt het afsluitscherm met een notitieveld', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await tik(page, 'rechts');
  }

  await expect(page.getByText('Klaar?')).toBeVisible();

  // Het notitieveld is het punt: groot veld, kleine overslaan-knop (§8 regel 4).
  const notitie = (await page.locator('.kook__notitie').boundingBox())!;
  const overslaan = (await page.getByRole('button', { name: 'Overslaan' }).boundingBox())!;
  expect(notitie.height).toBeGreaterThan(overslaan.height * 2);
  await expect(page.getByRole('button', { name: 'Gekookt' })).toBeVisible();
});

async function veeg(page: Page, richting: 'omhoog' | 'omlaag') {
  const { width, height } = page.viewportSize()!;
  const x = width / 2;
  const vanY = richting === 'omhoog' ? height * 0.75 : height * 0.35;
  const naarY = richting === 'omhoog' ? height * 0.3 : height * 0.8;

  await page.touchscreen.tap(x, vanY);
  await page.evaluate(
    ([x, vanY, naarY]) => {
      const doel = document.querySelector('.kook')!;
      const raak = (type: string, y: number) =>
        doel.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            touches: type === 'touchend' ? [] : [
              new Touch({ identifier: 1, target: doel, clientX: x, clientY: y }),
            ],
            changedTouches: [
              new Touch({ identifier: 1, target: doel, clientX: x, clientY: y }),
            ],
          }),
        );
      raak('touchstart', vanY);
      raak('touchend', naarY);
    },
    [x, vanY, naarY],
  );
}
