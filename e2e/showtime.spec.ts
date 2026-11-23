import { test, expect } from '@playwright/test';
import { freshApp } from './helpers';

test('demo quiz → health check → live show with teams, answer checker, leaderboard and podium', async ({ page, context }) => {
  const errors = await freshApp(page);
  await page.getByTestId('build-demo-hero').click();
  await expect(page).toHaveURL(/\/quizzes\//, { timeout: 30_000 });
  await expect(page.locator('[data-testid^="round-"]').filter({ has: page.getByTestId('round-question') })).toHaveCount(7);
  await expect(page.getByTestId('health-summary')).toContainText('Ready to present');

  const hostP = context.waitForEvent('page');
  await page.getByTestId('start-presentation').click();
  const host = await hostP;
  const audP = context.waitForEvent('page');
  await host.getByTestId('open-audience').click();
  const aud = await audP;
  for (const t of ['Owls', 'Foxes', 'Bears']) { await host.getByTestId('new-team').fill(t); await host.getByTestId('add-team').click(); }
  await expect(host.getByTestId('team-row')).toHaveCount(3);

  await host.getByTestId('next-action').click(); // first flag question
  await expect(aud.getByTestId('audience-question')).toBeVisible();
  const answer = (await host.getByTestId('host-answer').innerText()).trim();
  // answer checker: exact and typo
  await host.getByTestId('answer-check').fill(answer.toLowerCase());
  await expect(host.getByTestId('answer-verdict')).toContainText('Correct');
  await host.getByTestId('answer-check').fill(answer.length > 4 ? answer.slice(0, -1) + 'x' : 'zzzz');
  await expect(host.getByTestId('answer-verdict')).not.toContainText('Correct');
  await host.getByRole('button', { name: 'Mark Foxes correct' }).click();
  await host.getByRole('button', { name: 'Mark Owls correct' }).click();
  await host.getByRole('button', { name: 'Mark Bears wrong' }).click();
  // leaderboard on the audience screen
  await host.getByTestId('toggle-leaderboard').click();
  const lb = aud.getByTestId('audience-leaderboard');
  await expect(lb).toBeVisible();
  await expect(lb.locator('li').first()).toContainText('Foxes');
  await expect(lb).not.toContainText(answer); // leaderboard never leaks the answer
  await host.keyboard.press('l');
  await expect(aud.getByTestId('audience-question')).toBeVisible();
  // countdown ring is present for timed questions
  await expect(aud.getByTestId('audience-timer')).toBeVisible();
  // end → podium
  await host.getByTestId('end-presentation').click();
  const podium = aud.getByTestId('audience-podium');
  await expect(podium).toBeVisible();
  await expect(podium).toContainText('Foxes & Owls tie for first!');
  // scores persist across a host reload
  await host.reload();
  await expect(host.getByTestId('team-score').first()).toHaveText('5');
  expect(errors).toEqual([]);
});

test('command palette finds questions and creates any game type; generator builds a round', async ({ page }) => {
  await freshApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('command-input').fill('new neighbours');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/edit\//);
  await expect(page.getByText('Guess the Country — Neighbours').first()).toBeVisible();

  await page.getByTestId('open-palette').click();
  await page.getByTestId('command-input').fill('generate country');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('gen-preview')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('gen-mode').selectOption('mixed');
  await page.getByTestId('gen-region').selectOption('Europe');
  await page.getByTestId('gen-count').fill('6');
  await expect(page.getByTestId('gen-preview').locator('li')).toHaveCount(6);
  await page.getByTestId('generate-go').click();
  await expect(page.getByTestId('round-0').getByTestId('round-question')).toHaveCount(6);
  await expect(page.locator('[data-testid^="round-"]').filter({ has: page.getByTestId('round-question') })).toHaveCount(1); // empty default round reused
  await expect(page.getByTestId('health-summary')).toContainText('Ready to present');

  // the palette searches the question bank
  await page.keyboard.press('Control+k');
  const firstTitle = (await page.getByTestId('round-0').getByTestId('round-question').first().locator('button').first().innerText()).replace('Country: ', '');
  await page.getByTestId('command-input').fill(firstTitle);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/edit\//);
});
