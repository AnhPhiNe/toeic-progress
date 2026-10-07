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
  // The learner's own choice (A) is marked next to the correct option, each with its meaning.
  await expect(dialog.getByText('Bạn chọn')).toBeVisible();
  await expect(dialog.getByText(': to be, hiện tại số nhiều')).toBeVisible();
  await expect(dialog.getByText('Mẹo 10s:')).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Lưu Vào Sổ Tay' });
  await expect(save).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Tôi đã kiểm tra nội dung và đáp án trước khi lưu.' }).check();
  await save.click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Ms. Watson requested that all expense reports', { exact: false }).first()).toBeVisible();
});

test('one review flow grades the answer and reschedules the card', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const draft = page.getByRole('dialog');
  await draft.getByRole('button', { name: 'Xem mẫu minh họa' }).click();
  await draft.getByRole('checkbox', { name: 'Tôi đã kiểm tra nội dung và đáp án trước khi lưu.' }).check();
  await draft.getByRole('button', { name: 'Lưu Vào Sổ Tay' }).click();
  await expect(page.getByText('Ôn hôm nay').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ôn 1 thẻ đến hạn' }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  // Meanings stay hidden until the learner answers.
  await expect(review.getByText(': to be, hiện tại số nhiều')).toHaveCount(0);
  await review.getByRole('button', { name: /^A\s*are/ }).click();
  await expect(review.getByRole('status')).toHaveText('Vẫn nhầm như lần trước · ôn lại ngày mai');
  await expect(review.getByText(': to be, hiện tại số nhiều')).toBeVisible();
  await review.getByRole('button', { name: 'Xem kết quả' }).click();
  await expect(review.getByText('Trả lời đúng 0/1.', { exact: false })).toBeVisible();
  await review.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByText('Ôn ngày mai').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
  await page.getByRole('menuitem', { name: 'Đánh dấu đã thuộc' }).click();
  await expect(page.getByText('Thông suốt', { exact: true }).filter({ visible: true })).toBeVisible();
});

test('unconfigured AI never substitutes a sample for pasted content', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Dán câu hỏi + đáp án đã chọn + đáp án chuẩn nếu có:');
  await input.fill('This is a different TOEIC question with no configured backend.');
  // Without a configured provider there is no recipient to consent to, so analysis stays unavailable.
  await expect(dialog.getByText('AI thật chưa được cấu hình.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Tôi đồng ý gửi nội dung/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'AI Phân Tích Bẫy' })).toBeDisabled();
  await expect(dialog.getByRole('heading', { name: 'Mẫu minh họa có sẵn' })).not.toBeVisible();
  await expect(input).toHaveValue('This is a different TOEIC question with no configured backend.');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
