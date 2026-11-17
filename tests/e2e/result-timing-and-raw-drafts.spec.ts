import { test, expect, type Page } from '@playwright/test';
import { openGridForm } from './helpers/sessionForm';
import { resolve } from 'node:path';

// Phones (<768px) log a Full Test through the full-screen PhoneLogger, covered in phone-session-form.spec.ts.
async function openForm(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/lich-su');
  return openGridForm(page);
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions);
const allNull = { totalSeconds: null, listeningSeconds: null, readingSeconds: null, parts: { part1: null, part2: null, part3: null, part4: null, part5: null, part6: null, part7: null } };
const image = resolve('tests/fixtures/part7-notice.png');

async function mockTiming(page: Page, timing: unknown) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration(){return {provider:'openai',resultImages:true};}
    export async function getAIUsage(){return null;}
    export async function readResultsWithAI(){localStorage.setItem('__timingCalls',String(Number(localStorage.getItem('__timingCalls')||0)+1));return {wrong:[107],skipped:[],timing:${JSON.stringify(timing)},usage:{}};}
    export async function extractMistakeWithAI(){throw new Error('unused');}
    export async function extractPageWithAI(){throw new Error('unused');}
  ` }));
}

test('supplemental images merge their confirmed elapsed scopes', async ({ page }) => {
  const first = { ...allNull, totalSeconds: 6763, parts: { ...allNull.parts, part5: 870 } };
  const second = { ...allNull, parts: { ...allNull.parts, part6: 600 } };
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    let calls=0;
    export async function getAIConfiguration(){return {provider:'openai',resultImages:true};}
    export async function getAIUsage(){return null;}
    export async function readResultsWithAI(){return {wrong:[107],skipped:[],timing:++calls===1?${JSON.stringify(first)}:${JSON.stringify(second)},usage:{}};}
    export async function extractMistakeWithAI(){throw new Error('unused');}
    export async function extractPageWithAI(){throw new Error('unused');}
  ` }));
  const form = await openForm(page);
  await form.locator('#session-test-name').fill('QA supplemental elapsed');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  // Times read from a picture are confirmed on their own; the learner can still open them to check or edit.
  await expect(form.getByText('Thời gian đã xác nhận từ ảnh: 1:52:43.')).toBeVisible();
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await expect(form.getByText(/^Thời gian đã xác nhận từ ảnh: 1:52:43/)).toBeVisible();
  await form.getByRole('button', { name: 'Kiểm tra / sửa thời gian', exact: true }).click();
  const review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await expect(review.getByLabel('Thời gian từ ảnh: Tổng thời gian')).toHaveValue('1:52:43');
  await expect(review.getByLabel('Thời gian từ ảnh: Part 5')).toHaveValue('14:30');
  await expect(review.getByLabel('Thời gian từ ảnh: Part 6')).toHaveValue('10:00');
  await review.getByRole('button', { name: 'Áp dụng thời gian từ ảnh', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({
    durationMinutes: 112.72, partDurations: { part5: 14.5, part6: 10 },
    resultTiming: { ...first, source: 'IMAGE_CONFIRMED', parts: { ...first.parts, part6: 600 } },
  })]);
});

test('supplemental images retain pending timing edits before applying either image', async ({ page }) => {
  const first = { ...allNull, totalSeconds: 6763, parts: { ...allNull.parts, part5: 870 } };
  const second = { ...allNull, parts: { ...allNull.parts, part6: 600 } };
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    let calls=0;
    export async function getAIConfiguration(){return {provider:'openai',resultImages:true};}
    export async function getAIUsage(){return null;}
    export async function readResultsWithAI(){return {wrong:[107],skipped:[],timing:++calls===1?${JSON.stringify(first)}:${JSON.stringify(second)},usage:{}};}
    export async function extractMistakeWithAI(){throw new Error('unused');}
    export async function extractPageWithAI(){throw new Error('unused');}
  ` }));
  const form = await openForm(page);
  await form.locator('#session-test-name').fill('QA pending supplemental elapsed');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await form.getByRole('button', { name: 'Kiểm tra / sửa thời gian', exact: true }).click();
  const review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await review.getByLabel('Thời gian từ ảnh: Part 5').fill('13:15');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await expect(review.getByLabel('Thời gian từ ảnh: Part 5')).toHaveValue('13:15');
  await expect(review.getByLabel('Thời gian từ ảnh: Part 6')).toHaveValue('10:00');
  await review.getByRole('button', { name: 'Áp dụng thời gian từ ảnh', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({
    resultTiming: { ...first, source: 'IMAGE_CONFIRMED', parts: { ...first.parts, part5: 795, part6: 600 } },
  })]);
});

test('switching session modes preserves an explicitly confirmed thirty-minute total', async ({ page }) => {
  const timing = { ...allNull, totalSeconds: 1800 };
  await mockTiming(page, timing);
  const form = await openForm(page);
  await form.locator('#session-test-name').fill('QA explicit thirty minutes');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await expect(form.getByText(/^Thời gian đã xác nhận từ ảnh: 30:00/)).toBeVisible();
  await form.getByRole('button', { name: 'Bài luyện Part', exact: true }).click();
  await form.getByRole('button', { name: 'Đề Full Test', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({ durationMinutes: 30, resultTiming: { ...timing, source: 'IMAGE_CONFIRMED' } })]);
});

test('long image Part time remains a valid draft and clearing it removes only its derived minute value', async ({ page }) => {
  const timing = { ...allNull, readingSeconds: 19000, parts: { ...allNull.parts, part5: 18000 } };
  await mockTiming(page, timing);
  let form = await openForm(page);
  await form.locator('#session-test-name').fill('QA long elapsed');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await expect(form.getByText(/^Thời gian đã xác nhận từ ảnh/)).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload(); form = await openForm(page);
  await expect(form.locator('#session-test-name')).toHaveValue('QA long elapsed');
  await form.getByRole('button', { name: 'Kiểm tra / sửa thời gian', exact: true }).click();
  const review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await expect(review.getByLabel('Thời gian từ ảnh: Part 5')).toHaveValue('5:00:00');
  await review.getByLabel('Thời gian từ ảnh: Part 5').fill('');
  await review.getByRole('button', { name: 'Áp dụng thời gian từ ảnh', exact: true }).click();
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({ resultTiming: { ...timing, parts: allNull.parts, source: 'IMAGE_CONFIRMED' } })]);
  expect((await saved(page))[0].partDurations).toBeUndefined();
});

test('raw question list survives reload and layout change and cannot be silently ignored', async ({ page }) => {
  let form = await openForm(page);
  await form.locator('#session-test-name').fill('QA pending numbers');
  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 15 22 101-104');
  await page.reload(); form = await openForm(page);
  await expect(form.getByLabel('Số câu sai', { exact: true })).toHaveValue('3 15 22 101-104');
  // A tablet is the narrowest width that keeps this form; phones use the PhoneLogger.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(form.getByLabel('Số câu sai', { exact: true })).toHaveValue('3 15 22 101-104');
  // A list that cannot be read blocks saving; a readable list is applied by saving.
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 15 22 101-104 abc');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect(form.getByRole('alert').filter({ hasText: 'Áp dụng danh sách số câu đang gõ' })).toBeVisible();
  expect(await saved(page)).toHaveLength(0);
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 15 22 101-104');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({ wrongQuestions: [3, 15, 22, 101, 102, 103, 104] })]);
});

test('image timing stays editable, an unreadable edit blocks saving and a readable one is confirmed by saving', async ({ page }) => {
  const timing = { ...allNull, totalSeconds: 6763, readingSeconds: 4500, parts: { ...allNull.parts, part5: 720 } };
  await mockTiming(page, timing);
  const form = await openForm(page);
  await form.locator('#session-test-name').fill('QA image elapsed');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  // Times read from a picture are confirmed on their own.
  await expect(form.getByText('Thời gian đã xác nhận từ ảnh: 1:52:43.')).toBeVisible();
  await form.getByRole('button', { name: 'Kiểm tra / sửa thời gian', exact: true }).click();
  const review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await expect(review.getByLabel('Thời gian từ ảnh: Tổng thời gian')).toHaveValue('1:52:43');
  await review.getByLabel('Thời gian từ ảnh: Part 5').fill('abc');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect(form.getByRole('alert').filter({ hasText: 'áp dụng thời gian từ ảnh' })).toBeVisible();
  expect(await saved(page)).toHaveLength(0);
  await review.getByLabel('Thời gian từ ảnh: Part 5').fill('13:15');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => saved(page)).toEqual([expect.objectContaining({ durationMinutes: 112.72, resultTiming: { ...timing, source: 'IMAGE_CONFIRMED', parts: { ...timing.parts, part5: 795 } }, wrongQuestions: [107] })]);
  await page.reload();
  expect(await saved(page)).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('__timingCalls'))).toBe('1');
});

// Regression: reopening "Kiểm tra / sửa thời gian" on a confirmed timing used to copy its `source` key into the draft's strict timingCandidate schema
// (studyFormDrafts.ts), so the draft failed validation and the edit was lost on reload. timingCandidate() now keeps only the timing fields.
test('an edited, unapplied image timing survives a reload', async ({ page }) => {
  const timing = { ...allNull, totalSeconds: 6763, readingSeconds: 4500, parts: { ...allNull.parts, part5: 720 } };
  await mockTiming(page, timing);
  let form = await openForm(page);
  await form.locator('#session-test-name').fill('QA image elapsed');
  await form.getByLabel('Ảnh kết quả').setInputFiles(image);
  await form.getByRole('button', { name: 'Kiểm tra / sửa thời gian', exact: true }).click();
  let review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await review.getByLabel('Thời gian từ ảnh: Part 5').fill('13:15');
  await page.waitForTimeout(600);
  await page.reload(); form = await openForm(page);
  review = form.getByRole('region', { name: 'Kiểm tra thời gian từ ảnh' });
  await expect(review.getByLabel('Thời gian từ ảnh: Part 5')).toHaveValue('13:15');
});
