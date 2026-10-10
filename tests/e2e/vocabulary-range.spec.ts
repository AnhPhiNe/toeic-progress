import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page, expandHistory = true) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/tu-vung');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.vocabLog = [
      { id: 'vocab:2026-09-24', date: '2026-09-24', count: 35, updatedAt: stamp, deletedAt: null },
      { id: 'vocab:2026-09-26', date: '2026-09-26', count: 10, updatedAt: stamp, deletedAt: null },
      { id: 'vocab:2026-10-03', date: '2026-10-03', count: 20, updatedAt: stamp, deletedAt: null },
      { id: 'vocab:2026-10-07', date: '2026-10-07', count: 15, updatedAt: stamp, deletedAt: null }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  if (expandHistory) await page.locator('.vocab-history-summary').click();
}

test('history starts collapsed, toggles by keyboard, remembers the choice and retains five-row paging', async ({ page }) => {
  await seed(page, false);
  const summary = page.locator('.vocab-history-summary');
  await expect(summary).toContainText('Lịch sử ghi nhận');
  await expect(summary).toContainText('3 ngày');
  await expect(page.locator('[data-vocab-day]')).toHaveCount(0);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-vocab-day]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(0);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.vocabLog = Array.from({ length: 8 }, (_, index) => ({ id: `vocab:2026-10-0${index + 1}`, date: `2026-10-0${index + 1}`, count: 20, updatedAt: '2026-10-09T09:00:00Z', deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await summary.click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(5);
  await page.getByRole('navigation', { name: 'Trang lịch sử từ vựng' }).getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await summary.click();
  await summary.click();
  await expect(page.getByText('Trang 2/2', { exact: true })).toBeVisible();
});

async function openRange(page: Page) {
  await page.getByLabel('Phạm vi từ vựng', { exact: true }).selectOption('CUSTOM');
  return page.getByRole('dialog', { name: 'Khoảng thời gian', exact: true });
}

test('calendar ranges filter history, chart and statistics together while lifetime total stays unchanged', async ({ page }) => {
  await seed(page);
  await expect(page.getByText('80 từ tích lũy', { exact: true })).toBeVisible();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const bars = page.locator('.recharts-bar-rectangle path');
  for (const [index, date] of ['26/09/2026', '03/10/2026', '07/10/2026'].entries()) {
    await bars.nth(index).hover();
    await expect(page.locator('.vocab-tooltip')).toContainText(date);
  }
  await expect(page.getByRole('region', { name: 'Biểu đồ từ vựng', exact: true })).toContainText('20 từ (03/10)');
  let dialog = await openRange(page);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-10-03');
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByLabel('Phạm vi từ vựng', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Phạm vi từ vựng', { exact: true })).toHaveValue('14');
  await page.getByLabel('Phạm vi từ vựng', { exact: true }).selectOption('7');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-vocab-day]')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Biểu đồ từ vựng', exact: true })).toContainText('17,5 từ/ngày');
  await expect(page.getByText('80 từ tích lũy', { exact: true })).toBeVisible();
  dialog = await openRange(page);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-09-24');
  await dialog.getByLabel('Đến ngày', { exact: true }).fill('2026-09-26');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Biểu đồ từ vựng', exact: true })).toContainText('22,5 từ/ngày');
  await expect(page.getByLabel('Phạm vi từ vựng', { exact: true })).toHaveValue('CUSTOM_APPLIED');
  await expect(page.getByLabel('Phạm vi từ vựng', { exact: true }).locator('option:checked')).toHaveText('24/09/2026 – 26/09/2026');
  dialog = await openRange(page);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-10-08');
  await dialog.getByLabel('Đến ngày', { exact: true }).fill('2026-10-08');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Biểu đồ từ vựng', exact: true }).getByText('Chưa có ghi nhận trong khoảng này.', { exact: true })).toBeVisible();
  await expect(page.getByText('80 từ tích lũy', { exact: true })).toBeVisible();
});

test('date validation, popup keyboard, mobile and zoom leave filters intact until Apply', async ({ page }, testInfo) => {
  await seed(page);
  const dialog = await openRange(page);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-10-08');
  await dialog.getByLabel('Đến ngày', { exact: true }).fill('2026-10-07');
  await expect(dialog.getByRole('alert')).toContainText('Ngày bắt đầu');
  await expect(dialog.getByRole('button', { name: 'Áp dụng', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Đóng bộ lọc', exact: true })).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    const range = await openRange(page);
    const box = await range.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.clock.runFor(700);
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath('vocabulary-filter-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setViewportSize({ width: 375, height: 600 });
  const shortPopup = await openRange(page);
  const shortBox = await shortPopup.boundingBox();
  expect(shortBox!.y).toBeGreaterThanOrEqual(0);
  expect(shortBox!.y + shortBox!.height).toBeLessThanOrEqual(600);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  await page.clock.runFor(700);
  await page.screenshot({ path: testInfo.outputPath('vocabulary-wide-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1024, height: 812 });
  await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('range menu shows date fields only for custom ranges and blocks more than 30 inclusive days immediately', async ({ page }) => {
  await seed(page);
  const scope = page.getByLabel('Phạm vi từ vựng', { exact: true });
  await expect(scope).toHaveValue('14');
  await expect(scope.locator('option:not([hidden])')).toHaveText(['7 ngày gần nhất', '14 ngày gần nhất', '30 ngày gần nhất', 'Chọn khoảng ngày…']);
  await expect(page.getByLabel('Từ ngày', { exact: true })).toHaveCount(0);
  const dialog = await openRange(page);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-09-09');
  await expect(dialog.getByRole('alert')).toContainText('tối đa 30 ngày');
  await expect(dialog.getByRole('button', { name: 'Áp dụng', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Đến ngày', { exact: true })).toHaveAttribute('max', '2026-10-08');
  await expect(page.locator('[data-vocab-day]')).toHaveCount(3);
  await dialog.getByLabel('Từ ngày', { exact: true }).fill('2026-09-10');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Áp dụng', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(4);
  await expect(scope.locator('option:checked')).toHaveText('10/09/2026 – 09/10/2026');
  const reopened = await openRange(page);
  await expect(reopened.getByLabel('Từ ngày', { exact: true })).toHaveValue('2026-09-10');
  await reopened.getByLabel('Đến ngày', { exact: true }).fill('2026-10-10');
  await expect(reopened.getByRole('alert')).toContainText('hôm nay');
  await expect(reopened.getByRole('button', { name: 'Áp dụng', exact: true })).toBeDisabled();
  await reopened.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(4);
  await scope.selectOption('7');
  await expect(page.getByLabel('Từ ngày', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-vocab-day]')).toHaveCount(2);
});

test('optional source and multiple Parts persist after editing, quick count updates and reload', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Sửa ghi nhận ngày 07/10/2026', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Sửa ghi nhận', exact: true });
  await modal.getByLabel('Nguồn học', { exact: false }).fill('ETS 2024 Test 04');
  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await expect(page.locator('[data-vocab-day="2026-10-07"]')).toContainText('ETS 2024 Test 04');
  await page.reload();
  await page.getByLabel('Ngày học từ vựng', { exact: true }).fill('2026-10-07');
  await page.getByLabel('Số từ đã học', { exact: true }).fill('22');
  await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).vocabLog.find((log: { date: string }) => log.date === '2026-10-07'));
  expect(saved).toMatchObject({ count: 22, sourceName: 'ETS 2024 Test 04', parts: [5, 7] });
  await page.getByRole('button', { name: 'Sửa ghi nhận ngày 07/10/2026', exact: true }).click();
  await modal.getByLabel('Nguồn học', { exact: false }).fill('');
  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await expect(page.locator('[data-vocab-day="2026-10-07"]')).toContainText('Chưa ghi nguồn');
});
