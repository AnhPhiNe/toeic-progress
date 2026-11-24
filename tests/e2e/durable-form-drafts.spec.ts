import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { openManualEntry } from './helpers/manualEntry';
import { openGridForm, phoneLogger, phoneManualScore } from './helpers/sessionForm';
import { openManualForm, PHONE_VIEWPORT } from './helpers/mistakeForm';
import { openScoreLogger } from './helpers/nav';
import { answerConfirm } from './helpers/confirmDialog';

async function openResult(page: Page) {
  return openGridForm(page);
}
const draftRecords = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('toeic_form_draft_v1:')).map(key => JSON.parse(localStorage.getItem(key)!)));

test('unfinished result restores name and marks after reload on a computer, then clears only on save', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lich-su');
  let form = await openResult(page);
  await form.locator('#session-test-name').fill('QA durable result');
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  await form.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ scope: 'session:new', value: expect.objectContaining({ testName: 'QA durable result', wrongQuestions: [107] }) }));
  await page.reload(); form = await openResult(page);
  await expect(form.locator('#session-test-name')).toHaveValue('QA durable result');
  await expect(form.getByRole('status').filter({ hasText: /Đã khôi phục bản nháp trên thiết bị này|Đang tiếp tục bản nháp chưa lưu/ })).toBeVisible();
  await expect(form.getByLabel('Số câu sai', { exact: true })).toHaveValue('107');
  await form.getByRole('button', { name: /^Chạm từng câu trên lưới/ }).click();
  await expect(form.getByRole('button', { name: 'Câu 107', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
  await expect.poll(() => draftRecords(page)).toEqual([]);
  await page.reload(); form = await openResult(page);
  await expect(form.locator('#session-test-name')).not.toHaveValue('QA durable result');
});

test('unfinished phone result restores its name and marks after reload, then clears only on save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const dialog = phoneLogger(page);
  await phoneManualScore(page, 'QA durable result');
  await dialog.getByRole('button', { name: /^Câu sai/ }).click();
  await dialog.getByRole('button', { name: /^Part 5/ }).click();
  await dialog.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ scope: expect.stringMatching(/^session:/), value: expect.objectContaining({ testName: 'QA durable result', wrongQuestions: [107] }) }));
  await page.reload();
  await openScoreLogger(page);
  await expect(dialog.getByRole('heading', { name: 'QA durable result', exact: true })).toBeVisible();
  await expect(dialog.getByText('1 câu đã chọn', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Lưu điểm/ }).click();
  await expect.poll(() => draftRecords(page)).toEqual([]);
  await page.reload();
  await openScoreLogger(page);
  await expect(phoneLogger(page).getByRole('heading', { name: 'Ghi điểm đề', exact: true })).toBeVisible();
});

test('manual question restores typed text, choice and passage after reload, and clears on save', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto('/so-tay');
  let form = await openManualForm(page);
  await form.getByRole('button', { name: 'Part 7', exact: true }).click();
  await form.getByLabel('Đề', { exact: true }).fill('QA durable note');
  const question = 'Reports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been';
  await form.getByLabel('Câu hỏi và các phương án').fill(question);
  await form.getByLabel('Đoạn văn').fill('Memo: All reports are due Friday.');
  await form.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await form.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.reload();
  form = await openManualForm(page);
  await expect(form.getByLabel('Câu hỏi và các phương án')).toHaveValue(question);
  await expect(form.getByLabel('Đoạn văn')).toHaveValue('Memo: All reports are due Friday.');
  await expect(form.getByRole('button', { name: 'Mình chọn: A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect.poll(() => draftRecords(page)).toEqual([]);
});

test('a failed result save retains its durable draft and a later successful retry clears it', async ({ page }) => {
  await page.goto('/lich-su');
  let form = await openResult(page);
  await form.locator('#session-test-name').fill('QA failed draft save');
  await openManualEntry(page, form);
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

test('clearing a manual question updates the stored draft instead of resurrecting old text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/so-tay');
  const form = await openManualForm(page);
  await form.getByLabel('Câu hỏi và các phương án').fill('This text will be cleared.');
  await expect.poll(() => draftRecords(page)).toContainEqual(expect.objectContaining({ value: expect.objectContaining({ raw: 'This text will be cleared.' }) }));
  await form.getByLabel('Câu hỏi và các phương án').fill('');
  await page.reload();
  const reopened = await openManualForm(page);
  await expect(reopened.getByLabel('Câu hỏi và các phương án')).toHaveValue('');
});

test('pending score corrections survive reload and explicit discard stays cleared on pagehide', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return {provider:'openai',resultImages:true}; }
    export async function getAIUsage() { return null; }
    export async function readResultsWithAI() { return {wrong:[107],skipped:[],scores:{listening:375,reading:370,total:800},usage:{}}; }
    export async function extractMistakeWithAI() { throw new Error('unused'); }
    export async function extractPageWithAI() { throw new Error('unused'); }
  ` }));
  await page.goto('/lich-su');
  let form = await openResult(page);
  await form.locator('#session-test-name').fill('QA pending score draft');
  await form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  let review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await review.getByLabel('Điểm từ ảnh: Listening').fill('400');
  await review.getByLabel('Điểm từ ảnh: Reading').fill('345');
  await page.reload(); form = await openResult(page);
  review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('400');
  await expect(review.getByLabel('Điểm từ ảnh: Reading')).toHaveValue('345');
  await review.getByLabel('Điểm từ ảnh: Reading').fill('350');
  await page.keyboard.press('Escape');
  await form.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(JSON.stringify(await draftRecords(page))).not.toContain('QA pending score draft');
  expect(JSON.stringify(await draftRecords(page))).not.toContain('"sourceScoreDraft":{');
  await page.reload(); form = await openResult(page);
  await expect(form.locator('#session-test-name')).not.toHaveValue('QA pending score draft');
  await expect(page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' })).toHaveCount(0);
});
