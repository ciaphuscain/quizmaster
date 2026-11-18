import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { freshApp, quickCreate } from './helpers';

test('no serious/critical accessibility violations on main screens', async ({ page }) => {
  await freshApp(page);
  const results: string[] = [];
  const check = async (label: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
      results.push(`${label}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  };
  for (const p of ['/', '/questions', '/create', '/media', '/quizzes', '/templates', '/import-export', '/settings']) { await page.goto(p); await page.locator('main h1').waitFor(); await check(p); }
  await quickCreate(page, 'logo-altered'); await check('editor');
  console.log(results.join('\n'));
  expect(results).toEqual([]);
});
