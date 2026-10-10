import { expect, test } from '@playwright/test';

test('mobile navigation traps keyboard focus, restores it and unlocks desktop after resize', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 768 });
  await page.goto('/quy-doi');
  const trigger = page.getByRole('button', { name: 'Mở menu điều hướng', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Điều hướng', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'TOEIC Progress · Tổng quan', exact: true })).toBeFocused();
  const last = drawer.getByRole('button', { name: /^Cài đặt hồ sơ/ });
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'TOEIC Progress · Tổng quan', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(drawer).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.setViewportSize({ width: 375, height: 768 });
  await expect(drawer).toHaveCount(0);
  await trigger.click();
  await drawer.getByRole('button', { name: 'Lịch Sử Đề Thi', exact: true }).click();
  await expect(page).toHaveURL(/\/lich-su$/);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await drawer.getByRole('button', { name: /^Cài đặt hồ sơ/ }).click();
  const settings = page.getByRole('dialog', { name: 'Cài Đặt Mục Tiêu & Kỷ Luật', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Đóng cài đặt', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
