import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

async function openScores(page: Page, scores: { listening: number | null; reading: number | null; total: number | null }, width = 390) {
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
  if (width < 768) {
    await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  } else await page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^(Ghi điểm|Nhập kết quả học tập)$/ });
  await form.locator('#session-test-name').fill('QA source score');
  return form;
}
const upload = async (form: ReturnType<Page['getByRole']>) => form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((row: { testName: string }) => row.testName === 'QA source score'));

for (const width of [390, 1280]) {
  test(`source L/R overrides the estimate only after review and retains wrong questions at ${width}px`, async ({ page }, testInfo) => {
    const form = await openScores(page, { listening: 375, reading: 370, total: 745 }, width);
    await upload(form);
    const review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
    await expect(review).toBeVisible();
    await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('375');
    await expect(form.getByText('745', { exact: true })).toHaveCount(0);
    await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
    await expect(form.getByRole('alert')).toContainText('Kiểm tra và áp dụng điểm từ đề');
    expect(await saved(page)).toBeUndefined();
    await page.screenshot({ path: testInfo.outputPath(`source-score-${width}.png`), fullPage: true });
    await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
    await expect(form.getByLabel('Điểm Listening /495')).toHaveValue('375');
    await expect(form.getByLabel('Điểm Reading /495')).toHaveValue('370');
    await form.getByLabel('Điểm Reading /495').fill('375');
    await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
    await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'MANUAL_SECTIONS', totalScore: 750,
      scaledListening: 375, scaledReading: 375, wrongQuestions: [3, 107, 117, 153] });
    const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((row: { questionNumber: number }) => row.questionNumber));
    expect(drafts).toEqual([107, 117, 153]);
    await page.reload();
    expect(await saved(page)).toMatchObject({ totalScore: 750, wrongQuestions: [3, 107, 117, 153] });
  });
}

test('total-only image scores remain total-only and retain the marked questions', async ({ page }) => {
  const form = await openScores(page, { listening: null, reading: null, total: 800 });
  await upload(form);
  await form.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(form.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ totalScore: 800, scoreSource: 'MANUAL_TOTAL', wrongQuestions: [3, 107, 117, 153] });
  expect(await saved(page)).not.toHaveProperty('scaledListening');
  expect(await saved(page)).not.toHaveProperty('scaledReading');
});

test('an inconsistent image total needs correction or an explicit total-only choice', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 800 });
  await upload(form);
  const review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('chưa khớp');
  await expect(form.getByLabel('Ảnh kết quả')).toHaveCount(1);
  await review.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(form.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
});

test('a result without visible scores permits manual source entry without another AI call', async ({ page }) => {
  const form = await openScores(page, { listening: null, reading: null, total: null });
  await upload(form);
  await expect(form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Nhập điểm từ đề (tùy chọn)', exact: true }).click();
  const review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await review.getByLabel('Điểm từ ảnh: Tổng').fill('805');
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(form.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('805');
});

test('using the estimate requires an explicit choice when the image contains source scores', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 745 });
  await upload(form);
  await form.getByRole('button', { name: 'Dùng điểm ước tính', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toMatchObject({ scoreSource: 'ESTIMATED', wrongQuestions: [3, 107, 117, 153] });
});

test('unapplied source scores and learner corrections survive the responsive layout change', async ({ page }) => {
  const form = await openScores(page, { listening: 375, reading: 370, total: 745 });
  await upload(form);
  let review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByLabel('Điểm từ ảnh: Listening').fill('400');
  await review.getByLabel('Điểm từ ảnh: Reading').fill('345');
  await page.setViewportSize({ width: 1280, height: 900 });
  review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('400');
  await expect(review.getByLabel('Điểm từ ảnh: Reading')).toHaveValue('345');
  await expect(review.getByLabel('Điểm từ ảnh: Tổng')).toHaveValue('745');
  await review.getByRole('button', { name: 'Áp dụng điểm từ đề', exact: true }).click();
  await expect(form.getByLabel('Điểm Listening /495')).toHaveValue('400');
  await expect(form.getByLabel('Điểm Reading /495')).toHaveValue('345');
});
