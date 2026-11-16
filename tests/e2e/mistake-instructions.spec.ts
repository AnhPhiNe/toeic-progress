import { test, expect } from '@playwright/test';
import { PHONE_VIEWPORT, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

test('new notes offer only the Reading Parts and the instructions follow the chosen Part', async ({ page }) => {
  // Only phones open the full note form to add a card now (computers use the camera or "Tự gõ một câu").
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay'); const modal = await openNoteForm(page);
  const parts = modal.getByRole('group', { name: 'Part', exact: true });
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
  await expect(modal.getByText('Dán một câu hỏi kèm phương án. Bài đọc thêm bằng chữ hoặc ảnh ở khung bên trên.', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Chụp trang', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Chọn ảnh', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
