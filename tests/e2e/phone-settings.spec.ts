import { expect, test } from '@playwright/test';

const profile = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile);

test('phone settings list saves one field per sheet and Escape closes the sheet before the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.getByRole('button', { name: /^Tài khoản và cài đặt/ }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await expect(settings.getByText('Chỉ lưu trên máy')).toBeVisible();

  await settings.getByRole('button', { name: /^Điểm mục tiêu/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Điểm mục tiêu', exact: true });
  await sheet.getByRole('button', { name: 'Tăng', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(settings).toBeVisible();
  expect((await profile(page)).targetScore).toBe(990);

  await settings.getByRole('button', { name: /^Điểm mục tiêu/ }).click();
  await sheet.getByRole('button', { name: '850', exact: true }).click();
  await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect((await profile(page)).targetScore).toBe(850);
  await expect(settings.getByRole('button', { name: /^Điểm mục tiêu/ })).toContainText('850');

  await settings.getByRole('button', { name: /^Ngày thi/ }).click();
  await page.getByLabel('Chọn ngày thi', { exact: true }).fill('2030-01-15');
  await page.getByRole('dialog', { name: 'Ngày thi', exact: true }).getByRole('button', { name: 'Lưu', exact: true }).click();
  expect((await profile(page)).examDate).toBe('2030-01-15');
  await expect(settings.getByRole('button', { name: /^Ngày thi/ })).toContainText('15/01');

  await settings.locator('[data-settings-row="account"]').click();
  const account = page.getByRole('dialog', { name: 'Tài khoản', exact: true });
  await account.getByRole('textbox').first().fill('Minh Tuấn');
  await account.getByRole('button', { name: 'Lưu tên', exact: true }).click();
  expect((await profile(page)).name).toBe('Minh Tuấn');
  await expect(settings.getByText('Minh Tuấn', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
});
