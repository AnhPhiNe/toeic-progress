import type { Page } from '@playwright/test';
import { isPhoneLayout } from './nav';

/**
 * Opens Cài đặt wherever the app is.
 * Phones: the round avatar on a redesigned page opens the "Hồ sơ" sheet whose last row is "Tài khoản & cài đặt";
 * pages that keep the old top bar (Từ vựng, Kế hoạch) still carry the avatar "Tài khoản và cài đặt: …".
 * Computers: the old top bar's exam countdown ("… Bấm để cài đặt.") opens it; the redesigned Hôm nay has "Đặt ngày thi".
 */
export async function openSettings(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Cài đặt', exact: true });
  if (await isPhoneLayout(page)) {
    const legacy = page.getByRole('button', { name: /^Tài khoản và cài đặt:/ });
    if (await legacy.count()) await legacy.click();
    else {
      await page.getByRole('button', { name: /^Hồ sơ của bạn/ }).first().click();
      await page.getByRole('button', { name: /^Tài khoản & cài đặt/ }).click();
    }
  } else {
    const countdown = page.getByRole('button', { name: /Bấm để cài đặt\.$/ });
    if (await countdown.count()) await countdown.click();
    else await page.getByRole('button', { name: /Đặt ngày thi/ }).first().click();
  }
  await dialog.waitFor();
  return dialog;
}
