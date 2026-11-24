import { test, expect, type Page } from '@playwright/test';

/** Welcome goal card: the exam date is quick chips plus "Chọn ngày" in dd/mm/yyyy, never a raw mm/dd/yyyy field. */
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3') ?? '{}').profile ?? {});

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.mouse.click(5, 300); // any tap ends Sóc's greeting
}

/** Same rule as the app: calendar months ahead, day clamped to the month's end. */
function monthsAhead(months: number) {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + months + 1, 0).getDate();
  const date = new Date(now.getFullYear(), now.getMonth() + months, Math.min(now.getDate(), last));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('desktop welcome: exam date chips, then a picked date shows as dd/mm/yyyy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  const card = page.getByRole('region', { name: 'Chọn mục tiêu' });
  const dates = card.getByRole('group', { name: /^Ngày thi/ });
  await expect(dates.getByRole('button', { name: 'Chưa có ngày', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('input[type="date"]')).toHaveCount(1);
  await expect(card.locator('input[type="date"]')).toHaveCSS('opacity', '0'); // the native field never shows its mm/dd/yyyy text

  await dates.getByRole('button', { name: '2 tháng', exact: true }).click();
  await expect(dates.getByRole('button', { name: '2 tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await stored(page)).examDate).toBe(monthsAhead(2));
  await dates.getByRole('button', { name: '1 tháng nữa', exact: true }).click();
  expect((await stored(page)).examDate).toBe(monthsAhead(1));

  await card.getByLabel('Ngày thi', { exact: true }).fill('2030-03-02');
  await expect(dates.getByRole('button', { name: /02\/03\/2030/ })).toBeVisible();
  await expect(dates.getByRole('button', { name: /02\/03\/2030/ })).toContainText('02/03/2030');
  expect((await stored(page)).examDate).toBe('2030-03-02');
  for (const chip of ['Chưa có ngày', '1 tháng nữa', '2 tháng', '3 tháng']) await expect(dates.getByRole('button', { name: chip, exact: true })).toHaveAttribute('aria-pressed', 'false');

  await dates.getByRole('button', { name: 'Chưa có ngày', exact: true }).click();
  expect((await stored(page)).examDate).toBe('');
  await expect(dates.getByRole('button', { name: 'Chọn ngày thi', exact: true })).toContainText('Chọn ngày');
});

test('phone welcome has no date field: the exam date is set later in Cài đặt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await expect(page.getByRole('region', { name: 'Chọn mục tiêu' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
});
