import { expect, test } from '@playwright/test';
import { openRecordSheet } from './helpers/nav';

const avatar = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Hồ sơ của bạn/ });

test('device Back closes the top sheet or form first and only then leaves the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/quy-doi');
  const bar = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  await bar.getByRole('button', { name: 'Sổ tay', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);

  // Back closes the "+ Ghi" sheet and stays on the page.
  await bar.getByRole('button', { name: 'Ghi', exact: true }).click();
  const recordSheet = page.getByRole('dialog', { name: 'Ghi lại gì?', exact: true });
  await expect(recordSheet).toBeVisible();
  await page.goBack();
  await expect(recordSheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // A form opened from the sheet closes with one Back.
  await openRecordSheet(page, 'score');
  const form = page.getByRole('dialog', { name: 'Ghi điểm đề', exact: true });
  await expect(form).toBeVisible();
  await page.goBack();
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // Nested: settings, then one of its edit sheets; each Back closes one layer.
  await avatar(page).click();
  await page.getByRole('dialog', { name: 'Hồ sơ', exact: true }).getByRole('button', { name: /^Tài khoản & cài đặt/ }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await settings.getByRole('button', { name: /^Điểm mục tiêu/ }).click();
  const targetSheet = page.getByRole('dialog', { name: 'Mục tiêu của bạn', exact: true });
  await expect(targetSheet).toBeVisible();
  await page.goBack();
  await expect(targetSheet).toHaveCount(0);
  await expect(settings).toBeVisible();
  await page.goBack();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // Closing with X leaves no extra history entry: the next Back is the previous page.
  await openRecordSheet(page, 'score');
  await form.getByRole('button', { name: 'Đóng form ghi nhận buổi học', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.waitForTimeout(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/quy-doi$/);
});

test('leaving a page from inside a sheet needs a single Back to return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/so-tay');
  await avatar(page).click();
  await page.getByRole('dialog', { name: 'Hồ sơ', exact: true }).getByRole('button', { name: /^Quy đổi điểm/ }).click();
  await expect(page).toHaveURL(/\/quy-doi$/);
  await page.waitForTimeout(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
