import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { chooseNoteSource } from './helpers/noteSource';

async function openResult(page: Page, phone = false) {
  if (phone) {
    await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  } else await page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true }).click();
  return page.getByRole('dialog', { name: /^(Ghi điểm|Nhập kết quả học tập)$/ });
}
const draftRecords = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('toeic_form_draft_v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));

for (const width of [390, 1280]) {
  test(`unfinished result restores name and marks after reload at ${width}px, then clears only on save`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/lich-su');
    await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true')); await page.reload();
    let form = await openResult(page, width < 768);
    await form.locator('#session-test-name').fill('QA durable result');
    if (width < 768) await form.getByRole('button', { name: 'Part 5', exact: true }).click();
    await form.getByRole('button', { name: 'Câu 107', exact: true }).click();
    await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ scope: 'session:new', value: expect.objectContaining({ testName: 'QA durable result', wrongQuestions: [107] }) }));
    await page.reload(); form = await openResult(page, width < 768);
    await expect(form.locator('#session-test-name')).toHaveValue('QA durable result');
    await expect(form.getByText('Đã khôi phục bản nháp trên thiết bị này.', { exact: true })).toBeVisible();
    if (width < 768) await form.getByRole('button', { name: 'Part 5, 1 câu sai', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Câu 107', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
    await expect.poll(() => draftRecords(page)).toEqual([]);
    await page.reload(); form = await openResult(page, width < 768);
    await expect(form.locator('#session-test-name')).not.toHaveValue('QA durable result');
  });
}

test('a note restores typed question, reason and choice without calling AI, and explicit discard removes its draft', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  let form = page.getByRole('dialog');
  await chooseNoteSource(form, 'QA durable note');
  await form.getByRole('button', { name: 'Part 5', exact: true }).click();
  const question = 'Reports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been';
  await form.getByLabel('Câu hỏi + phương án').fill(question);
  await form.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await form.locator('#mistake-reason').fill('I forgot the passive voice.');
  await form.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click(); form = page.getByRole('dialog');
  await expect(form.getByLabel('Câu hỏi + phương án')).toHaveValue(question);
  await expect(form.locator('#mistake-reason')).toHaveValue('I forgot the passive voice.');
  await expect(form.getByRole('button', { name: 'Bạn chọn A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  page.once('dialog', dialog => dialog.accept()); await form.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await expect.poll(() => draftRecords(page)).toEqual([]);
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  await expect(page.getByLabel('Câu hỏi + phương án')).toHaveValue('');
});

test('a failed result save retains its durable draft and a later successful retry clears it', async ({ page }) => {
  await page.goto('/lich-su'); await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true')); await page.reload();
  let form = await openResult(page);
  await form.locator('#session-test-name').fill('QA failed draft save');
  await form.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect(form).toBeVisible();
  await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ value: expect.objectContaining({ testName: 'QA failed draft save', wrongQuestions: [107] }) }));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toEqual([]);
  await page.reload(); form = await openResult(page);
  await expect(form.locator('#session-test-name')).toHaveValue('QA failed draft save');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => draftRecords(page)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.filter((session: { testName: string }) => session.testName === 'QA failed draft save'))).toHaveLength(1);
});

test('clearing a question updates the stored draft instead of resurrecting old text', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  await page.getByLabel('Câu hỏi + phương án').fill('This text will be cleared.');
  await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ value: expect.objectContaining({ raw: 'This text will be cleared.' }) }));
  await page.getByLabel('Câu hỏi + phương án').fill('');
  await page.reload(); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  await expect(page.getByLabel('Câu hỏi + phương án')).toHaveValue('');
});

test('read batch items survive reload without retaining tickets or repeating the paid extraction', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return {provider:'openai', structuredInput:true, pageImages:true}; }
    export async function getAIUsage() { return null; }
    export async function extractPageWithAI() {
      localStorage.setItem('__qaDraftCalls', String(Number(localStorage.getItem('__qaDraftCalls') || 0) + 1));
      return {usage:{}, explainTicket:'temporary-ticket', items:[{number:107, draft:{part:5,category:'OTHER',question:'Reports ____ ready.',context:'',questionContext:'Reports ____ ready.',
        options:['(A) are','(B) is'],correctAnswer:'(A) are',answerSource:'PROVIDED',userChoice:'B',userChoiceState:'CHOSEN',userMistake:'',trapTip:'',tags:[],missingInformation:[],optionNotes:[],explanation:null}}]};
    }
    export async function explainBatchWithAI() { throw new Error('Restored ticket must not be reused.'); }
    export async function extractMistakeWithAI() { throw new Error('unused'); }
  ` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  let form = page.getByRole('dialog'); await form.getByRole('tab', { name: /Quét ảnh AI/ }).click(); await chooseNoteSource(form, 'QA durable batch');
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  await expect(form.getByText('Đã quét được 1 câu:', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click(); form = page.getByRole('dialog');
  await expect(form.getByRole('tab', { name: /Quét ảnh AI/ })).toHaveAttribute('aria-selected', 'true');
  await expect(form.getByText('Đã quét được 1 câu:', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('__qaDraftCalls'))).toBe('1');
  expect(JSON.stringify(await draftRecords(page))).not.toContain('temporary-ticket');
  expect(JSON.stringify(await draftRecords(page))).not.toContain('data:image');
});

test('a restored draft asks for missing local images before making another AI request', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return {provider:'openai',structuredInput:true,part7Images:true}; }
    export async function getAIUsage() { return null; }
    export async function extractMistakeWithAI() { localStorage.setItem('__unexpectedPaidCall','true'); throw new Error('Unexpected request'); }
    export async function extractPageWithAI() { throw new Error('unused'); }
  ` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  let form = page.getByRole('dialog'); await chooseNoteSource(form, 'QA missing draft image');
  await form.getByRole('button', { name: 'Part 7', exact: true }).click();
  await form.getByLabel('Câu hỏi + phương án').fill('Where is the workshop?\n(A) Main hall\n(B) Library\n(C) Cafeteria\n(D) Outside');
  await form.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await form.getByLabel('Chọn ảnh Part 7', { exact: true }).setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  await expect(form.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Chọn lại ảnh ngữ cảnh của bản nháp');
  expect(await page.evaluate(() => localStorage.getItem('__unexpectedPaidCall'))).toBeNull();
  expect(JSON.stringify(await draftRecords(page))).not.toContain('data:image');
});

test('pending score corrections survive reload and explicit discard stays cleared on pagehide', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return {provider:'openai',resultImages:true}; }
    export async function getAIUsage() { return null; }
    export async function readResultsWithAI() { return {wrong:[107],skipped:[],scores:{listening:375,reading:370,total:745},usage:{}}; }
    export async function extractMistakeWithAI() { throw new Error('unused'); }
    export async function extractPageWithAI() { throw new Error('unused'); }
  ` }));
  await page.goto('/lich-su'); await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true')); await page.reload();
  let form = await openResult(page);
  await form.locator('#session-test-name').fill('QA pending score draft');
  await form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  let review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByLabel('Điểm từ ảnh: Listening').fill('400');
  await review.getByLabel('Điểm từ ảnh: Reading').fill('345');
  await page.reload(); form = await openResult(page);
  review = form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('400');
  await expect(review.getByLabel('Điểm từ ảnh: Reading')).toHaveValue('345');
  // Change only the child-owned mutable score draft before discarding the whole form.
  await review.getByLabel('Điểm từ ảnh: Reading').fill('350');
  page.once('dialog', dialog => dialog.accept()); await form.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await draftRecords(page)).toEqual([]);
  await page.reload(); form = await openResult(page);
  await expect(form.locator('#session-test-name')).not.toHaveValue('QA pending score draft');
  await expect(form.getByRole('region', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
});
