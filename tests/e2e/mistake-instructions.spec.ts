import { test, expect } from '@playwright/test';

test('new notes offer only the Reading Parts and the instructions follow the chosen Part', async ({ page }) => {
  // Tablet and desktop layout; the phone form is covered in phone-mistake-form.spec.ts.
  await page.setViewportSize({ width: 768, height: 820 });
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const modal = page.getByRole('dialog'), parts = modal.getByRole('group', { name: 'Part', exact: true });
  await expect(parts).toBeInViewport();
  await expect(parts.getByRole('button')).toHaveText(['5', '6', '7']);
  await expect(modal.getByRole('combobox', { name: 'Loại ảnh', exact: true })).toHaveCount(0);
  await parts.getByRole('button', { name: 'Part 5', exact: true }).click();
  const paste = modal.getByLabel('Câu hỏi + phương án');
  await paste.fill('The meeting ____ at noon.\n(A) start\n(B) starts\n(C) starting\n(D) to start');
  await expect(paste).toHaveAttribute('aria-describedby', 'mistake-input-hint');
  await expect(modal.getByRole('button', { name: 'Thêm ảnh', exact: true })).toHaveCount(0);
  const pasted = await paste.inputValue();
  await parts.getByRole('button', { name: 'Part 7', exact: true }).click();
  await expect(paste).toHaveValue(pasted);
  await expect(modal.getByText('Dán một câu hỏi kèm phương án. Bài đọc thêm bằng chữ hoặc ảnh ở khung bên dưới.', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Thêm ảnh', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
