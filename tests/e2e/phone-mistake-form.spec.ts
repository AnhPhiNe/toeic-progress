import { expect, test } from '@playwright/test';
import { openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

test('phone manual question modal: Part 5–7 chips, Part 7 passage box, choices, optional reason/category and save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);

  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await expect(modal.getByLabel('Đoạn văn')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Ảnh', exact: true })).toHaveCount(0);

  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await expect(modal.getByLabel('Đoạn văn')).toHaveCount(0);
  await modal.getByLabel('Đề', { exact: true }).fill('ETS Phone Note');
  await modal.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await modal.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await modal.getByRole('button', { name: 'Đáp án đúng: B', exact: true }).click();
  await modal.getByRole('button', { name: /Thêm lý do và loại lỗi/ }).click();
  await modal.getByLabel('Lý do bạn chọn').fill('Nhìn nhầm chủ ngữ');
  await modal.getByLabel('Loại lỗi').selectOption('TIME_PRESSURE');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ part: 5, sourceTestName: 'ETS Phone Note', category: 'TIME_PRESSURE', userReason: 'Nhìn nhầm chủ ngữ', userChoice: 'A', correctAnswer: '(B) be' });
});
