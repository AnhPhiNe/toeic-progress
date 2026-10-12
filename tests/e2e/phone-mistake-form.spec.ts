import { expect, test } from '@playwright/test';

test('phone mistake form: Part buttons, reading above the question, reason after a choice, optional row and manual save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Câu sai/ }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm lỗi sai', exact: true });
  await expect(modal.getByRole('combobox', { name: 'Part', exact: true })).toHaveCount(0);

  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  const reading = modal.getByLabel('Đoạn đọc', { exact: true });
  const question = modal.getByLabel('Câu hỏi + phương án');
  expect((await reading.boundingBox())!.y).toBeLessThan((await question.boundingBox())!.y);
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Chụp trang', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Chọn ảnh', exact: true })).toBeVisible();
  await expect(modal.getByText('Kéo ảnh vào đây')).toHaveCount(0);

  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('ETS Phone Note');
  await page.getByRole('option', { name: '+ Thêm tên đề “ETS Phone Note”', exact: true }).click();
  await question.fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await expect(modal.getByLabel('Lý do chọn')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByLabel('Lý do chọn').fill('Nhìn nhầm chủ ngữ');
  await modal.locator('summary').filter({ hasText: 'Đáp án, loại lỗi' }).click();
  await modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Lỗi sai', exact: true }).selectOption('TIME_PRESSURE');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ part: 5, sourceTestName: 'ETS Phone Note', category: 'TIME_PRESSURE', userReason: 'Nhìn nhầm chủ ngữ' });
});
