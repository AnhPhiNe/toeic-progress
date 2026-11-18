import { expect, test } from '@playwright/test';
import { openDesktopFlow, openPendingList, screenshot } from './helpers/detailAI';

const reason = (flow: import('@playwright/test').Locator, number: number, label: string) =>
  flow.getByRole('group', { name: `Vì sao sai câu ${number}` }).getByRole('button', { name: label, exact: true });

test('read questions and learner corrections survive reload without another AI request', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 1 ảnh', exact: true }).click();
  await expect(flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, đáp án A', exact: true })).toBeVisible();
  await reason(flow, 104, 'Hết giờ').click();
  await flow.getByRole('group', { name: /^Câu 104:/ }).getByRole('button', { name: 'Đáp án đúng D' }).click();
  await page.reload();
  await openPendingList(page);
  // The overview names the unsaved rows; they open as they were.
  await expect(flow.getByText('Còn 2 câu nháp chưa lưu')).toBeVisible();
  await flow.getByRole('button', { name: 'Xem', exact: true }).click();
  await expect(flow.getByRole('group', { name: 'Câu 104: Bạn chọn C, đáp án D', exact: true })).toBeVisible();
  await expect(reason(flow, 104, 'Hết giờ')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? [])).toEqual([]);
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect(flow.getByRole('img', { name: 'Đã ghi 2 trên 4 câu', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('toeic_form_draft_v1:') && decodeURIComponent(key).includes('detail-list:')))).toEqual([]);
});

test('closing keeps a chosen reason as a draft; discarding it keeps notebook cards unchanged', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await reason(flow, 3, 'Hết giờ').click();
  await expect(flow.getByText('Đã tự lưu nháp trên máy này.')).toBeVisible();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await page.reload();
  await openPendingList(page);
  await expect(flow.getByText('Còn 1 câu nháp chưa lưu')).toBeVisible();
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await expect(reason(flow, 3, 'Hết giờ')).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByText('Đã khôi phục nháp trên máy này.')).toBeVisible();
  await flow.getByRole('button', { name: 'Quay lại', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await flow.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await expect(flow.getByText(/câu nháp chưa lưu/)).toHaveCount(0);
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await expect(reason(flow, 3, 'Hết giờ')).toHaveAttribute('aria-pressed', 'false');
  await expect(flow.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Table').length)).toBe(3);
});

test('a quota failure on the close click keeps the flow open when losing the draft is declined', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('toeic_form_draft_v1:')) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await reason(flow, 3, 'Hết giờ').click();
  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('Chưa tự lưu được nháp');
    void dialog.dismiss();
  });
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toBeVisible();
  await expect(reason(flow, 3, 'Hết giờ')).toHaveAttribute('aria-pressed', 'true');
});
