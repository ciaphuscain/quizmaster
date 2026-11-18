import { test, expect } from '@playwright/test';
import { freshApp, quickCreate, waitSaved } from './helpers';

test('canvas: drag moves an element, handles resize it, autosave persists across reload', async ({ page }) => {
  await freshApp(page);
  await quickCreate(page, 'movie-emojis');
  await page.getByTestId('emoji-paste').fill('🦈');
  await page.getByTestId('emoji-paste').press('Enter');
  await page.getByTestId('layers').getByText(/Emoji 🦈/).click();
  await page.getByTestId('tab-element').click();
  const num = async (n: string) => Number(await page.getByRole('spinbutton', { name: n, exact: true }).inputValue());
  const [x, y, w, h] = [await num('X'), await num('Y'), await num('W'), await num('H')];
  const b = (await page.getByTestId('editor-canvas').boundingBox())!;
  const fit = Math.min((b.width - 48) / 1920, (b.height - 48) / 1080);
  const ox = b.x + (b.width - 1920 * fit) / 2, oy = b.y + (b.height - 1080 * fit) / 2;
  const cx = ox + (x + w / 2) * fit, cy = oy + (y + h / 2) * fit;
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 200 * fit, cy + 100 * fit, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => num('X')).toBeGreaterThan(x + 150);
  await expect.poll(() => num('Y')).toBeGreaterThan(y + 60);
  const [x2, y2] = [await num('X'), await num('Y')];
  // resize from the bottom-right handle
  const hx = ox + (x2 + w) * fit, hy = oy + (y2 + h) * fit;
  await page.mouse.move(hx, hy); await page.mouse.down();
  await page.mouse.move(hx + 100 * fit, hy + 100 * fit, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => num('W')).toBeGreaterThan(w + 50);
  await waitSaved(page);
  const wFinal = await num('W');
  await page.reload();
  await page.getByTestId('layers').getByText(/Emoji 🦈/).click();
  await page.getByTestId('tab-element').click();
  await expect.poll(() => num('W')).toBe(wFinal);
});

test('core app works offline after first load (service worker)', async ({ page, context }) => {
  await freshApp(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // let the SW control the page
  await page.waitForTimeout(1000);
  await context.setOffline(true);
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Create Question' })).toBeVisible();
  await page.getByTestId('game-country-border').click();
  await page.getByTestId('create-blank').click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.getByTestId('country-search').fill('Chile');
  await page.getByTestId('country-CHL').click(); // geometry chunk must load from cache
  await waitSaved(page);
  await context.setOffline(false);
});
