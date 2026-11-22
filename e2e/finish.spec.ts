import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { freshApp, quickCreate, upload, waitSaved } from './helpers';

test('AI suggestions are reviewable, editable, rejectable and saved only when accepted', async ({ page }) => {
  await freshApp(page);
  let calls = 0;
  await page.route('http://localhost:8787/generate', async (route) => {
    calls++;
    const body = JSON.parse(route.request().postData() ?? '{}');
    expect(body.prompt).toContain('Acme');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ text: '1. Acme Corp\n- ACME Inc\nAcme Co' }) });
  });
  await page.goto('/settings');
  await page.getByTestId('ai-provider').selectOption('claude-proxy');
  await quickCreate(page, 'logo-normal');
  await page.getByTestId('brand-answer').fill('Acme');
  await page.getByTestId('tab-question').click();
  // reject: nothing changes
  await page.getByRole('button', { name: 'Suggest' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'AI suggestions' });
  await expect(dialog.getByRole('textbox')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Reject all' }).click();
  await expect(page.getByTestId('alias-0')).toHaveCount(0);
  // accept a subset after editing one
  await page.getByRole('button', { name: 'Suggest' }).first().click();
  await expect(dialog.getByRole('textbox')).toHaveCount(3);
  await dialog.getByRole('checkbox', { name: 'Use suggestion 2' }).uncheck();
  await dialog.getByRole('textbox').nth(2).fill('Acme Company');
  await dialog.getByRole('button', { name: /Accept 2/ }).click();
  await expect(page.getByTestId('alias-0')).toHaveValue('Acme Corp');
  await expect(page.getByTestId('alias-1')).toHaveValue('Acme Company');
  await expect(page.getByTestId('alias-2')).toHaveCount(0);
  expect(calls).toBe(2);
  await waitSaved(page);
});

test('the app is fully usable with AI disabled (no AI buttons, no network calls)', async ({ page }) => {
  await freshApp(page);
  let external = 0;
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external++; });
  await quickCreate(page, 'movie-bad-plot');
  await page.getByTestId('tab-question').click();
  await expect(page.getByRole('button', { name: 'Suggest' })).toHaveCount(0);
  await page.getByTestId('tab-game').click();
  await expect(page.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0);
  expect(external).toBe(0);
});

test('export dialog: custom width, JPEG and transparent PNG of the rendered result', async ({ page }) => {
  await freshApp(page);
  await quickCreate(page, 'logo-altered');
  await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
  await page.getByTestId('inline-preset-pixelated').click();
  await waitSaved(page);
  for (const [fmt, w, check] of [['jpeg', 800, (b: Buffer) => b[0] === 0xff && b[1] === 0xd8], ['png-transparent', 1000, (b: Buffer) => b.readUInt32BE(16) === 1000 && b.readUInt32BE(20) === 563]] as const) {
    await page.getByTestId('export-image').click();
    await page.getByTestId('export-format').selectOption(fmt);
    await page.getByTestId('export-width').fill(String(w));
    const d = page.waitForEvent('download');
    await page.getByTestId('export-image-go').click();
    const buf = fs.readFileSync(await (await d).path());
    expect(check(buf)).toBe(true);
  }
});

test('reveal animation is chosen per layer and used by the audience slide', async ({ page, context }) => {
  await freshApp(page);
  await quickCreate(page, 'movie-emojis');
  await page.getByTestId('movie-answer').fill('Jaws');
  await page.getByTestId('emoji-paste').fill('🦈🌊');
  await page.getByTestId('emoji-paste').press('Enter');
  await page.getByText('Progressive reveal (one emoji at a time)').click();
  await expect(page.getByRole('switch', { name: 'Progressive reveal (one emoji at a time)' })).toBeChecked();
  await page.getByTestId('layers').getByText(/Emoji 🌊/).click();
  await page.getByTestId('tab-element').click();
  await page.getByTestId('layer-animation').selectOption('zoom');
  await waitSaved(page);
  const hostP = context.waitForEvent('page');
  await page.getByTestId('present-question').click();
  const host = await hostP;
  const audP = context.waitForEvent('page');
  await host.getByTestId('open-audience').click();
  const aud = await audP;
  await expect(aud.getByTestId('audience-slide')).toHaveAttribute('data-transition', 'fade');
  await host.getByTestId('next-action').click();
  await expect(aud.getByTestId('audience-slide')).toHaveAttribute('data-transition', 'zoom');
});

test('media library uses generated thumbnails; waveform ruler scrubs the playhead', async ({ page }) => {
  await freshApp(page);
  await page.goto('/media');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles([`${import.meta.dirname}/fixtures/logo.png`, `${import.meta.dirname}/fixtures/tone.wav`]);
  await expect(page.getByText(/^2 assets/)).toBeVisible();
  await expect(page.getByTestId('asset-thumb')).toHaveCount(1);
  const thumbs = await page.evaluate(async () => {
    const req = indexedDB.open('quizmaster-studio');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    return new Promise<number>((r) => { const g = db.transaction('assetThumbs').objectStore('assetThumbs').count(); g.onsuccess = () => r(g.result); });
  });
  expect(thumbs).toBe(1);
  await quickCreate(page, 'song-backwards');
  await page.getByTestId('choose-audio').click();
  await page.getByRole('dialog').getByRole('button', { name: /tone\.wav/ }).click();
  await expect(page.getByTestId('audio-time')).toContainText('/ 0:02.0');
  const wf = (await page.getByTestId('waveform').boundingBox())!;
  await page.mouse.move(wf.x + 5, wf.y + 8); await page.mouse.down();
  await page.mouse.move(wf.x + wf.width * 0.5, wf.y + 8, { steps: 6 }); await page.mouse.up();
  await expect(page.getByTestId('audio-time')).toContainText(/^0:01\.0|^0:00\.9|^0:01\.1/);
  await expect(page.getByText(/^Sel /)).toHaveCount(0); // scrubbing does not create a selection
});
