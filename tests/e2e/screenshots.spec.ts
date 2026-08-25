import { test } from '@playwright/test';

/**
 * Geen assertions: dit levert de plaatjes waarmee je zelf kunt beoordelen of
 * kookmodus er 's avonds in de keuken uitziet zoals bedoeld.
 *
 *   npx playwright test screenshots --project=telefoon
 */
test.describe('beeld', () => {
  test('kookmodus', async ({ page }, testInfo) => {
    await page.goto('/tests/e2e/harnas/index.html');
    await page.waitForSelector('.stap__tekst');

    await page.screenshot({ path: testInfo.outputPath('stap-1.png') });

    const { width, height } = page.viewportSize()!;
    await page.touchscreen.tap(width * 0.8, height * 0.55);
    await page.getByRole('button', { name: /Zet timer/ }).tap();
    await page.waitForTimeout(1200);

    await page.screenshot({ path: testInfo.outputPath('stap-2-met-timer.png') });
  });
});
