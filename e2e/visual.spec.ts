import { test } from '@playwright/test';
import { freshApp, quickCreate, upload } from './helpers';
const out = process.env.SHOTS ?? '/tmp';
test('visual check', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'manual visual check only');
  await freshApp(page);
  await page.screenshot({ path: `${out}/dashboard.png` });
  await quickCreate(page, 'logo-altered');
  await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
  await page.getByTestId('inline-preset-rotated-mirrored').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/altered.png` });
  await quickCreate(page, 'country-neighbors');
  await page.getByTestId('country-search').fill('Germany');
  await page.getByTestId('country-DEU').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/neighbors.png` });
  await quickCreate(page, 'silhouette');
  await upload(page, () => page.getByTestId('upload-subject').click(), 'subject.png');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/silhouette.png` });
  await quickCreate(page, 'movie-search-history');
  for (const t of ['how to train a dinosaur', 'is it safe to visit an island full of', 'best raptor proof doors']) { await page.getByTestId('add-search').click(); await page.locator('[data-testid^="search-entry-"]').last().fill(t); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/search.png` });
});
