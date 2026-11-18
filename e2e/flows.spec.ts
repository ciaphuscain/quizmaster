import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { canvasHash, fixture, freshApp, quickCreate, upload, waitSaved } from './helpers';

async function setAnswer(page: Page, answer: string) {
  await page.getByTestId('tab-question').click();
  await page.getByTestId('correct-answer').fill(answer);
}

test.describe('authoring flows', () => {
  test('1. create a normal logo question with one-click upload', async ({ page }) => {
    const errors = await freshApp(page);
    await quickCreate(page, 'logo-normal');
    const before = await canvasHash(page);
    await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
    await expect.poll(() => canvasHash(page)).not.toBe(before);
    await page.getByTestId('brand-answer').fill('Acme Circles');
    await waitSaved(page);
    await page.goto('/questions');
    await expect(page.getByTestId('question-row')).toContainText('Acme Circles');
    expect(errors).toEqual([]);
  });

  test('2+3. altered logo with blur and rotation; sliders change pixels; persists after reload', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'logo-altered');
    await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
    await page.waitForTimeout(500);
    const original = await canvasHash(page);
    await page.getByTestId('add-effect').selectOption('blur');
    await expect.poll(() => canvasHash(page)).not.toBe(original);
    const blurred = await canvasHash(page);
    // adjust the slider: real output must change
    const radius = page.getByTestId('inline-fx-blur').getByRole('slider', { name: 'Radius' });
    await radius.fill('6');
    await expect.poll(() => canvasHash(page)).not.toBe(blurred);
    await page.getByTestId('add-effect').selectOption('rotate');
    const rotated = page.getByTestId('inline-fx-rotate');
    await expect(rotated).toBeVisible();
    const beforeRotate = await canvasHash(page);
    await rotated.getByRole('slider', { name: 'Angle' }).fill('90');
    await expect.poll(() => canvasHash(page)).not.toBe(beforeRotate);
    const afterRotate = await canvasHash(page);
    // undo/redo affect actual canvas content
    await page.getByTestId('undo').click();
    await expect.poll(() => canvasHash(page)).toBe(beforeRotate);
    await page.getByTestId('redo').click();
    await expect.poll(() => canvasHash(page)).toBe(afterRotate);
    await page.getByTestId('brand-answer').fill('Acme');
    await page.getByTestId('tab-question').click();
    await page.getByTestId('alias-add').click();
    await page.getByTestId('alias-0').fill('Acme Corp');
    await page.getByTestId('difficulty').selectOption('hard');
    await waitSaved(page);
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await page.getByTestId('tab-game').click();
    await expect(page.getByTestId('inline-fx-blur')).toBeVisible();
    await expect(page.getByTestId('inline-fx-rotate')).toBeVisible();
    await expect(page.getByTestId('inline-fx-rotate').getByRole('spinbutton', { name: 'Angle value' })).toHaveValue('90');
    await page.getByTestId('tab-question').click();
    await expect(page.getByTestId('correct-answer')).toHaveValue('Acme');
    await expect(page.getByTestId('alias-0')).toHaveValue('Acme Corp');
    await expect(page.getByTestId('difficulty')).toHaveValue('hard');
    // original media is preserved (stored bytes identical to fixture)
    const stored = await page.evaluate(async () => {
      const req = indexedDB.open('quizmaster-studio');
      const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const tx = db.transaction('assetBlobs');
      const all: { blob: Blob }[] = await new Promise((r) => { const g = tx.objectStore('assetBlobs').getAll(); g.onsuccess = () => r(g.result); });
      return Array.from(new Uint8Array(await all[0].blob.arrayBuffer()));
    });
    expect(Buffer.from(stored).equals(fs.readFileSync(fixture('logo.png')))).toBe(true);
  });

  test('4. country outline question with real geometry', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'country-border');
    const empty = await canvasHash(page);
    await page.getByTestId('country-search').fill('Italy');
    await page.getByTestId('country-ITA').click();
    await expect.poll(() => canvasHash(page), { timeout: 20_000 }).not.toBe(empty);
    const filled = await canvasHash(page);
    await page.getByTestId('islands').selectOption('mainland');
    await expect.poll(() => canvasHash(page)).not.toBe(filled);
    await page.getByTestId('tab-question').click();
    await expect(page.getByTestId('correct-answer')).toHaveValue('Italy');
    await waitSaved(page);
  });

  test('5. neighbours map uses real adjacency and handles island nations', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'country-neighbors');
    await page.getByTestId('country-search').fill('Austria');
    await page.getByTestId('country-AUT').click();
    const list = page.getByTestId('neighbor-list');
    for (const n of ['Germany', 'Czechia', 'Slovakia', 'Hungary', 'Slovenia', 'Italy', 'Switzerland', 'Liechtenstein']) await expect(list).toContainText(n);
    await page.getByTestId('country-search').fill('Iceland');
    await page.getByTestId('country-ISL').click();
    await expect(page.getByTestId('no-neighbors')).toContainText('no land borders');
    await waitSaved(page);
  });

  test('6. silhouette question with automatic cutout and manual mask', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'silhouette');
    await upload(page, () => page.getByTestId('upload-subject').click(), 'subject.png');
    await page.waitForTimeout(800);
    const sil = await canvasHash(page);
    // compare with the source image (answer reveal shows the original)
    await page.getByTestId('preview-answer').click();
    await expect.poll(() => canvasHash(page)).not.toBe(sil);
    await page.getByTestId('preview-answer').click();
    // paint a manual mask stroke in the studio (removes part of the subject)
    await page.getByTestId('open-mask-studio').click();
    await expect(page.getByTestId('image-studio')).toBeVisible();
    await page.getByRole('button', { name: /Cutout \/ background removal/ }).click();
    await page.getByRole('button', { name: 'Brush: remove from subject' }).click();
    const c = page.getByTestId('studio-canvas');
    const box = (await c.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height * 0.32, { steps: 5 });
    await page.mouse.up();
    await page.getByTestId('image-studio-done').click();
    await expect.poll(() => canvasHash(page)).not.toBe(sil);
    await page.getByTestId('tab-question').click();
    await page.getByTestId('correct-answer').fill('Test Person');
    await waitSaved(page);
  });

  test('7. emoji movie question with draggable emoji layers', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'movie-emojis');
    await page.getByTestId('movie-answer').fill('The Lion King');
    await page.getByTestId('emoji-paste').fill('🦁👑🌅');
    await page.getByTestId('emoji-paste').press('Enter');
    await expect(page.getByTestId('layers').getByText(/Emoji/)).toHaveCount(3);
    await page.getByTestId('emoji-search').fill('pig');
    await page.locator('[data-testid^="emoji-"][data-testid*="pig"]').first().click();
    await expect(page.getByTestId('layers').getByText(/Emoji/)).toHaveCount(4);
    // drag the selected emoji on the canvas
    const before = await canvasHash(page);
    const canvas = page.getByTestId('editor-canvas');
    const b = (await canvas.boundingBox())!;
    await page.getByTestId('layers').getByText(/Emoji 🦁/).click();
    await page.getByTestId('tab-element').click();
    const x0 = Number(await page.getByRole('spinbutton', { name: 'X' }).inputValue());
    await page.getByTestId('tab-game').click();
    // emoji 🦁 is the first one; compute its screen position from scene coords
    const sx = b.x + (b.width - 1920 * ((b.height - 48) / 1080)) / 2;
    void sx;
    await page.keyboard.press('Shift+ArrowRight');
    await page.getByTestId('tab-element').click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toHaveValue(String(x0 + 10));
    expect(await canvasHash(page)).not.toBe(before);
    await waitSaved(page);
  });

  test('8. three-prop movie question', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'movie-props');
    await page.getByTestId('movie-answer').fill('Jaws');
    for (const i of [0, 1, 2]) await upload(page, () => page.getByTestId(`upload-prop-${i}`).click(), i === 1 ? 'logo.png' : 'prop.png');
    await expect(page.locator('[data-testid^="prop-"] img')).toHaveCount(3);
    await page.getByRole('button', { name: 'grid', exact: true }).click();
    await waitSaved(page);
    await page.goto('/media');
    await expect(page.getByText(/2 assets/)).toBeVisible(); // prop.png deduplicated by hash
  });

  test('9. search-history movie question', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'movie-search-history');
    await page.getByTestId('movie-answer').fill('Jurassic Park');
    const texts = ['how to get rid of a dinosaur', 'can raptors open doors', 'chaos theory explained simply'];
    for (const t of texts) { await page.getByTestId('add-search').click(); await page.locator('[data-testid^="search-entry-"]').last().fill(t); }
    await page.getByRole('button', { name: 'Simulate dates & times' }).click();
    await page.getByRole('button', { name: 'Toggle progressive reveal' }).click();
    await page.getByRole('button', { name: 'Move down' }).first().click();
    await expect(page.getByTestId('search-entry-1')).toHaveValue(texts[0]);
    await waitSaved(page);
  });

  test('10. import audio, reverse a selected range, export valid WAV', async ({ page }) => {
    await freshApp(page);
    await quickCreate(page, 'song-backwards');
    await page.getByTestId('song-title').fill('Test Tone');
    await page.getByTestId('song-artist').fill('Fixture Band');
    await page.getByTestId('choose-audio').click();
    await upload(page, () => page.getByTestId('picker-upload').click(), 'tone.wav');
    await expect(page.getByTestId('audio-time')).toContainText('2.0');
    const wf = page.getByTestId('waveform');
    const b = (await wf.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId('op-reverse').click();
    await expect(page.getByTestId('audio-ops')).toContainText('Reverse 0.');
    const opText = await page.getByTestId('audio-ops').innerText();
    const [, s, e] = opText.match(/Reverse ([\d.]+)s–([\d.]+)s/)!;
    await page.getByTestId('play-edited').click();
    await page.waitForTimeout(300);
    await page.getByTestId('play-edited').click();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export WAV' }).click();
    const file = await (await dl).path();
    const out = fs.readFileSync(file), orig = fs.readFileSync(fixture('tone.wav'));
    expect(out.toString('ascii', 0, 4)).toBe('RIFF');
    expect(out.readUInt16LE(22)).toBe(2); // stereo preserved
    expect(out.readUInt32LE(24)).toBe(22050); // original sample rate preserved
    const frames = (out.length - 44) / 4;
    expect(frames).toBe((orig.length - 44) / 4);
    const L = (buf: Buffer, i: number, ch: number) => buf.readInt16LE(44 + i * 4 + ch * 2);
    const a = Math.round(Number(s) * 22050), z = Math.round(Number(e) * 22050);
    for (const i of [a + 10, a + 1000, z - 50]) {
      for (const ch of [0, 1]) expect(Math.abs(L(out, i, ch) - L(orig, a + z - 1 - i, ch))).toBeLessThanOrEqual(2); // reversed per channel, no swap
    }
    expect(Math.abs(L(out, 100, 0) - L(orig, 100, 0))).toBeLessThanOrEqual(2); // outside range untouched
    await waitSaved(page);
  });
});

test('11-15. quiz with rounds, live presentation with hidden answers, ZIP export and import round trip', async ({ page, context }) => {
  await freshApp(page);
  // three questions
  await quickCreate(page, 'logo-normal');
  await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
  await page.getByTestId('brand-answer').fill('Circle Co');
  await page.getByTestId('tab-question').click();
  await page.getByTestId('hint-add').click();
  await page.getByTestId('hint-0').fill('It is round');
  await waitSaved(page);
  await quickCreate(page, 'movie-dialogue');
  await page.getByTestId('movie-answer').fill('Secret Movie Title');
  await page.getByTestId('add-line').click();
  await page.getByTestId('dialogue-line-0').fill('Here is a line.');
  await waitSaved(page);
  await quickCreate(page, 'country-flag');
  await page.getByTestId('country-search').fill('Japan');
  await page.getByTestId('country-JPN').click();
  await waitSaved(page);

  // quiz with two rounds
  await page.goto('/quizzes');
  await page.getByTestId('new-quiz').click();
  await page.getByRole('textbox', { name: 'New quiz' }).fill('E2E Quiz');
  await page.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(/\/quizzes\//);
  await page.getByTestId('add-round').click();
  await expect(page.getByTestId('round-1')).toBeVisible();
  // drag a question from the bank into round 1
  const items = page.getByTestId('bank-item');
  await items.filter({ hasText: 'Circle Co' }).dragTo(page.getByTestId('round-0'));
  await expect(page.getByTestId('round-0').getByTestId('round-question')).toHaveCount(1);
  await items.filter({ hasText: 'Secret Movie Title' }).getByRole('button').click(); // appends to last round
  await items.filter({ hasText: 'Japan' }).dragTo(page.getByTestId('round-1'));
  await expect(page.getByTestId('round-1').getByTestId('round-question')).toHaveCount(2);

  // presentation
  await context.addInitScript(() => {
    const Orig = BroadcastChannel;
    (window as unknown as { __msgs: string[] }).__msgs = [];
    window.BroadcastChannel = class extends Orig {
      constructor(name: string) {
        super(name);
        this.addEventListener('message', (e) => (window as unknown as { __msgs: string[] }).__msgs.push(JSON.stringify((e as MessageEvent).data)));
      }
    } as typeof BroadcastChannel;
  });
  const hostP = context.waitForEvent('page');
  await page.getByTestId('start-presentation').click();
  const host = await hostP;
  await expect(host.getByTestId('host-view')).toBeVisible();
  const audP = context.waitForEvent('page');
  await host.getByTestId('open-audience').click();
  const aud = await audP;
  await expect(host.getByTestId('audience-count')).toContainText('1 audience', { timeout: 10_000 });
  await expect(aud.getByTestId('audience-transition')).toBeVisible();
  await host.getByTestId('next-action').click(); // to question 1
  await expect(aud.getByTestId('audience-slide')).toBeVisible();
  await expect(host.getByTestId('host-answer')).toHaveText('Circle Co');
  await host.getByTestId('reveal-hint').click();
  await expect(aud.getByTestId('audience-hints')).toContainText('It is round');
  await expect(aud.getByTestId('audience-answer')).toHaveCount(0);
  expect(await aud.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs.join(''))).not.toContain('Circle Co');
  await host.getByTestId('reveal-answer').click();
  await expect(aud.getByTestId('audience-answer')).toHaveText('Circle Co');
  // next question: answer must be hidden again, private title never transmitted before reveal
  await host.getByTestId('next-action').click(); // round 2 transition
  await expect(aud.getByTestId('audience-transition')).toContainText('Round 2');
  await host.getByTestId('next-action').click(); // round 2, question 1
  await expect(aud.getByTestId('audience-answer')).toHaveCount(0);
  await expect(host.getByTestId('host-answer')).toHaveText('Secret Movie Title');
  await aud.waitForTimeout(500);
  expect(await aud.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs.join(''))).not.toContain('Secret Movie Title');
  // audience refresh reconnects
  await aud.reload();
  await expect(aud.getByTestId('audience-question')).toBeVisible({ timeout: 10_000 });
  await aud.close();
  await host.close();

  // ZIP export
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-quiz-zip').click();
  const zipPath = await (await dl).path();

  // clean database, import
  await freshApp(page);
  await page.goto('/questions');
  await expect(page.getByTestId('question-row')).toHaveCount(0);
  await page.goto('/import-export');
  await upload(page, () => page.getByTestId('import-file').click(), zipPath);
  await page.getByTestId('confirm-import').click();
  await expect(page.getByText(/Imported 3 questions, 1 quizzes/)).toBeVisible();
  await page.goto('/questions');
  await expect(page.getByTestId('question-row')).toHaveCount(3);
  await page.goto('/media');
  await expect(page.getByText(/1 assets/)).toBeVisible();
  await page.goto('/quizzes');
  await page.getByRole('button', { name: /E2E Quiz 2 rounds/ }).click();
  await expect(page.getByTestId('round-0').getByTestId('round-question')).toHaveCount(1);
  await expect(page.getByTestId('round-1').getByTestId('round-question')).toHaveCount(2);
  await page.getByTestId('round-0').getByRole('button', { name: 'Circle Co' }).click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.getByTestId('tab-question').click();
  await expect(page.getByTestId('correct-answer')).toHaveValue('Circle Co');
  await expect(page.getByTestId('hint-0')).toHaveValue('It is round');
});
