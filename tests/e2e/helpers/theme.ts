import type { Page } from '@playwright/test';

/** Below md the theme switch lives in the bottom bar's "Thêm" sheet, so a phone user opens it first. */
export async function switchToDarkOnMobile(page: Page) {
  await page.getByRole('button', { name: 'Thêm trang và cài đặt', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Thêm', exact: true });
  await sheet.getByRole('button', { name: 'Giao diện tối', exact: true }).click();
  await page.keyboard.press('Escape');
}
