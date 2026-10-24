import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { chooseNoteSource } from './helpers/noteSource';

const screenshot = resolve('tests/fixtures/part7-notice.png');
const result = (number: number) => ({ number, draft: {
  part: 5, category: 'OTHER', question: `Reports ${number} ____ ready.`, context: '', questionContext: `Reports ${number} ____ ready.`,
  options: ['(A) are', '(B) is'], correctAnswer: '(A) are', answerSource: 'PROVIDED', userChoice: 'B', userChoiceState: 'CHOSEN',
  userMistake: '', trapTip: '', tags: [], missingInformation: [], optionNotes: [], explanation: null
} });

async function openBatch(page: Page, delayed = false, oversized = false) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractPageWithAI(questions, images) {
        window.__batchCalls = (window.__batchCalls || 0) + 1;
        if (${delayed} && window.__batchCalls === 1) await new Promise(resolve => { window.__releaseBatch = resolve; });
        const items = window.__batchCalls > 1 && questions.length === 1 && questions[0].number === 103
          ? ${JSON.stringify([result(103)])} : ${JSON.stringify([result(101), result(102)])};
        if (${oversized}) { items[1].draft.context = 'ễ'.repeat(8000); items[1].draft.questionContext += items[1].draft.context; }
        return { items, missing: questions.map(item => item.number).filter(number => !items.some(item => item.number === number)), usage: {} };
      }
      export async function explainBatchWithAI() { window.__batchExplainCalls = (window.__batchExplainCalls || 0) + 1; return { items: [], failed: [] }; }
      export async function extractMistakeWithAI() { throw new Error('unused'); }
    `
  }));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('tab', { name: /Quét ảnh AI/ }).click();
  await chooseNoteSource(form, 'ETS Batch');
  return form;
}

async function count(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length);
}

test('switching mode discards an in-flight read and never starts its next image chunk', async ({ page }) => {
  const form = await openBatch(page, true);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
  await page.waitForFunction(() => (window as typeof window & { __batchCalls?: number }).__batchCalls === 1);
  await form.getByRole('tab', { name: 'Nhập tay', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { __releaseBatch?: () => void }).__releaseBatch?.());
  await form.getByRole('tab', { name: /Quét ảnh AI/ }).click();
  await expect(form.getByText('Đã quét được 2 câu:', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __batchCalls?: number }).__batchCalls)).toBe(1);
  expect(await count(page)).toBe(0);
});

test('closing the modal discards a late read and stops the remaining image chunk', async ({ page }) => {
  const form = await openBatch(page, true);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
  await page.waitForFunction(() => (window as typeof window & { __batchCalls?: number }).__batchCalls === 1);
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { __releaseBatch?: () => void }).__releaseBatch?.());
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  await page.getByRole('dialog').getByRole('tab', { name: /Quét ảnh AI/ }).click();
  await expect(page.getByText('Đã quét được 2 câu:', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __batchCalls?: number }).__batchCalls)).toBe(1);
  expect(await count(page)).toBe(0);
});

test('a changed owner drops a pending response before its next chunk and cannot save old screenshots', async ({ page }) => {
  const form = await openBatch(page, true);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
  await page.waitForFunction(() => (window as typeof window & { __batchCalls?: number }).__batchCalls === 1);
  await page.evaluate(() => {
    localStorage.setItem('toeic_active_account_v1', 'changed-test-owner');
    (window as typeof window & { __releaseBatch?: () => void }).__releaseBatch?.();
  });
  await expect(form.getByText(/Đang quét ảnh/)).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __batchCalls?: number }).__batchCalls)).toBe(1);
  await expect(form.getByRole('button', { name: 'Lưu câu sai', exact: true })).toBeDisabled();
  await page.evaluate(() => localStorage.removeItem('toeic_active_account_v1'));
  expect(await count(page)).toBe(0);
});

test('requested missing questions are explicit and an oversized later card leaves the whole batch unsaved', async ({ page }) => {
  const form = await openBatch(page, false, true);
  await form.getByLabel('Số câu sai').fill('101-103');
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(screenshot);
  await expect(form.getByText('Đã đọc 2/3 câu.', { exact: false })).toBeVisible();
  await expect(form.getByText(/Chưa đọc được câu: 103/)).toBeVisible();
  await form.getByRole('button', { name: 'Lưu 2 câu sai', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('32 KiB');
  expect(await count(page)).toBe(0);
  await expect(form.getByText('Đã quét được 2 câu:', { exact: true })).toBeVisible();
});

test('one storage failure preserves both drafts and a retry writes each card exactly once', async ({ page }) => {
  const form = await openBatch(page);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(screenshot);
  await expect(form.getByText('Đã quét được 2 câu:', { exact: true })).toBeVisible();
  await expect(form.getByText(/Chưa đọc được câu:/)).toHaveCount(0);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { __restoreBatchWrites?: () => void }).__restoreBatchWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await form.getByRole('button', { name: 'Lưu 2 câu sai', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  expect(await count(page)).toBe(0);
  await page.evaluate(() => (window as typeof window & { __restoreBatchWrites?: () => void }).__restoreBatchWrites?.());
  await form.getByRole('button', { name: 'Lưu 2 câu sai', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await count(page)).toBe(2);
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((card: { id: string }) => card.id));
  expect(new Set(ids).size).toBe(2);
});

test('batch questions and options can be inspected before saving on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const form = await openBatch(page);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(screenshot);
  await form.getByText('Xem nội dung câu 101', { exact: true }).click();
  const details = form.locator('details').filter({ has: page.getByText('Xem nội dung câu 101', { exact: true }) });
  await expect(details.getByText('Reports 101 ____ ready.', { exact: true })).toBeVisible();
  await expect(details.getByText('(A) are', { exact: true })).toBeVisible();
  await expect(details.getByText('(B) is', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await count(page)).toBe(0);
});


test('a targeted follow-up counts only its requested question and separately shows the accumulated batch', async ({ page }) => {
  const form = await openBatch(page);
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(screenshot);
  await expect(form.getByText('Đã quét được 2 câu:', { exact: true })).toBeVisible();
  await form.getByLabel('Số câu sai').fill('103');
  await form.getByLabel('Ảnh màn hình câu sai').setInputFiles(screenshot);
  await expect(form.getByText('Đã đọc 1/1 câu.', { exact: false })).toBeVisible();
  await expect(form.getByText('Tổng danh sách đang có 3 câu.', { exact: true })).toBeVisible();
  await expect(form.getByText('Đã đọc đủ các câu yêu cầu.', { exact: true })).toBeVisible();
  await expect(form.getByText(/Chưa đọc được câu:/)).toHaveCount(0);
  await expect(form.getByText('Đã quét được 3 câu:', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __batchCalls?: number }).__batchCalls)).toBe(2);
  expect(await count(page)).toBe(0);
});
