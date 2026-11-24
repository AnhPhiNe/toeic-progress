import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockResultsAI } from './helpers/resultsAI';
import { chooseMore, openManualEntry } from './helpers/manualEntry';
import { openScoreLogger } from './helpers/nav';

test('a computer logs a Full Test by clicking, typing and pasting its wrong questions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockResultsAI(page);
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await openManualEntry(page, form);
  await form.locator('#session-test-name').fill('ETS Desktop');
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();

  // All 200 questions fit on one screen without scrolling the form.
  await expect(form.getByRole('button', { name: 'Câu 200', exact: true })).toBeInViewport();
  await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await expect(form.locator('[aria-live="polite"]').first()).toContainText('1 câu sai');

  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await expect(form.getByLabel('Số câu sai')).toHaveValue('3');
  await form.getByLabel('Số câu sai').fill('3 101-103 abc');
  await form.getByLabel('Số câu sai').press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Không đọc được: abc');
  await form.getByLabel('Số câu sai').fill('3 101-103');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Câu 102', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Ctrl+V of a result screenshot anywhere in the form adds the questions AI read.
  const png = readFileSync(resolve('tests/fixtures/part7-notice.png')).toString('base64');
  await page.evaluate(async data => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'result.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
  }, png);
  await expect(form.getByRole('status').filter({ hasText: 'AI đã tô' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Câu 117', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(form.locator('[aria-live="polite"]').first()).toContainText('9 câu sai');

  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions
    .find((item: { testName: string }) => item.testName === 'ETS Desktop'));
  expect(session.wrongQuestions).toEqual([3, 101, 102, 103, 107, 113, 115, 117, 128]);
  expect(session.partScores).toMatchObject({ part1: 5, part5: 22 });

  // The form closes on the result screen, which offers to fill in the Reading questions; the notebook keeps them as one row.
  await expect(form).toHaveCount(0);
  const result = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Đóng kết quả', exact: true }) });
  await expect(result.getByText('8 câu Đọc sai đã vào Sổ tay. Chụp trang chữa bài để Sóc ghi nội dung giúp.', { exact: true })).toBeVisible();
  await result.getByRole('button', { name: 'Ghi chi tiết 8 câu sai', exact: true }).click();
  const flow = page.getByRole('dialog', { name: 'Gỡ câu sai · ETS Desktop', exact: true });
  await expect(flow).toBeVisible();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  // The eight number-only drafts wait in one pink row instead of the list.
  await expect(page.getByRole('button', { name: '8 câu chờ ghi chi tiết, ETS Desktop. Gỡ câu sai', exact: true })).toBeVisible();
  await expect(page.locator('.nb-rows li')).toHaveCount(0);
});

test('a computer can still log per-Part counts or an official score', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await openManualEntry(page, form);
  await form.getByRole('button', { name: 'Câu 5', exact: true }).click();
  await chooseMore(form, 'Số câu đúng mỗi Part');
  // The marks carry over as counts.
  await expect(form.getByLabel('Số câu đúng Part 1', { exact: true })).toHaveValue('5');
  await form.getByRole('button', { name: 'Đánh dấu câu sai', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Câu 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await chooseMore(form, 'Điểm chính thức');
  await expect(form.getByLabel('Điểm Nghe /495')).toBeVisible();
});
