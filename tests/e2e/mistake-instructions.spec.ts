import { test, expect } from '@playwright/test';

test('the Part control is always available and persistent instructions distinguish transcript, picture and Reading input', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 820 });
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'), part = modal.getByRole('combobox', { name: 'Part', exact: true });
  await expect(part).toBeInViewport();
  await expect(modal.getByRole('combobox', { name: 'Loại ảnh', exact: true })).toHaveCount(0);
  await part.selectOption('2');
  const transcript = modal.getByLabel('Transcript + phản hồi A–C');
  await transcript.fill('When will the meeting start?\n(A) At noon.\n(B) In the office.\n(C) Mr. Tran.');
  await expect(transcript).toHaveAttribute('aria-describedby', 'mistake-input-hint');
  await expect(modal.getByText('Dán transcript câu hỏi và ba phản hồi A–C. Mỗi lần ghi một câu lỗi sai.', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Bạn chọn D', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Thêm ảnh', exact: true })).toHaveCount(0);
  const pasted = await transcript.inputValue();
  await part.selectOption('3');
  await expect(modal.getByLabel('Transcript + câu hỏi + A–D')).toHaveValue(pasted);
  await expect(modal.getByText('Dán transcript hội thoại/bài nói, một câu hỏi cần ghi lỗi và A–D. Dán chung trong ô này.', { exact: true })).toBeVisible();
  await part.selectOption('7');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toBeVisible();
  await expect(modal.getByText('Dán một câu hỏi và A–D bằng văn bản. Thêm bài đọc bằng chữ hoặc ảnh ngữ cảnh bên dưới.', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Thêm ảnh', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('combobox', { name: 'Part', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
