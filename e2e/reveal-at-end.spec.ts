import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';
import { freshApp } from './helpers';

test('answers revealed only after all questions: locked while asking, run-through at the end, PPTX ordered to match', async ({ page, context }) => {
  await freshApp(page);
  // a 3-question flag round from the generator
  await page.goto('/quizzes?generate=1');
  await page.getByTestId('gen-count').fill('3');
  await page.getByTestId('generate-go').click();
  await expect(page.getByTestId('round-0').getByTestId('round-question')).toHaveCount(3);
  // choose "at the end of the quiz"
  await page.getByText('Quiz settings & theme').click();
  await page.getByTestId('answer-reveal').selectOption('quiz');
  await expect(page.getByText(/answers at the end of the quiz/)).toBeVisible();

  await context.addInitScript(() => {
    const Orig = BroadcastChannel;
    (window as unknown as { __msgs: string[] }).__msgs = [];
    window.BroadcastChannel = class extends Orig {
      constructor(n: string) { super(n); this.addEventListener('message', (e) => (window as unknown as { __msgs: string[] }).__msgs.push(JSON.stringify((e as MessageEvent).data))); }
    } as typeof BroadcastChannel;
  });
  const hostP = context.waitForEvent('page');
  await page.getByTestId('start-presentation').click();
  const host = await hostP;
  const audP = context.waitForEvent('page');
  await host.getByTestId('open-audience').click();
  const aud = await audP;
  await expect(aud.getByTestId('audience-transition')).toBeVisible();

  // asking pass: 3 questions, answer locked everywhere
  const answers: string[] = [];
  for (let i = 0; i < 3; i++) {
    await host.getByTestId('next-action').click();
    await expect(aud.getByTestId('audience-question')).toBeVisible();
    answers.push((await host.getByTestId('host-answer').innerText()).trim()); // host can still see it
    await expect(host.getByTestId('reveal-answer')).toBeDisabled();
    await expect(host.getByTestId('phase-badge')).toContainText('end of the quiz');
    await host.keyboard.press('a'); // shortcut must not override the lock
    await host.waitForTimeout(300);
    await expect(aud.getByTestId('audience-answer')).toHaveCount(0);
  }
  const leaked = await aud.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs.join(''));
  for (const a of answers) expect(leaked).not.toContain(a);

  // answer run-through
  await host.getByTestId('next-action').click();
  await expect(aud.getByTestId('audience-transition')).toContainText('Answers');
  for (let i = 0; i < 3; i++) {
    await host.getByTestId('next-action').click(); // show question again (full)
    await expect(aud.getByTestId('audience-review-badge')).toBeVisible();
    await expect(aud.getByTestId('audience-answer')).toHaveCount(0);
    await host.keyboard.press(' '); // Space reveals
    await expect(aud.getByTestId('audience-answer')).toHaveText(answers[i]);
  }
  await host.close(); await aud.close();

  // PowerPoint: questions first, answers at the end
  await page.goto('/import-export');
  await page.getByTestId('export-scope').selectOption({ index: 1 });
  const d = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX' }).click();
  const zip = await JSZip.loadAsync(fs.readFileSync(await (await d).path()));
  const slideXml = async (n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
  const count = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
  expect(count).toBe(1 + 1 + 3 + 1 + 1 + 3); // title, round, 3 questions, "Answers", round answers, 3 answers
  expect(await slideXml(6)).toContain('>Answers<');
  for (let i = 0; i < 3; i++) {
    expect(await slideXml(3 + i)).not.toContain(answers[i]); // question slides carry no answer text
    expect(await slideXml(8 + i)).toContain(answers[i]);
  }
});
