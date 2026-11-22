import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { openManualEntry } from './helpers/manualEntry';
import { sessionDialog } from './helpers/sessionForm';
import { openScoreLogger } from './helpers/nav';

async function openScores(page: Page, scores: { listening: number | null; reading: number | null; total: number | null }, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', resultImages: true }; }
      export async function getAIUsage() { return null; }
      export async function readResultsWithAI() { return { wrong: [3, 107, 153], skipped: [117], scores: ${JSON.stringify(scores)}, usage: {} }; }
      export async function extractMistakeWithAI() { throw new Error('unused'); }
      export async function extractPageWithAI() { throw new Error('unused'); }
    `
  }));
  await page.goto('/lich-su');
  await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
  await page.reload();
  await openScoreLogger(page);
  const form = sessionDialog(page);
  // The paste view has no name field; the grid view behind "Tự chọn câu sai" does and keeps the "Ảnh kết quả" picker.
  await openManualEntry(page, form);
  await form.locator('#session-test-name').fill('QA source score');
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  return form;
}
const upload = async (form: ReturnType<Page['getByRole']>) => form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((row: { testName: string }) => row.testName === 'QA source score'));

test('consistent source L/R apply on their own, replace the estimate and retain wrong questions', async ({ page }, testInfo) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 745 });
  await upload(form);
  // Nothing to review: the sections add up to the total, so the official score is applied straight away.
  await expect(page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
  await expect(form.getByText('Chính thức', { exact: true })).toBeVisible();
  await expect(form.getByText('745', { exact: true })).toBeVisible();
  await expect(form).toContainText(/L\s*375\s*R\s*370/);
  await page.screenshot({ path: testInfo.outputPath('source-score-1280.png'), fullPage: true });
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'MANUAL_SECTIONS', totalScore: 745,
    scaledListening: 375, scaledReading: 370, wrongQuestions: [3, 107, 117, 153] });
  const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((row: { questionNumber: number }) => row.questionNumber));
  expect(drafts).toEqual([107, 117, 153]);
  await page.reload();
  expect(await saved(page)).toMatchObject({ totalScore: 745, wrongQuestions: [3, 107, 117, 153] });
});

test('image scores that do not add up replace the estimate only after review and retain wrong questions', async ({ page }, testInfo) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 800 });
  await upload(form);
  const review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(review).toBeVisible();
  await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('375');
  await expect(form.getByText('800', { exact: true })).toHaveCount(0);
  // Reading the image alone does not block saving; once the learner edits a value it must be applied (or dropped) first.
  await review.getByLabel('Điểm từ ảnh: Reading').fill('375');
  await page.keyboard.press('Escape');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect(form.getByRole('alert')).toContainText('Kiểm tra và áp dụng điểm từ đề');
  expect(await saved(page)).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath('source-score-review-1280.png'), fullPage: true });
  await form.getByRole('button', { name: /Kiểm tra điểm chưa áp dụng|Điểm từ đề: Cần kiểm tra/ }).click();
  await review.getByLabel('Điểm từ ảnh: Tổng').fill('750');
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(review).toHaveCount(0);
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'MANUAL_SECTIONS', totalScore: 750,
    scaledListening: 375, scaledReading: 375, wrongQuestions: [3, 107, 117, 153] });
  const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((row: { questionNumber: number }) => row.questionNumber));
  expect(drafts).toEqual([107, 117, 153]);
  await page.reload();
  expect(await saved(page)).toMatchObject({ totalScore: 750, wrongQuestions: [3, 107, 117, 153] });
});

test('total-only image scores remain total-only and retain the marked questions', async ({ page }) => {
  const form = await openScores(page, { listening: null, reading: null, total: 800 });
  await upload(form);
  await expect(page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
  await expect(form.getByText('800', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ totalScore: 800, scoreSource: 'MANUAL_TOTAL', wrongQuestions: [3, 107, 117, 153] });
  expect(await saved(page)).not.toHaveProperty('scaledListening');
  expect(await saved(page)).not.toHaveProperty('scaledReading');
});

test('an inconsistent image total needs correction or an explicit total-only choice', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 800 });
  await upload(form);
  const review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('chưa khớp');
  await expect(form.getByLabel('Ảnh kết quả')).toHaveCount(1);
  await review.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'MANUAL_TOTAL', totalScore: 800 });
});

test('a result without visible scores permits manual source entry without another AI call', async ({ page }) => {
  const form = await openScores(page, { listening: null, reading: null, total: null });
  await upload(form);
  await expect(page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
  await form.getByRole('button', { name: /^Điểm từ đề thi/ }).click();
  const review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await review.getByLabel('Điểm từ ảnh: Tổng').fill('805');
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'MANUAL_TOTAL', totalScore: 805 });
});

test('dropping the applied source scores is the explicit choice to use the estimate', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 745 });
  await upload(form);
  await expect(form.getByText('Chính thức', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: '✕ Bỏ' }).click();
  await expect(form.getByText('Chính thức', { exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'ESTIMATED', wrongQuestions: [3, 107, 117, 153] });
});

test('unapplied source scores and learner corrections survive a window resize', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 800 });
  await upload(form);
  let review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByLabel('Điểm từ ảnh: Listening').fill('400');
  await review.getByLabel('Điểm từ ảnh: Reading').fill('345');
  // Phones (<768px) log through the full-screen PhoneLogger instead, so the resize stays within the computer form.
  await page.setViewportSize({ width: 800, height: 900 });
  await page.setViewportSize({ width: 1280, height: 900 });
  review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('400');
  await expect(review.getByLabel('Điểm từ ảnh: Reading')).toHaveValue('345');
  await expect(review.getByLabel('Điểm từ ảnh: Tổng')).toHaveValue('745');
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scaledListening: 400, scaledReading: 345, totalScore: 745 });
});
