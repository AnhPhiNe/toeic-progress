import { expect, test, type Locator, type Page } from '@playwright/test';
import { captureMore } from './helpers/wrongDetail';
import { openDesktopFlow, openPendingList, screenshot, skipListening } from './helpers/detailAI';
import { answerConfirm } from './helpers/confirmDialog';

const reason = (flow: Locator, number: number, label: string) =>
  flow.getByRole('group', { name: `Vì sao sai câu ${number}` }).getByRole('button', { name: label, exact: true });

/** Reads Part 5 (104, 112) and opens Soát. */
async function readPart5(page: Page) {
  const flow = await openDesktopFlow(page);
  await skipListening(flow);
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ }).click();
  await flow.getByRole('button', { name: 'Soát 2 câu', exact: true }).click();
  return flow;
}

test('read questions and learner corrections survive reload without another AI request', async ({ page }) => {
  const flow = await readPart5(page);
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án', exact: true }).getByRole('button', { name: 'D', exact: true }).click();
  await reason(flow, 104, 'Hết giờ').click();
  await page.reload();
  await openPendingList(page);
  // The unsaved rows wait for Soát; they open as they were.
  await flow.getByRole('button', { name: 'Soát 2 câu', exact: true }).click();
  await expect(flow.getByRole('heading', { name: '2 câu sai đã sẵn sàng thành thẻ', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await expect(reason(flow, 104, 'Hết giờ')).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByRole('button', { name: 'Mở câu 104', exact: true })).toContainText(/C\s*D/);
  expect(await page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? [])).toEqual([]);
  await flow.getByRole('button', { name: 'Lưu tất cả (2)', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Tấm 1 · câu 104–112, xong', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('toeic_form_draft_v1:') && decodeURIComponent(key).includes('detail-list:')))).toEqual([]);
});

test('closing keeps read rows as a draft; discarding them keeps notebook cards unchanged', async ({ page }) => {
  const flow = await readPart5(page);
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await reason(flow, 104, 'Hết giờ').click();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await page.reload();
  await openPendingList(page);
  await flow.getByRole('button', { name: 'Soát 2 câu', exact: true }).click();
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await expect(reason(flow, 104, 'Hết giờ')).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await answerConfirm(page, true);
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Soát/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string; question?: string }) => card.sourceTestName === 'ETS Table' && card.question).length)).toBe(0);
});

test('a quota failure on the close click keeps the flow open when losing the draft is declined', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await skipListening(flow);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('toeic_form_draft_v1:')) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await captureMore(flow, 'Ghi tay câu này');
  const card = flow.getByRole('group', { name: 'Ghi tay một câu' });
  await card.getByRole('group', { name: 'Vì sao sai câu 104' }).getByRole('button', { name: 'Hết giờ', exact: true }).click();
  await card.getByRole('button', { name: 'Đóng ghi tay', exact: true }).click();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await answerConfirm(page, false, 'Chưa lưu được nháp');
  await expect(flow).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Soát 1 câu', exact: true })).toBeVisible();
});
