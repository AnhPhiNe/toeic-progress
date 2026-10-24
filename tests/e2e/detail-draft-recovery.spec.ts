import { expect, test } from '@playwright/test';
import { openDesktopFlow, screenshot } from './helpers/detailAI';

test('read questions and learner corrections survive reload without another AI request', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, đáp án A', exact: true })).toBeVisible();
  await flow.getByLabel('Vì sao sai câu 104').selectOption('TIME_PRESSURE');
  await flow.getByRole('button', { name: /^Câu 104/ }).click();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án', exact: true }).getByRole('button', { name: 'D', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu, ETS Table', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Câu 104 Bạn chọn C, đáp án D', exact: true })).toBeVisible();
  await expect(flow.getByText('Đã khôi phục nháp trên trình duyệt này.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? [])).toEqual([]);
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('toeic_form_draft_v1:') && decodeURIComponent(key).includes('detail-list:')))).toEqual([]);
});

test('discarding a detail draft keeps persisted notebook cards unchanged', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Vì sao sai câu 104').selectOption('TIME_PRESSURE');
  page.once('dialog', dialog => dialog.accept());
  await flow.getByRole('button', { name: 'Bỏ nháp', exact: true }).click();
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('');
  await expect(flow.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu, ETS Table', exact: true }).click();
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('');
});

test('a quota failure on the close click keeps the detail form open when losing the draft is declined', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Vì sao sai câu 104').selectOption('TIME_PRESSURE');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('toeic_form_draft_v1:')) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('Chưa tự lưu được nháp');
    void dialog.dismiss();
  });
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toBeVisible();
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('TIME_PRESSURE');
});
