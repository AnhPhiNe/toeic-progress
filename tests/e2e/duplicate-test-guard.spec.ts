import { expect, test, type Page } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';
import { chooseMore } from './helpers/manualEntry';
import { phoneLogger, phoneManualScore, useOfficialScore } from './helpers/sessionForm';

/** One Full Test already logged today: "ETS Dup 04", 960. */
async function seedToday(page: Page) {
  await page.goto('/lich-su');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    data.sessions = [{ id: 'dup-old', testName: 'ETS Dup 04', skillType: 'LR', sessionType: 'FULL_TEST', date: today, durationMinutes: 115,
      totalScore: 960, scaledListening: 495, scaledReading: 465, scoreSource: 'MANUAL_SECTIONS', attemptNumber: 1, notes: '',
      createdAt: now.toISOString(), updatedAt: now.toISOString(), deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
}
const sessions = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions as { id: string; testName: string }[]);

async function desktopLog(page: Page, typedName: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedToday(page);
  await openScoreLogger(page);
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await chooseMore(form, /^Không có ảnh\? Tự nhập tay/);
  await form.getByRole('button', { name: /Sửa đề & giờ/ }).click();
  await form.locator('#session-test-name').fill(typedName);
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  await useOfficialScore(form);
  await form.getByLabel('Điểm Nghe /495', { exact: true }).fill('450');
  await form.getByLabel('Điểm Đọc /495', { exact: true }).fill('420');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  return form;
}

test('desktop: the same test on the same day asks first, then "Vẫn lưu" saves a second copy', async ({ page }) => {
  const form = await desktopLog(page, '  ets dup   04 ');
  const warning = form.getByRole('alert').filter({ hasText: 'Bạn đã ghi' });
  await expect(warning).toHaveText(/Bạn đã ghi “ETS Dup 04” hôm nay · 960/);
  expect(await sessions(page)).toHaveLength(1);
  await form.getByRole('button', { name: 'Vẫn lưu', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await sessions(page)).length).toBe(2);
});

test('desktop: "Mở đề cũ" opens the saved test in the editor instead of saving', async ({ page }) => {
  const form = await desktopLog(page, 'ETS Dup 04');
  await form.getByRole('button', { name: 'Mở đề cũ', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Sửa kết quả', exact: true });
  await expect(editor).toBeVisible();
  const editMeta = editor.locator('.rdl-meta-bar button');
  if (await editMeta.isVisible()) await editMeta.click();
  await expect(editor.locator('#session-test-name')).toHaveValue('ETS Dup 04');
  await expect(editor.getByLabel('Điểm Nghe /495')).toHaveValue('495');
  expect(await sessions(page)).toHaveLength(1);
});

test('desktop: changing the name clears the warning and saves at once', async ({ page }) => {
  const form = await desktopLog(page, 'ETS Dup 04');
  await expect(form.getByRole('button', { name: 'Vẫn lưu', exact: true })).toBeVisible();
  await form.locator('#session-test-name').fill('ETS Dup 05');
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  await expect(form.getByRole('button', { name: 'Vẫn lưu', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await sessions(page)).map(session => session.testName).sort()).toEqual(['ETS Dup 04', 'ETS Dup 05']);
});

test('phone: the warning sits above the save button, which becomes "Vẫn lưu"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedToday(page);
  await openScoreLogger(page);
  await phoneManualScore(page, 'ETS Dup 04');
  const dialog = phoneLogger(page);
  await dialog.getByRole('button', { name: /^Lưu điểm/ }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'Bạn đã ghi' })).toHaveText(/Bạn đã ghi “ETS Dup 04” hôm nay · 960/);
  expect(await sessions(page)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Vẫn lưu', exact: true }).click();
  await expect.poll(async () => (await sessions(page)).length).toBe(2);
});
