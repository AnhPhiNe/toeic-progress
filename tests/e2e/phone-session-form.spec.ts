import { expect, test, type Page } from '@playwright/test';
import { openRecordSheet, openScoreLogger } from './helpers/nav';
import { phoneLogger, phoneManualScore, pickPhoneTestName, setWheel } from './helpers/sessionForm';
import { answerConfirm } from './helpers/confirmDialog';

// Phones (<768px) log through the full-screen PhoneLogger: pick the test, then type the score on wheels or read it from a screenshot.
async function openForm(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const dialog = phoneLogger(page);
  await expect(dialog.getByRole('heading', { name: 'Ghi điểm đề', exact: true })).toBeVisible();
  return dialog;
}
const lastSession = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.at(-1));

test('phone Full Test: the wheels set the official Listening and Reading and the total follows', async ({ page }) => {
  const dialog = await openForm(page);
  await phoneManualScore(page, 'ETS Phone');
  await expect(dialog.getByRole('heading', { name: 'ETS Phone', exact: true })).toBeVisible();
  await setWheel(dialog, 'Điểm Nghe', 400);
  await setWheel(dialog, 'Điểm Đọc', 350);
  await expect(dialog.locator('.pl-total b')).toHaveText('750');
  await dialog.getByRole('button', { name: 'Lưu điểm 750', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await lastSession(page)).toMatchObject({ testName: 'ETS Phone', scoreSource: 'MANUAL_SECTIONS', scaledListening: 400, scaledReading: 350, totalScore: 750, durationMinutes: 120 });
});

test('phone Full Test can type correct answers instead of scaled scores', async ({ page }) => {
  const dialog = await openForm(page);
  await phoneManualScore(page, 'ETS Counts');
  await dialog.getByRole('button', { name: 'Số câu đúng', exact: true }).click();
  await expect(dialog.getByText(/^Vuốt để chọn số câu/)).toBeVisible();
  await setWheel(dialog, 'Điểm Nghe', 92, 1, 0);
  await setWheel(dialog, 'Điểm Đọc', 88, 1, 0);
  await dialog.getByRole('button', { name: /^Lưu điểm \d+/ }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await lastSession(page);
  expect(saved).toMatchObject({ testName: 'ETS Counts', scoreSource: 'MANUAL_SECTIONS' });
  expect(saved.scaledListening).toBeGreaterThan(400);
  expect(saved.scaledReading).toBeGreaterThan(350);
});

test('phone Full Test keeps the wrong questions, which become draft notebook cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [{ id: 'old', testName: 'ETS 2024 Test 03', skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-01', durationMinutes: 120,
      createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', deletedAt: null, totalScore: 800, scaledListening: 400, scaledReading: 400, scoreSource: 'MANUAL_SECTIONS' }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await openScoreLogger(page);
  const dialog = phoneLogger(page);
  // The next test in the series is suggested and already chosen.
  await expect(dialog.getByRole('group', { name: 'Đề', exact: true }).getByRole('button', { name: 'ETS 2024 Test 04', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: /^✎ Tự chọn câu sai/ }).click();
  await dialog.getByRole('button', { name: /^Sửa điểm/ }).click();
  await expect(dialog.locator('.pl-total b')).toHaveText('800');
  await dialog.getByRole('button', { name: /^Câu sai/ }).click();
  const summary = dialog.locator('.pl-score-mini');
  await expect(summary).toContainText('Chưa chọn câu sai');
  await dialog.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await dialog.getByRole('button', { name: /^Part 5/ }).click();
  await dialog.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await dialog.getByRole('button', { name: 'Câu 113', exact: true }).click();
  await dialog.getByRole('button', { name: 'Câu 113', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Part 5, 1 câu sai', exact: true })).toBeVisible();
  await expect(summary).toContainText('2 câu sai');
  // Typing replaces the marks: "3" stays, 107 goes, a range is added.
  await dialog.getByRole('button', { name: 'Gõ số câu thay vì chạm', exact: true }).click();
  await expect(dialog.getByLabel('Số câu sai', { exact: true })).toHaveValue('3 107');
  await dialog.getByLabel('Số câu sai', { exact: true }).fill('3 abc');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('abc');
  await dialog.getByLabel('Số câu sai', { exact: true }).fill('3, 151-153');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(summary).toContainText('4 câu sai');
  await dialog.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(dialog.getByText('4 câu đã chọn', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu điểm 800', exact: true }).click();

  const result = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Xong', exact: true }) });
  await expect(result.getByRole('button', { name: 'Ghi chi tiết 3 câu sai', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  const session = stored.sessions.find((item: { testName: string }) => item.testName === 'ETS 2024 Test 04');
  expect(session).toMatchObject({ wrongQuestions: [3, 151, 152, 153], scoreSource: 'MANUAL_SECTIONS', totalScore: 800 });
  const drafts = stored.mistakes.filter((item: { sessionId?: string; deletedAt?: string | null }) => item.sessionId === session.id && !item.deletedAt);
  expect(drafts.map((item: { questionNumber: number; part: number }) => [item.questionNumber, item.part]).sort((a: number[], b: number[]) => a[0] - b[0]))
    .toEqual([[151, 7], [152, 7], [153, 7]]);
  await result.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(result).toHaveCount(0);
});

test('phone asks before saving a screenshot result with no wrong questions', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', resultImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI() { throw new Error('not used'); }
      export async function readResultsWithAI() { return { wrong: [], skipped: [], usage: {} }; }`
  }));
  const dialog = await openForm(page);
  await pickPhoneTestName(page, 'Perfect run');
  await dialog.getByLabel('Chụp màn kết quả').setInputFiles('tests/fixtures/part7-notice.png');
  await expect(dialog.getByRole('heading', { name: 'Câu sai', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Lưu điểm/ }).click();
  await answerConfirm(page, false, '990');
  await expect(dialog).toBeVisible();
});

test('phone Part practice picks one Part, counts correct answers and defaults to 30 minutes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await openRecordSheet(page, 'practice');
  const dialog = phoneLogger(page);
  await expect(dialog.getByRole('heading', { name: 'Ghi buổi luyện', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Thời gian (phút)', { exact: true })).toHaveValue('30');
  await dialog.getByRole('button', { name: 'Part 6', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Part 6', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Tổng số câu', { exact: true })).toHaveValue('16');
  await dialog.getByLabel('Số câu đúng', { exact: true }).fill('14');
  await expect(dialog.getByRole('img', { name: '88% đúng' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu buổi luyện', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await lastSession(page)).toMatchObject({ sessionType: 'PART_PRACTICE', durationMinutes: 30, practiceParts: [{ part: 6, correct: 14, total: 16 }] });
});
