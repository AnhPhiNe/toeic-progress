import { expect, test, type Page } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';

async function openMinimal(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  // The paste view has no name field (the picture names the test); the short "Tự chọn câu sai" view does.
  await form.getByRole('button', { name: /^Tự chọn câu sai/ }).click();
  await form.getByRole('button', { name: /^‹ Quay lại/ }).click();
  await form.locator('#session-test-name').fill(name);
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  return form;
}

const savedSession = (page: Page, name: string) => page.evaluate(testName => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions
  .find((item: { testName: string }) => item.testName === testName), name);

test('typed wrong list with official Listening and Reading saves the official sections score', async ({ page }) => {
  const form = await openMinimal(page, 'ETS Minimal Official');
  await form.getByLabel('Số câu sai', { exact: true }).fill('3, 15 101-105');
  await expect(form.getByRole('group', { name: 'Câu sai theo Part' })).toHaveText('P11P21P30P40P55P60P70');
  await expect(form.getByTestId('manual-entry').getByText('Ước tính từ câu sai', { exact: true })).toBeVisible();
  await expect(form.getByTestId('manual-total')).toHaveText(/^~/);

  await form.getByLabel('Listening', { exact: true }).fill('405');
  await form.getByLabel('Reading', { exact: true }).fill('400');
  await expect(form.getByTestId('manual-total')).toHaveText('805');
  await expect(form.getByTestId('manual-entry').getByText('Điểm từ đề thi', { exact: true })).toBeVisible();
  // The wrong list never changes the official sections.
  await form.getByLabel('Số câu sai', { exact: true }).fill('3');
  await expect(form.getByLabel('Listening', { exact: true })).toHaveValue('405');
  await expect(form.getByTestId('manual-total')).toHaveText('805');
  await form.getByLabel('Số câu sai', { exact: true }).fill('3, 15 101-105');

  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await expect(form).toHaveCount(0);
  const session = await savedSession(page, 'ETS Minimal Official');
  expect(session).toMatchObject({ scoreSource: 'MANUAL_SECTIONS', scaledListening: 405, scaledReading: 400, totalScore: 805, durationMinutes: 0 });
  expect(session.wrongQuestions).toEqual([3, 15, 101, 102, 103, 104, 105]);
});

test('typed wrong list without Listening and Reading saves an estimated score', async ({ page }) => {
  const form = await openMinimal(page, 'ETS Minimal Estimated');
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 abc');
  await expect(form.getByRole('alert')).toHaveText('Không đọc được: abc');
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 15 101-105');
  await expect(form.getByRole('alert')).toHaveCount(0);

  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await expect(form).toHaveCount(0);
  const session = await savedSession(page, 'ETS Minimal Estimated');
  expect(session.scoreSource).toBe('ESTIMATED');
  expect(session.wrongQuestions).toEqual([3, 15, 101, 102, 103, 104, 105]);
});

test('the grid view opens from the short view and goes back to it', async ({ page }) => {
  const form = await openMinimal(page, 'ETS Minimal Grid');
  await form.getByLabel('Số câu sai', { exact: true }).fill('3');
  await form.getByRole('button', { name: /^Chạm từng câu trên lưới/ }).click();
  await expect(form.getByRole('button', { name: 'Câu 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByRole('button', { name: 'Dán ảnh', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: /^‹ Quay lại$/ }).click();
  await expect(form.getByLabel('Số câu sai', { exact: true })).toHaveValue('3');
  await form.getByRole('button', { name: /^‹ Quay lại dán ảnh/ }).click();
  await expect(form.getByRole('button', { name: /^Tự chọn câu sai/ })).toBeVisible();
});
