import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { tempDirectory, cleanup } from './helpers';
let server: ChildProcess;
let directory: string;
let serverOutput = '';
async function start() {
  serverOutput = '';
  server = spawn(process.execPath, [resolve('apps/server/dist/apps/server/src/index.js')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '3101',
      HOST: '127.0.0.1',
      DATA_DIR: directory,
      MOCK_STEP_MS: '2500',
      PARCELHUB_AUTH_TOKEN: '',
      KLIKRESI_API_KEY: '',
      RAJAONGKIR_API_KEY: '',
      BITESHIP_API_KEY: '',
    },
    stdio: 'pipe',
    windowsHide: true,
  });
  server.stdout?.on('data', (d) => (serverOutput += d));
  server.stderr?.on('data', (d) => (serverOutput += d));
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error(serverOutput);
        try {
          return (await fetch('http://127.0.0.1:3101/api/health')).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exit = new Promise<void>((r) => server.once('exit', () => r()));
  server.kill();
  await exit;
}
test.beforeAll(async () => {
  directory = tempDirectory();
  await start();
});
test.afterAll(async () => {
  await stop();
  cleanup(directory);
});
test.describe.configure({ mode: 'serial' });
test('save, restart, update synthetic tracking, timeline, archive and restore', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little less wondering.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add parcel', exact: true }).first().click();
  await page.getByLabel('Tracking number', { exact: false }).fill('E2E-123456');
  await page.getByLabel('Courier', { exact: false }).selectOption('jne');
  await page.getByLabel('Parcel name', { exact: false }).fill('My test headphones');
  await page.getByLabel('Tracking source').selectOption('mock');
  await page.getByRole('button', { name: 'Save parcel', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My test headphones', exact: true })).toBeVisible();
  const initial = (await (await request.get('/api/parcels')).json()).parcels.find(
    (p: { trackingNumber: string }) => p.trackingNumber === 'E2E-123456',
  );
  expect(initial.providerId).toBe('mock');
  expect(initial.events.length).toBeGreaterThan(0);
  await stop();
  await start();
  await page.reload();
  await expect(page.getByRole('link', { name: 'My test headphones', exact: true })).toBeVisible();
  const settings = await (await request.get('/api/settings')).json();
  settings.manualCooldownSeconds = 10;
  await request.put('/api/settings', { data: settings });
  await expect
    .poll(
      async () => {
        const r = await request.post(`/api/parcels/${initial.id}/refresh`);
        return r.ok() ? (await r.json()).status : 'COOLDOWN';
      },
      { timeout: 20000, intervals: [1000, 1000, 2000] },
    )
    .toBe('DELIVERED');
  await page.reload();
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('link', { name: 'My test headphones', exact: true }) });
  await expect(card.getByText('Delivered', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /Tracking timeline/ }).click();
  await expect(card.getByText('[SYNTHETIC] Paket telah diterima oleh penerima')).toBeVisible();
  await card.getByRole('button', { name: 'Archive My test headphones', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My test headphones', exact: true })).toHaveCount(0);
  await page.goto('/archive');
  const archived = page
    .locator('article')
    .filter({ has: page.getByRole('link', { name: 'My test headphones', exact: true }) });
  await archived.getByRole('button', { name: 'Restore My test headphones', exact: true }).click();
  await page.goto('/parcels');
  await expect(page.getByRole('link', { name: 'My test headphones', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My test headphones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shipment details' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('installed shell, offline creation/editing and queued synchronization', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/parcels');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'My test headphones', exact: true })).toBeVisible();
  await expect(page.getByText('Offline · cached data').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit My test headphones', exact: true }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Written offline. Do not lose this edit.');
  await page.getByRole('button', { name: 'Save parcel', exact: true }).click();
  await page.getByRole('button', { name: 'Add parcel', exact: true }).first().click();
  await page.getByLabel('Tracking number', { exact: false }).fill('OFFLINE123456');
  await page.getByLabel('Courier', { exact: false }).selectOption('jnt');
  await page.getByLabel('Parcel name', { exact: false }).fill('Saved while offline');
  await page.getByLabel('Tracking source').selectOption('manual');
  await page.getByRole('button', { name: 'Save parcel', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Saved while offline', exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect
    .poll(
      async () => {
        const ps = (await (await request.get('/api/parcels')).json()).parcels;
        return (
          ps.some((p: { nickname: string }) => p.nickname === 'Saved while offline') &&
          ps.some((p: { notes: string }) => p.notes === 'Written offline. Do not lose this edit.')
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(page.getByText('Review changes', { exact: true })).toHaveCount(0);
});
test('bulk duplicate preview, search/filter and responsive themes', async ({ page, request }) => {
  await request.post('/api/demo');
  await page.goto('/');
  await page.getByRole('button', { name: 'Bulk import', exact: true }).click();
  await page.getByLabel('Bulk tracking numbers').fill('E2E-123456,jne\nUNSURE123456');
  await page.getByRole('button', { name: /Preview/ }).click();
  await expect(page.getByText('Duplicate · skipped')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import parcels', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Search parcels').fill('headphones');
  await expect(page.locator('article.parcel-card')).toHaveCount(1);
  await page.getByLabel('Search parcels').fill('');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: resolve('docs/screenshots/desktop.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: resolve('docs/screenshots/dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.screenshot({ path: resolve('docs/screenshots/mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Language', { exact: true }).selectOption('id');
  await expect(page.getByRole('heading', { name: 'Pengaturan', exact: true })).toBeVisible();
});
