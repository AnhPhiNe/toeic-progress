import type { Page } from '@playwright/test';
import { isPhoneLayout } from './nav';

/**
 * Opens Cài đặt wherever the app is.
 * Phones: the round avatar on a redesigned page opens the "Hồ sơ" sheet whose last row is "Tài khoản & cài đặt".
 * Computers: the sidebar's "Tài khoản & cài đặt" button.
 */
export async function openSettings(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  if (await isPhoneLayout(page)) {
    await page.getByRole('button', { name: /^Hồ sơ của bạn/ }).first().click();
    await page.getByRole('button', { name: /^Tài khoản & cài đặt/ }).click();
  } else {
    await page.getByRole('button', { name: /^Tài khoản & cài đặt/ }).click();
  }
  await dialog.waitFor();
  return dialog;
}
