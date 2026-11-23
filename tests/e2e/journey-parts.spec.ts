import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hành trình điểm › Từng Part: the illustrated islands (design/previews/journey-v3/parts-islands-v3.html).
 * One full test with correct counts 5/17/29/23/24/10/41 of 6/25/39/30/30/16/54: wrong 1/8/10/7/6/6/13, % 83/68/74/77/80/63/76.
 * Set SHOTS_DIR to also save desktop and phone screenshots.
 */
async function seed(page: Page) {
  await page.clock.install({ time: new Date('2026-11-21T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts' as string)).loadDemoData();
    const key = 'toeic_progress_bundle_v3';
    const data = JSON.parse(localStorage.getItem(key)!);
    const tpl = data.sessions.find((s: { sessionType: string }) => s.sessionType === 'FULL_TEST');
    const { wrongQuestions: _drop, ...rest } = tpl;
    data.sessions = [{ ...rest, id: 'p1', date: '2026-11-20', createdAt: '2026-11-20T09:00:00Z', updatedAt: '2026-11-20T09:00:00Z', testName: 'Đề E10', totalScore: 760, scaledListening: 390, scaledReading: 370, attemptNumber: 1,
      partScores: { part1: 5, part2: 17, part3: 29, part4: 23, part5: 24, part6: 10, part7: 41 } }];
    data.mistakes = [];
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  });
  await page.goto('/phan-tich');
  await expect(page.getByRole('tab', { name: 'Từng Part', exact: true })).toHaveAttribute('aria-selected', 'true');
}

const shot = async (page: Page, name: string) => {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(dir, name) });
};
const island = (page: Page, part: number) => page.getByRole('button', { name: new RegExp(`^Part ${part}: `) });

test('desktop: islands, selected card, buttons, legend and route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await expect(page.getByText('Mất điểm ở đâu?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ghé Part 7 rồi Part 3 trước' })).toBeVisible();
  for (const p of [1, 2, 3, 4, 5, 6, 7]) await expect(island(page, p)).toHaveCount(1);
  await expect(island(page, 7)).toHaveAttribute('aria-pressed', 'true');
  await expect(island(page, 7)).toHaveAccessibleName('Part 7: 76% đúng, 13 câu sai, rương số 1');
  await expect(island(page, 3)).toHaveAccessibleName('Part 3: 74% đúng, 10 câu sai, rương số 2');

  // right panel: count once, the % once (by the bar), tag, two buttons on one line
  const panel = page.locator('.jr-pn');
  await expect(panel.getByText('Part 7', { exact: true })).toBeVisible();
  await expect(panel.locator('.jr-pn-big strong')).toHaveText('13');
  await expect(panel.getByText('76% đúng', { exact: true })).toHaveCount(1);
  await expect(panel.locator('.jr-tag')).toHaveText('Ổn');
  const timer = panel.getByRole('button', { name: 'Bấm giờ Part 7' });
  const wrong = panel.getByRole('button', { name: 'Xem câu sai', exact: true });
  await expect(timer).toBeVisible();
  await expect(wrong).toBeVisible();
  const [tb, wb] = [await timer.boundingBox(), await wrong.boundingBox()];
  expect(tb!.height).toBeLessThan(46);
  expect(Math.abs(tb!.y - wb!.y)).toBeLessThan(2);

  // legend by the Vững/Ổn thresholds
  const legend = page.getByRole('group', { name: 'Màu phần trăm đúng' });
  await expect(legend).toContainText('% đúng');
  await expect(legend).toContainText('≥85');
  await expect(legend).toContainText('75–84');
  await expect(legend).toContainText('dưới 75');

  // route list in the order of the chests
  const rows = page.locator('.jr-plan-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Part 7 · Đọc hiểu');
  await expect(rows.nth(0)).toContainText('Đã ôn 0/13 câu');
  await expect(rows.nth(1)).toContainText('Part 3 · Hội thoại');
  await expect(rows.nth(1)).toContainText('Đã ôn 0/10 câu');
  await shot(page, 'parts-desktop.png');

  // pick the weakest island: tag turns "Cần ôn", panel follows
  await island(page, 6).click();
  await expect(island(page, 6)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.jr-tag')).toHaveText('Cần ôn');
  await expect(panel.locator('.jr-pn-big strong')).toHaveText('6');
  await expect(panel.getByRole('button', { name: 'Bấm giờ Part 6' })).toBeVisible();

  // a Listening Part has no timer, only the wrong list; a route row selects its island
  await island(page, 1).click();
  await expect(panel.getByRole('button', { name: /^Bấm giờ/ })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Xem câu sai', exact: true })).toBeVisible();
  await rows.nth(1).click();
  await expect(island(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByText('Part 3', { exact: true })).toBeVisible();

  // storm clouds hang over the weak islands only (Parts 2, 3, 6): three rain clouds, none over Part 1 or 5
  await expect(page.locator('svg .il-rain')).toHaveCount(3);
});

test('desktop: "Xem câu sai" opens the notebook on that Part', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await island(page, 6).click();
  await page.locator('.jr-pn').getByRole('button', { name: 'Xem câu sai', exact: true }).click();
  await expect(page).not.toHaveURL(/\/phan-tich$/);
});

test('phone: short card, map, one bottom sheet with the main button and a text link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await expect(page.getByText('Mất điểm ở đâu?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ghé Part 7 rồi Part 3 trước' })).toBeVisible();
  for (const p of [1, 2, 3, 4, 5, 6, 7]) await expect(island(page, p)).toHaveCount(1);
  const sheet = page.locator('.jp-sheet');
  await expect(sheet).toContainText('Chặng 1 · Part 7 · Đọc hiểu');
  await expect(sheet).toContainText('13 câu sai');
  await expect(sheet).toContainText('76% đúng');
  const main = sheet.getByRole('button', { name: 'Xem 13 câu sai Part 7' });
  await expect(main).toBeVisible();
  const link = sheet.getByRole('button', { name: 'Bấm giờ Part 7', exact: true });
  await expect(link).toBeVisible();
  const [mb, lb] = [await main.boundingBox(), await link.boundingBox()];
  expect(lb!.y).toBeGreaterThan(mb!.y + mb!.height - 1);
  await expect(sheet).toContainText('Sau đó: Part 3 · 10 câu sai');
  const legend = page.getByRole('group', { name: 'Màu phần trăm đúng' });
  await expect(legend).toContainText('≥85');
  await expect(legend).toContainText('75–84');
  await expect(legend).toContainText('dưới 75');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, 'parts-phone.png');

  await island(page, 6).click();
  await expect(sheet.getByRole('button', { name: 'Xem 6 câu sai Part 6' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Bấm giờ Part 6', exact: true })).toBeVisible();
  await island(page, 3).click();
  await expect(sheet.getByRole('button', { name: 'Xem 10 câu sai Part 3' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Bấm giờ/ })).toHaveCount(0);
});
