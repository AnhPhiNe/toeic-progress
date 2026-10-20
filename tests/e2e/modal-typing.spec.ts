import { expect, test } from '@playwright/test';

// fill() sets the value in one step and hid this bug: the first real keystroke changed the
// modal's close handler, focus jumped to the first button and the next keys were lost.

test('typing into the mistake entry keeps focus and every character', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const paste = page.locator('#mistake-paste');
  await paste.click();
  await page.keyboard.type('Reports should be');
  await expect(paste).toBeFocused();
  await expect(paste).toHaveValue('Reports should be');
});

test('typing into the settings form keeps focus and every character', async ({ page }) => {
  await page.goto('/tu-vung');
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  const name = page.getByRole('dialog').getByLabel('Tên của bạn', { exact: true });
  await name.click();
  await name.press('Control+a');
  await page.keyboard.type('Minh Anh');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Minh Anh');
});
