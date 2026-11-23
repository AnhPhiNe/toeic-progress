import { expect, test, type Page } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';
import { phoneLogger, pickPhoneTestName } from './helpers/sessionForm';

// Phone Ghi điểm after Sóc read the result photo: a compact result card, one line, the grid only behind "Sửa".
async function openReadState(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', resultImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI() { throw new Error('not used'); }
      export async function readResultsWithAI() { return { wrong: [107, 113, 115], skipped: [117, 128], scores: { listening: 495, reading: 455, total: 950 }, usage: {} }; }`
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await openScoreLogger(page);
  const dialog = phoneLogger(page);
  await pickPhoneTestName(page, 'ETS Read');
  await dialog.getByLabel('Chụp màn kết quả').setInputFiles('tests/fixtures/part7-notice.png');
  return dialog;
}

test('phone read state shows one result card, one line from Sóc and one save button', async ({ page }) => {
  const dialog = await openReadState(page);
  const card = dialog.getByRole('region', { name: 'Kết quả Sóc đọc' });
  await expect(card).toContainText('950');
  await expect(card).toContainText('Nghe 495 · Đọc 455');
  await expect(card).toContainText('Sai 5 câu');
  for (const number of [107, 113, 115, 117, 128]) await expect(card.getByText(String(number), { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status').filter({ hasText: 'Sóc đã đọc ảnh — kiểm tra lại nhé' })).toBeVisible();
  for (const gone of [/Phiếu tô giấy/, /Chụp phiếu giấy liên tiếp/, /Dán ảnh kết quả/, /Nhập điểm từ đề/, /^Part 5/, 'Câu 107']) {
    await expect(dialog.getByRole('button', { name: gone })).toHaveCount(0);
  }
  await expect(dialog.getByText(/Chụp rõ điểm/)).toHaveCount(0);
  await expect(dialog.getByText(/AI đã tô/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Lưu điểm 950', exact: true })).toBeVisible();
});

test('phone read state: "Sửa" opens the grid in a sheet and "Cách khác" holds the other photo options', async ({ page }) => {
  const dialog = await openReadState(page);
  const card = dialog.getByRole('region', { name: 'Kết quả Sóc đọc' });
  await card.getByRole('button', { name: 'Sửa', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Sửa câu sai', exact: true });
  await sheet.getByRole('button', { name: /^Part 5/ }).click();
  await sheet.getByRole('button', { name: 'Câu 113', exact: true }).click();
  await sheet.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(card).toContainText('Sai 4 câu');

  await dialog.getByRole('button', { name: /^Cách khác/ }).click();
  const more = page.getByRole('dialog', { name: 'Cách khác', exact: true });
  for (const name of [/^Dán ảnh kết quả/, /^Phiếu tô giấy/, /^Chụp phiếu giấy liên tiếp/]) await expect(more.getByRole('button', { name }).first()).toBeVisible();
  await expect(more.getByText('Điểm từ đề thi')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Lưu điểm 950', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.at(-1));
  expect(saved).toMatchObject({ testName: 'ETS Read', totalScore: 950, wrongQuestions: [107, 115, 117, 128] });
});
