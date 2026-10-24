import { expect, test } from '@playwright/test';

test('device Back closes the top sheet or form first and only then leaves the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/quy-doi');
  const bar = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  await bar.getByRole('button', { name: 'Ôn tập', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);

  // Back closes the "+" sheet and stays on the page.
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  const recordSheet = page.getByRole('dialog', { name: 'Ghi lại', exact: true });
  await expect(recordSheet).toBeVisible();
  await page.goBack();
  await expect(recordSheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // A form opened from the sheet closes with one Back.
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await recordSheet.getByRole('button', { name: /^Điểm đề thi/ }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await expect(form).toBeVisible();
  await page.goBack();
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // Nested: settings, then one of its edit sheets; each Back closes one layer.
  await page.getByRole('button', { name: /^Tài khoản và cài đặt/ }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await settings.getByRole('button', { name: /^Điểm mục tiêu/ }).click();
  const targetSheet = page.getByRole('dialog', { name: 'Điểm mục tiêu', exact: true });
  await expect(targetSheet).toBeVisible();
  await page.goBack();
  await expect(targetSheet).toHaveCount(0);
  await expect(settings).toBeVisible();
  await page.goBack();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(/\/so-tay$/);

  // Closing with X leaves no extra history entry: the next Back is the previous page.
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await recordSheet.getByRole('button', { name: /^Điểm đề thi/ }).click();
  await form.getByRole('button', { name: 'Đóng form ghi nhận buổi học', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.waitForTimeout(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/quy-doi$/);
});

test('leaving a page from inside a sheet needs a single Back to return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/quy-doi');
  await page.getByRole('button', { name: 'Thêm trang và cài đặt', exact: true }).click();
  await page.getByRole('dialog', { name: 'Thêm', exact: true }).getByRole('button', { name: 'Lịch sử đề thi', exact: true }).click();
  await expect(page).toHaveURL(/\/lich-su$/);
  await page.waitForTimeout(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/quy-doi$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
