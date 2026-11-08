import { expect, test, type Page } from '@playwright/test';
import { openManualEntry } from './helpers/manualEntry';
import { resolve } from 'node:path';

async function delayedResults(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { resultImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI() { throw new Error('not used'); }
      export async function readResultsWithAI() {
        window.__resultsCalls = (window.__resultsCalls || 0) + 1;
        return new Promise(resolve => { window.__finishResults = () => resolve({ wrong: [3, 4], skipped: [5], usage: {} }); });
      }`
  }));
}

async function openForm(page: Page, navigate = true) {
  if (navigate) {
    await page.goto('/lich-su');
    await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
    await page.reload();
  }
  const desktopEntry = page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true });
  if (await desktopEntry.isVisible()) await desktopEntry.click();
  else {
    await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  }
  const form = page.getByRole('dialog', { name: /^(Ghi điểm|Nhập kết quả học tập)$/ });
  await openManualEntry(page, form);
  return form;
}

async function finish(page: Page) {
  await page.evaluate(() => (window as Window & { __finishResults: () => void }).__finishResults());
}

for (const width of [390, 1280]) {
  test(`result reading preserves additions and explicit clears made while waiting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await delayedResults(page);
    const form = await openForm(page);
    await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
    await form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
    await expect(form.getByRole('button', { name: /^(AI đang đọc ảnh…|Đang đọc…)/ })).toBeVisible();
    await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
    await form.getByRole('button', { name: 'Câu 6', exact: true }).click();
    await finish(page);
    await expect(form.getByRole('status').filter({ hasText: 'AI đã tô' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Câu 3', exact: true })).toHaveAttribute('aria-pressed', 'false');
    for (const number of [4, 5, 6]) await expect(form.getByRole('button', { name: `Câu ${number}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => (window as Window & { __resultsCalls: number }).__resultsCalls)).toBe(1);
  });
}

test('a result response after closing cannot populate the next form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await delayedResults(page);
  let form = await openForm(page);
  await form.getByLabel('Ảnh kết quả').setInputFiles(resolve('tests/fixtures/part7-notice.png'));
  await expect(form.getByRole('button', { name: /^AI đang đọc ảnh…/ })).toBeVisible();
  await form.getByRole('button', { name: 'Đóng form ghi nhận buổi học', exact: true }).click();
  await expect(form).not.toBeVisible();
  form = await openForm(page, false);
  await finish(page);
  await expect(form.getByRole('button', { name: 'Câu 3', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(form.getByRole('button', { name: 'Câu 4', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(form.getByRole('status').filter({ hasText: 'AI đã tô' })).toHaveCount(0);
});
