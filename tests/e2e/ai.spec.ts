import { expect, test } from '@playwright/test';

test('AI sample is explicit and requires review before saving', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'AI Phân Tích Bẫy' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Xem mẫu minh họa' }).click();
  await expect(dialog.getByRole('heading', { name: 'Mẫu minh họa có sẵn' })).toBeVisible();
  await expect(dialog.getByText('Đây là ví dụ có sẵn, không phải kết quả phân tích nội dung bạn nhập.')).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Lưu Vào Sổ Tay' });
  await expect(save).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Tôi đã kiểm tra nội dung và đáp án trước khi lưu.' }).check();
  await save.click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Ms. Watson requested that all expense reports', { exact: false }).first()).toBeVisible();
});

test('unconfigured AI never substitutes a sample for pasted content', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dán câu hỏi + đáp án đã chọn + đáp án chuẩn nếu có:').fill('This is a different TOEIC question with no configured backend.');
  await dialog.getByRole('checkbox', { name: /Tôi đồng ý gửi nội dung/ }).check();
  await dialog.getByRole('button', { name: 'AI Phân Tích Bẫy' }).click();
  await expect(dialog.getByText('AI thật chưa được cấu hình.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Mẫu minh họa có sẵn' })).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
