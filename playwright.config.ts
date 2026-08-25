import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const CHROMIUM_PAD = existsSync('/opt/pw-browsers/chromium')
  ? '/opt/pw-browsers/chromium'
  : undefined;

/**
 * Kookmodus wordt op een telefoon gebruikt, dus wordt hij op een telefoon
 * getest. 390×844 is een iPhone 14; 360px breed is de ondergrens uit §13 en
 * staat als tweede project.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    // Deze omgeving heeft één vooraf geïnstalleerde Chromium die niet
    // noodzakelijk bij de gepinde Playwright-versie hoort. Wijs hem aan als
    // hij er is, en laat Playwright anders zijn eigen build gebruiken.
    launchOptions: CHROMIUM_PAD ? { executablePath: CHROMIUM_PAD } : {},
  },
  // Chromium met een telefoonviewport: WebKit staat niet in elke omgeving
  // klaar, en de eisen uit §8 (tapzones, geen scroll, raakdoelen) hangen aan
  // het formaat en aanraking, niet aan de engine.
  projects: [
    {
      name: 'telefoon',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'smal',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/tests/e2e/harnas/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: 'https://harnas.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'harnas',
    },
  },
});
