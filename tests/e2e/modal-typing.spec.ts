import { expect, test } from '@playwright/test';
import { PHONE_VIEWPORT, openCardEditor, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

// fill() sets the value in one step and hid this bug: the first real keystroke changed the
// modal's close handler, focus jumped to the first button and the next keys were lost.

test('typing into manual entry and card edit keeps focus and every character', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const manual = await openManualForm(page);
  const raw = manual.locator('#man-raw');
  await raw.click();
  await page.keyboard.type('Reports should be');
  await expect(raw).toBeFocused();
  await expect(raw).toHaveValue('Reports should be');
  await manual.getByRole('button', { name: 'Đóng', exact: true }).click();

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'type-card', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', sourceTestName: 'ETS Typing',
      question: 'Seeded ____ here.', questionContext: 'Seeded ____ here.', options: ['(A) one', '(B) two'], correctAnswer: '(A) one',
      answerSource: 'PROVIDED', userMistake: '', tags: [], createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const editor = await openCardEditor(page);
  const paste = editor.locator('#mistake-paste');
  await paste.click();
  await paste.press('Control+a');
  await page.keyboard.type('Updated text kept');
  await expect(paste).toBeFocused();
  await expect(paste).toHaveValue('Updated text kept');
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
