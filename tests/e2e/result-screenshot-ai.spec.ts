import { expect, test } from '@playwright/test';
import { mockResultsAI } from './helpers/resultsAI';
import { resolve } from 'node:path';
import { openGridForm } from './helpers/sessionForm';

test('a result screenshot marks wrong and skipped questions on the grid for the learner to check', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await mockResultsAI(page);
  await page.goto('/lich-su');
  const form = await openGridForm(page);
  await form.locator('#session-test-name').fill('ETS Results');
  await form.getByRole('heading', { name: 'Ghi điểm' }).click();
  await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  await expect(form.getByRole('status').filter({ hasText: 'AI đã tô' })).toHaveText('AI đã tô 5 câu (2 câu bỏ trống). Kiểm tra lại trên lưới.');
  expect(await page.evaluate(() => (window as Window & { __resultImages: number }).__resultImages)).toBe(1);
  // The computer grid shows every Part at once and keeps the earlier tap on question 3.
  await expect(form.getByRole('button', { name: 'Câu 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByRole('button', { name: 'Câu 117', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: 'Câu 128', exact: true }).click();
  await expect(form.locator('[aria-live="polite"]').first()).toContainText('5 câu sai');
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions
    .find((item: { testName: string }) => item.testName === 'ETS Results'));
  expect(session.wrongQuestions).toEqual([3, 107, 113, 115, 117]);
});
