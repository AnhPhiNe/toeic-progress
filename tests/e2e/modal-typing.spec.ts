import { expect, test } from '@playwright/test';
import { PHONE_VIEWPORT, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

// fill() sets the value in one step and hid this bug: the first real keystroke changed the
// modal's close handler, focus jumped to the first button and the next keys were lost.

test('typing into the mistake entry keeps focus and every character', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  await openNoteForm(page);
  const paste = page.locator('#mistake-paste');
  await paste.click();
  await page.keyboard.type('Reports should be');
  await expect(paste).toBeFocused();
  await expect(paste).toHaveValue('Reports should be');
});

test('typing into the settings name field keeps focus and every character', async ({ page }) => {
  // Settings open from the phone's avatar sheet ("Tài khoản & cài đặt").
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  await page.getByRole('button', { name: /^Hồ sơ của bạn/ }).click();
  await page.getByRole('dialog', { name: 'Hồ sơ' }).getByRole('button', { name: /Tài khoản & cài đặt/ }).click();
  await page.getByRole('dialog', { name: 'Cài đặt' }).locator('[data-settings-row="account"]').click();
  const name = page.getByLabel('Tên học viên');
  await name.click();
  await name.press('Control+a');
  await page.keyboard.type('Minh Anh');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Minh Anh');
});
