import { test, expect, type Page } from '@playwright/test';
import { choosePractice, sessionDialog, useOfficialScore } from './helpers/sessionForm';

async function openSession(page: Page, practice = false) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
      export async function extractMistakeWithAI() { throw new Error('This flow must not call AI automatically'); }
    `
  }));
  await page.goto('/lich-su');
  // Phones record through the bottom bar's "+" sheet; the top-bar button is for tablet and desktop.
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  } else {
    await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N' }).click();
  }
  const modal = sessionDialog(page);
  if (practice) await choosePractice(modal);
  await modal.getByLabel('Tên Đề Thi / Nguồn').fill(practice ? 'ETS Practice' : 'ETS Handoff');
  if (!practice) {
    await useOfficialScore(modal);
    await modal.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
    await modal.getByLabel('Tổng điểm TOEIC /990').fill('800');
  }
  return modal;
}

for (const practice of [false, true]) test(`saving ${practice ? 'practice' : 'full test'} opens the shared notebook with one saved result and a linked source`, async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const sessionModal = await openSession(page, practice);
  await expect(sessionModal.getByText(/Ghi Nhanh Lỗi Sai Vào Sổ Tay/)).toHaveCount(0);
  await expect(sessionModal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true })).toBeInViewport();
  await expect(sessionModal.getByRole('button', { name: 'Lưu kết quả', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('save-result-actions-mobile.png') });
  await sessionModal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  const note = page.getByRole('dialog', { name: 'Thêm lỗi sai', exact: true });
  await expect(note).toBeVisible();
  await expect(sessionModal).toHaveCount(0);
  const source = practice ? 'ETS Practice' : 'ETS Handoff';
  await expect(note.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText(source);
  await expect(note.getByLabel('Part', { exact: true })).toHaveValue('');
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ testName: source, sessionType: practice ? 'PART_PRACTICE' : 'FULL_TEST' });
  await note.getByLabel('Part', { exact: true }).selectOption('5');
  await note.getByLabel('Câu hỏi + phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await note.getByText('Đáp án đúng từ đề', { exact: false }).click();
  await note.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await note.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await note.getByRole('button', { name: 'Thêm lỗi tiếp', exact: true }).click();
  await expect(note.getByLabel('Câu hỏi + phương án')).toBeFocused();
  await note.getByLabel('Câu hỏi + phương án').fill('Forms should ____ submitted.\n(A) are\n(B) be');
  await note.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await note.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  let mistakes = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(mistakes).toHaveLength(2);
  for (const card of mistakes) expect(card).toMatchObject({ sessionId: sessions[0].id, sourceTestName: source, part: 5 });
  // A later standalone note must not silently inherit the saved session link.
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  await note.getByLabel('Part', { exact: true }).selectOption('5');
  await note.getByLabel('Câu hỏi + phương án').fill('Another form should ____ submitted.\n(A) are\n(B) be');
  await note.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  mistakes = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(mistakes).toHaveLength(3);
  expect(mistakes[0].sessionId).toBeUndefined();
});

test('invalid input and a failed save retain the result form; retry opens the notebook only after persistence', async ({ page }) => {
  const modal = await openSession(page);
  await modal.getByLabel('Tổng điểm TOEIC /990').fill('995');
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(0);
  await modal.getByLabel('Tổng điểm TOEIC /990').fill('800');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { restoreHandoffWrites?: () => void }).restoreHandoffWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Test save failed', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
  await expect(page.getByRole('dialog', { name: 'Thêm lỗi sai', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as Window & { restoreHandoffWrites?: () => void }).restoreHandoffWrites?.());
  await modal.getByRole('button', { name: 'Lưu & thêm câu sai', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Thêm lỗi sai', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(1);
});

test('Enter saves the result without opening notes and the header opens account settings', async ({ page }, info) => {
  const modal = await openSession(page);
  await modal.getByLabel('Tổng điểm TOEIC /990').press('Enter');
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Thêm lỗi sai', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions)).toHaveLength(1);
  const indicator = page.getByRole('status', { name: 'Trạng thái đồng bộ' });
  await expect(indicator).toHaveText('Chỉ lưu trên máy');
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(indicator).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`sync-header-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Tài khoản và đồng bộ: Chỉ lưu trên máy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tài khoản và đồng bộ', exact: true })).toBeVisible();
});
