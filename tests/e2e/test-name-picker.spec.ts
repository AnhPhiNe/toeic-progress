import { chooseNoteSource } from './helpers/noteSource';
import { choosePart, openAnswerKey, openNoteForm } from './helpers/mistakeForm';
import { test, expect } from '@playwright/test';

test('search stays inside the dropdown, keeps the field stable and marks the selected source', async ({ page }, testInfo) => {
  await page.goto('/so-tay');
  await openNoteForm(page);
  const modal = page.getByRole('dialog');
  await chooseNoteSource(modal, 'ETS 2025 Test 03');
  const trigger = modal.getByRole('button', { name: 'Chọn đề', exact: true });
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    // Crossing the phone breakpoint swaps the form layout; measure once the picker is back.
    await expect(trigger).toBeVisible();
    const before = (await trigger.boundingBox())!;
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const search = modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true });
    await expect(search).toBeFocused();
    const after = (await trigger.boundingBox())!;
    expect(after).toEqual(before);
    await expect(modal.getByRole('button', { name: 'Hủy đổi đề', exact: true })).toHaveCount(0);
    const selected = modal.getByRole('option', { name: 'ETS 2025 Test 03', exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected.locator('svg')).toBeVisible();
    const bounds = (await modal.getByRole('listbox', { name: 'Tên đề gợi ý' }).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`source-dropdown-${width}.png`) });
    await search.fill('Canceled source'); await search.press('Escape');
    await expect(trigger).toHaveText('ETS 2025 Test 03'); await expect(trigger).toBeFocused();
    await expect(modal.getByRole('listbox')).toHaveCount(0);
  }
  await trigger.click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).press('Tab');
  expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(modal.getByRole('listbox')).toHaveCount(0);
});

test('empty answers are visible but disabled, source key is separate and Part text fits', async ({ page }, testInfo) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog');
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    // Poll: right after a resize the previous layout can still be measured.
    await expect.poll(() => modal.getByLabel('Part', { exact: true }).evaluate(element => {
      const style = getComputedStyle(element), canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!; context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return context.measureText('Chọn Part').width <= element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const letter of ['A', 'B', 'C', 'D']) await expect(modal.getByRole('button', { name: `Bạn chọn ${letter}`, exact: true })).toBeDisabled();
  await expect(modal.getByText('Dán câu hỏi để chọn phương án.', { exact: true })).toBeVisible();
  await openAnswerKey(modal);
  await expect(modal.getByRole('button', { name: 'Đáp án từ đề: A', exact: true })).toBeDisabled();
  await modal.getByLabel('Part', { exact: true }).selectOption('2');
  await expect(modal.getByRole('button', { name: 'Bạn chọn D', exact: true })).toHaveCount(0);
  await modal.getByLabel('Câu hỏi + phản hồi A–C').fill('Where is the meeting?\n(A) In room five.\n(B) Next week.\n(C) Yes, I did.');
  const chosen = modal.getByRole('button', { name: 'Bạn chọn B', exact: true });
  await expect(chosen).toBeEnabled(); await chosen.click();
  await modal.getByRole('button', { name: 'Đáp án từ đề: A', exact: true }).click();
  await expect(chosen).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByRole('button', { name: 'Đáp án từ đề: A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('choice-and-source-key.png') });
});

test('adding a source from notes creates no score, and total/part forms reuse one canonical name', async ({ page }) => {
  await page.goto('/so-tay');
  await openNoteForm(page);
  let modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  const source = modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true });
  await source.fill('ETS 2025 Test 03');
  await expect(page.getByRole('option', { name: '+ Thêm tên đề “ETS 2025 Test 03”', exact: true })).toBeVisible();
  await source.press('Enter');
  await expect(modal.getByText('ETS 2025 Test 03', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.length)).toBe(0);
  await choosePart(modal, '5');
  await modal.getByLabel('Câu hỏi + phương án').fill('Part 5:\nReports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been');
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N' }).click();
  modal = page.getByRole('dialog');
  const scoreSource = modal.getByRole('combobox', { name: 'Tên Đề Thi / Nguồn' });
  await scoreSource.fill('  ets 2025   test 03  ');
  await expect(page.getByRole('option', { name: 'ETS 2025 Test 03', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Thêm tên đề/ })).toHaveCount(0);
  await scoreSource.press('Enter');
  await expect(scoreSource).toHaveValue('ETS 2025 Test 03');
  await modal.getByLabel('Nhập điểm từ kết quả đề (tùy chọn)').check();
  await modal.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await modal.getByLabel('Tổng điểm TOEIC /990').fill('750');
  await modal.getByRole('button', { name: 'Lưu kết quả' }).click();
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N' }).click();
  modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: /Luyện Từng Part/ }).click();
  const partSource = modal.getByRole('combobox', { name: 'Tên Đề Thi / Nguồn' });
  await partSource.fill('ETS 2025');
  await expect(page.getByRole('option', { name: 'ETS 2025 Test 03', exact: true })).toHaveCount(1);
  await partSource.press('Enter');
  // Cancel this practice draft: selecting a name itself never creates a session.
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(data.sessions).toHaveLength(1); expect(data.sessions[0]).toMatchObject({ testName: 'ETS 2025 Test 03', totalScore: 750 });
  expect(data.mistakes).toHaveLength(1); expect(data.mistakes[0].sourceTestName).toBe('ETS 2025 Test 03');
});

test('the picker can be canceled by Escape and the floating cue exposes the lower content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 620 });
  await page.goto('/so-tay');
  await openNoteForm(page);
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('Canceled source');
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).press('Escape');
  await expect(modal).toBeVisible(); await expect(modal.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText('Chọn đề');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const cue = modal.getByRole('button', { name: 'Cuộn xem nội dung bên dưới', exact: true });
  await expect(cue).toBeVisible();
  const cueBounds = (await cue.boundingBox())!;
  const bodyBounds = (await modal.getByRole('region', { name: 'Nội dung ghi lỗi sai' }).boundingBox())!;
  expect(Math.abs(cueBounds.x + cueBounds.width / 2 - bodyBounds.x - bodyBounds.width / 2)).toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await cue.locator('svg').evaluate(element => getComputedStyle(element).animationIterationCount)).toBe('2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await cue.locator('svg').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await cue.click();
  await expect(cue).toHaveCount(0);
  await expect(modal.locator('summary').filter({ hasText: 'Đáp án, loại lỗi' })).toBeInViewport();
  await expect(modal.getByText('Thêm transcript / đoạn đọc')).toHaveCount(0);
  const region = modal.getByRole('region', { name: 'Nội dung ghi lỗi sai' });
  await region.evaluate(element => { element.scrollTop = 0; });
  await expect(cue).toBeVisible();
  await chooseNoteSource(modal);
  await choosePart(modal, '5');
  await modal.getByLabel('Câu hỏi + phương án').fill('Part 5:\nReports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been');

  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Chưa có đáp án');
  await expect(cue).toHaveCount(0);
});
