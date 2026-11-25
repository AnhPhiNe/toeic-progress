import { expect, test } from '@playwright/test';
import { openDesktopFlow, screenshot, storedCard } from './helpers/detailAI';

test('after logging a test, one tray reads mixed Reading parts and skips duplicate photos', async ({ page }) => {
  const flow = await openDesktopFlow(page, true);
  const picker = flow.getByLabel('Dán, thả hoặc chọn ảnh đề và đáp án');
  await picker.setInputFiles(screenshot);
  await expect(flow.getByRole('button', { name: 'Gửi 1 ảnh cho Sóc' })).toBeEnabled();
  const tray = flow.locator('.cz');
  await expect.poll(() => tray.evaluate(el => {
    const tile = el.querySelector('.cz-th')!;
    const remove = tile.querySelector('button')!.getBoundingClientRect();
    return tile.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom && remove.height === remove.width;
  })).toBe(true);
  await flow.getByRole('button', { name: 'P6', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Gửi 1 ảnh cho Sóc' })).toBeEnabled();
  await flow.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await picker.setInputFiles(screenshot);
  await expect(flow.getByText('Ảnh này đã có trong khay.')).toBeVisible();
  await flow.getByRole('button', { name: 'Gửi 1 ảnh cho Sóc' }).click();
  await expect(flow.getByRole('button', { name: /Lưu .* câu đã đủ/ })).toBeEnabled();
  const calls = await page.evaluate(() => (window as Window & { __pageCalls?: { questions: number[] }[] }).__pageCalls);
  await flow.getByRole('button', { name: /Lưu .* câu đã đủ/ }).click();
  await expect.poll(async () => (await storedCard(page, 104))?.userChoice).toBe('C');
  await expect(flow.getByRole('button', { name: 'Soát 1 câu', exact: true })).toBeVisible();
  expect(calls?.flatMap(call => call.questions)).toEqual([104, 112, 131]);
});

test('mode switches smoothly between 1-tray and grouped shots, and sticky quickEntry clears on close', async ({ page }) => {
  const flow = await openDesktopFlow(page, true);
  await expect(flow.getByRole('button', { name: 'Chia theo nhóm', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Chia theo nhóm', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^Cách khác/ }).click();
  await flow.getByRole('menuitem', { name: /^Gộp gửi 1 khay/ }).click();
  await expect(flow.getByRole('button', { name: 'Chia theo nhóm', exact: true })).toBeVisible();
  // Closing quickEntry must not trap later opens from Sổ tay's pending row.
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: /câu chờ ghi chi tiết/ }).first().click();
  await expect(flow.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
});

test('phone layout of 1-tray capture fits cleanly without horizontal overflow', async ({ page }) => {
  const flow = await openDesktopFlow(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(flow.getByRole('button', { name: /^Chia (theo )?nhóm/ })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Chụp liên tiếp', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('multi-cluster Part 6–7 tests default to grouped capture without Listening barrier and with ② Câu hỏi active', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { mockTurnsAI } = await import('./helpers/detailAI');
  const { openManualEntry } = await import('./helpers/manualEntry');
  const { gotoPage, openScoreLogger } = await import('./helpers/nav');
  await mockTurnsAI(page);
  await gotoPage(page, '/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Ghi điểm', exact: true }) });
  await openManualEntry(page, form);
  await form.locator('#session-test-name').fill('ETS Multi');
  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await form.getByLabel('Số câu sai').fill('3 131 149 186');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: /Ghi chi tiết .* câu sai/ }).click();
  const flow = page.getByRole('dialog', { name: 'Gỡ câu sai · ETS Multi', exact: true });
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Nhóm 149–150', exact: true }).click();
  await expect(flow.locator('.cz[data-zone="questions"]')).toHaveAttribute('data-active', 'true');
  await expect(flow.getByRole('button', { name: 'Phần Nghe còn 1 câu · Ghi lý do', exact: true })).toBeVisible();
});

test('even a single Part 7 multi-passage group (176–200) defaults to grouped capture so ①/② zones stay available', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { mockTurnsAI } = await import('./helpers/detailAI');
  const { openManualEntry } = await import('./helpers/manualEntry');
  const { gotoPage, openScoreLogger } = await import('./helpers/nav');
  await mockTurnsAI(page);
  await gotoPage(page, '/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Ghi điểm', exact: true }) });
  await openManualEntry(page, form);
  await form.locator('#session-test-name').fill('ETS Triple');
  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await form.getByLabel('Số câu sai').fill('104 186');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: /Ghi chi tiết .* câu sai/ }).click();
  const flow = page.getByRole('dialog', { name: 'Gỡ câu sai · ETS Triple', exact: true });
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Nhóm 186–190', exact: true }).click();
  await expect(flow.locator('.cz[data-zone="passage"]')).toBeVisible();
  await expect(flow.locator('.cz[data-zone="questions"]')).toHaveAttribute('data-active', 'true');
});
