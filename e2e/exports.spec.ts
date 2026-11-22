import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';
import { freshApp, quickCreate, upload, waitSaved } from './helpers';

test('PDF question sheet, answer key, PPTX and PNG exports produce valid files', async ({ page }) => {
  await freshApp(page);
  await quickCreate(page, 'logo-normal');
  await upload(page, () => page.getByTestId('upload-logo').click(), 'logo.png');
  await page.getByTestId('brand-answer').fill('Circle Co');
  await waitSaved(page);
  await page.getByTestId('export-image').click();
  const png = page.waitForEvent('download');
  await page.getByTestId('export-image-go').click();
  const pngBuf = fs.readFileSync(await (await png).path());
  expect(pngBuf.subarray(1, 4).toString()).toBe('PNG');
  expect(pngBuf.readUInt32BE(16)).toBe(1920);

  await page.goto('/import-export');
  for (const [name, magic] of [['Question sheet', '%PDF'], ['Answer key', '%PDF']] as const) {
    const d = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    const buf = fs.readFileSync(await (await d).path());
    expect(buf.subarray(0, 4).toString()).toBe(magic);
  }
  const d = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX' }).click();
  const zip = await JSZip.loadAsync(fs.readFileSync(await (await d).path()));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides.length).toBe(3); // title + question + answer
  const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
  expect(media.length).toBeGreaterThanOrEqual(2);
  const notes = await Promise.all(Object.keys(zip.files).filter((f) => f.startsWith('ppt/notesSlides/') && f.endsWith('.xml')).map((f) => zip.file(f)!.async('string')));
  expect(notes.join('')).toContain('Circle Co');
});

test('templates: save a question as template and create a new question from it', async ({ page }) => {
  await freshApp(page);
  await quickCreate(page, 'movie-bad-plot');
  await page.getByTestId('movie-answer').fill('Finding Nemo');
  await page.getByTestId('tab-question').click();
  await page.getByRole('tab', { name: 'Templates' }).click();
  await page.getByTestId('save-template').click();
  await page.getByRole('textbox', { name: 'Save as template' }).fill('My plot card');
  await page.getByTestId('confirm-ok').click();
  await page.goto('/templates');
  const card = page.locator('div', { hasText: 'My plot card' }).filter({ has: page.getByRole('button', { name: 'Use' }) }).last();
  await card.getByRole('button', { name: 'Use' }).click();
  await expect(page).toHaveURL(/\/edit\//);
  await waitSaved(page);
  await page.goto('/');
  await expect(page.getByText('My plot card')).toBeVisible(); // recently used templates widget
});
