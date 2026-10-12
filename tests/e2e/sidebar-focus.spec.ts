import { expect, test } from '@playwright/test';

test('phone bottom bar navigates, traps focus in its sheets, restores it and hands over to the sidebar on resize', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 768 });
  await page.goto('/quy-doi');
  const bar = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  await expect(bar).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();

  const more = bar.getByRole('button', { name: 'Thêm trang và cài đặt', exact: true });
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'Thêm', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Quy đổi', exact: true })).toHaveAttribute('aria-current', 'page');
  const first = sheet.getByRole('button', { name: 'Kế hoạch', exact: true });
  const last = sheet.getByRole('button', { name: 'Giao diện tối', exact: true });
  await expect(first).toBeFocused();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  await more.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(sheet).toHaveCount(0);
  await expect(bar).toBeHidden();
  await expect(page.locator('aside')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.setViewportSize({ width: 375, height: 768 });
  await expect(sheet).toHaveCount(0);

  await more.click();
  await sheet.getByRole('button', { name: 'Lịch sử', exact: true }).click();
  await expect(page).toHaveURL(/\/lich-su$/);
  await expect(sheet).toHaveCount(0);
  await bar.getByRole('button', { name: 'Tổng quan', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(bar.getByRole('button', { name: 'Tổng quan', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Đóng (Esc)', exact: true }).click(); // first-run welcome on an empty overview

  await more.click();
  await sheet.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Đóng cài đặt', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('phone "+" sheet opens each recording form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  const plus = page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true });
  const sheet = page.getByRole('dialog', { name: 'Ghi lại', exact: true });

  await plus.click();
  await sheet.getByRole('button', { name: /^Điểm đề thi/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await plus.click();
  await sheet.getByRole('button', { name: /^Câu sai/ }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('heading', { name: 'Thêm lỗi sai' })).toBeVisible();
});
