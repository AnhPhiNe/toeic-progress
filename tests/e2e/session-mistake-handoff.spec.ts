import { test, expect, type Page } from '@playwright/test';
import { openManualForm } from './helpers/mistakeForm';
import { closeTestResult, sessionDialog, useOfficialScore } from './helpers/sessionForm';
import { openManualEntry } from './helpers/manualEntry';
import { gotoPage, openScoreLogger } from './helpers/nav';

async function openSession(page: Page, practice = false) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: false }; }
      export async function extractMistakeWithAI() { throw new Error('This flow must not call AI automatically'); }
    `
  }));
  // The redesigned phone logger has no "Lưu & thêm câu sai"; computers keep it in the Full Test's total-score view and the Part practice form.
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoPage(page, '/lich-su');
  await openScoreLogger(page);
  const modal = sessionDialog(page);
  if (practice) { await modal.getByRole('button', { name: 'Bài luyện Part', exact: true }).click(); await modal.getByRole('button', { name: /^Thêm tên bài/ }).click(); }
  else await openManualEntry(page, modal);
  await modal.getByLabel(/^Tên đề( hoặc nguồn)?$/).first().fill(practice ? 'ETS Practice' : 'ETS Handoff');
  if (!practice) {
    await useOfficialScore(modal);
    await modal.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
    await modal.getByLabel('Tổng điểm TOEIC /990').fill('800');
  }
  return modal;
}

const captureDialog = (page: Page) => page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });

// On computers "Lưu & thêm câu sai" opens the notebook's camera dialog for that test ("Tự gõ một câu" types one by hand).
for (const practice of [false, true]) test(`saving ${practice ? 'practice' : 'full test'} opens the shared notebook with one saved result and a source ready`, async ({ page }, info) => {
  const sessionModal = await openSession(page, practice);
  await expect(sessionModal.getByText(/Ghi Nhanh Lỗi Sai Vào Sổ Tay/)).toHaveCount(0);
  await expect(sessionModal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true })).toBeInViewport();
  await expect(sessionModal.getByRole('button', { name: /^Lưu (kết quả|điểm)$/ })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('save-result-actions.png') });
  await sessionModal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  const capture = captureDialog(page);
  await expect(capture).toBeVisible();
  await expect(sessionModal).toHaveCount(0);
  const source = practice ? 'ETS Practice' : 'ETS Handoff';
  await expect(capture.getByLabel('Đề', { exact: true })).toHaveValue(source);
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ testName: source, sessionType: practice ? 'PART_PRACTICE' : 'FULL_TEST' });
  await capture.getByRole('button', { name: /Tự gõ một câu/ }).click();
  const manual = page.getByRole('dialog', { name: 'Tự gõ một câu sai', exact: true });
  await expect(manual.getByLabel('Đề', { exact: true })).toHaveValue(source);
  await manual.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await manual.getByRole('button', { name: 'Đáp án đúng: B', exact: true }).click();
  await manual.getByRole('button', { name: 'Lưu, Sóc giải thích giúp', exact: true }).click();
  await expect(manual).toHaveCount(0);
  await openManualForm(page);
  await expect(manual.getByLabel('Đề', { exact: true })).toHaveValue(source);
  await manual.getByLabel('Câu hỏi và các phương án').fill('Forms should ____ submitted.\n(A) are\n(B) be');
  await manual.getByRole('button', { name: 'Lưu, Sóc giải thích giúp', exact: true }).click();
  await expect(manual).toHaveCount(0);
  const mistakes = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(mistakes).toHaveLength(2);
  for (const card of mistakes) expect(card).toMatchObject({ sourceTestName: source, part: 5 });
});

test('a note typed right after logging a test is linked to that test session', async ({ page }) => {
  const sessionModal = await openSession(page);
  await sessionModal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await captureDialog(page).getByRole('button', { name: /Tự gõ một câu/ }).click();
  const manual = page.getByRole('dialog', { name: 'Tự gõ một câu sai', exact: true });
  await manual.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await manual.getByRole('button', { name: 'Lưu, Sóc giải thích giúp', exact: true }).click();
  const state = await page.evaluate(() => { const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); return { session: bundle.sessions[0], card: bundle.mistakes[0] }; });
  expect(state.card.sessionId).toBe(state.session.id);
});

test('invalid input and a failed save retain the result form; retry opens the notebook only after persistence', async ({ page }) => {
  const modal = await openSession(page);
  await modal.getByLabel('Tổng điểm TOEIC /990').fill('995');
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(0);
  await modal.getByLabel('Tổng điểm TOEIC /990').fill('800');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { restoreHandoffWrites?: () => void }).restoreHandoffWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Test save failed', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
  await expect(captureDialog(page)).toHaveCount(0);
  await page.evaluate(() => (window as Window & { restoreHandoffWrites?: () => void }).restoreHandoffWrites?.());
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(captureDialog(page)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(1);
});

// The second half of the old "Enter saves the result ..." test (the top bar's sync indicator opening account settings) went with the
// old top bar; the Enter-to-save half stays.
test('Enter saves the result without opening notes', async ({ page }) => {
  const modal = await openSession(page);
  await modal.getByLabel('Tổng điểm TOEIC /990').press('Enter');
  await expect(modal).toHaveCount(0);
  await expect(captureDialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(1);
  await closeTestResult(page);
});
