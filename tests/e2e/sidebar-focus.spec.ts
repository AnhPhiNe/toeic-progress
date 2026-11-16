import { expect, test } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';

test('phone bottom bar navigates, traps focus in its sheets, restores it and hands over to the sidebar on resize', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 768 });
  await page.goto('/lich-su');
  const bar = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  await expect(bar).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();
  await expect(bar.getByRole('button', { name: 'Hành trình', exact: true })).toHaveAttribute('aria-current', 'page');

  // The raised "Ghi" button opens the "Ghi lại gì?" sheet; it traps focus and gives it back on Escape.
  const record = bar.getByRole('button', { name: 'Ghi', exact: true });
  await record.click();
  const sheet = page.getByRole('dialog', { name: 'Ghi lại gì?', exact: true });
  await expect(sheet).toBeVisible();
  const first = sheet.getByRole('button', { name: /^Điểm đề/ });
  const last = sheet.getByRole('button', { name: /^Thêm từ vựng/ });
  await expect(first).toBeFocused();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(record).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  // Resizing to a computer layout drops the bar and the open sheet, and shows the sidebar.
  await record.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(sheet).toHaveCount(0);
  await expect(bar).toBeHidden();
  await expect(page.locator('aside')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.setViewportSize({ width: 375, height: 768 });
  await expect(sheet).toHaveCount(0);

  await bar.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(bar.getByRole('button', { name: 'Hôm nay', exact: true })).toHaveAttribute('aria-current', 'page');
  await bar.getByRole('button', { name: 'Luyện tập', exact: true }).click();
  await expect(page).toHaveURL(/\/luyen-toc-do$/);

  // Cài đặt (avatar sheet, then the dialog) also traps focus and releases the page on close.
  await bar.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  const settings = await openSettings(page);
  await expect(settings.getByRole('button', { name: 'Đóng cài đặt', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('phone "Ghi" sheet opens each recording form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  const bar = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  const record = bar.getByRole('button', { name: 'Ghi', exact: true });
  const sheet = page.getByRole('dialog', { name: 'Ghi lại gì?', exact: true });

  await record.click();
  await sheet.getByRole('button', { name: /^Điểm đề/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await record.click();
  await sheet.getByRole('button', { name: /^Chụp câu sai/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').first()).toBeVisible();
});
