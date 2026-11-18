import { test, expect } from '@playwright/test';
import { freshApp } from './helpers';
import { GAME_TYPES } from '../src/types/schema';

test('every page loads and every game editor opens without errors', async ({ page }) => {
  const errors = await freshApp(page);
  for (const p of ['/questions', '/create', '/media', '/collections', '/quizzes', '/templates', '/presentation', '/import-export', '/settings']) {
    await page.goto(p);
    await expect(page.locator('main h1')).toBeVisible();
  }
  for (const g of GAME_TYPES) {
    await page.goto('/');
    await page.getByTestId(`quick-${g}`).click();
    await expect(page).toHaveURL(/\/edit\//);
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await expect(page.getByTestId('save-status')).toBeVisible();
  }
  await page.goto('/questions');
  await expect(page.getByTestId('question-row')).toHaveCount(13);
  expect(errors).toEqual([]);
});
