import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const fixture = (name: string) => (path.isAbsolute(name) ? name : path.join(import.meta.dirname, 'fixtures', name));

export async function freshApp(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((d) => new Promise((r) => { const req = indexedDB.deleteDatabase(d.name!); req.onsuccess = req.onerror = req.onblocked = () => r(null); })));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return errors;
}

export async function upload(page: Page, trigger: () => Promise<void>, file: string) {
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  await (await chooser).setFiles(fixture(file));
}

export async function quickCreate(page: Page, game: string) {
  await page.goto('/');
  await page.getByTestId(`quick-${game}`).click();
  await expect(page).toHaveURL(/\/edit\//);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

/** Hash of the editor canvas pixels — used to verify edits change actual output. */
export async function canvasHash(page: Page, testId = 'editor-canvas'): Promise<string> {
  await page.waitForTimeout(600);
  return page.getByTestId(testId).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619);
    return (h >>> 0).toString(16);
  });
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 });
}
