import { expect, test } from '@playwright/test';
import { openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const NAME = 'ETS 2024 Test 11';

test.use({ viewport: { width: 1440, height: 900 } });

test('with no logged tests the name field keeps focus while a full name is typed, then the name is selected', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);
  const input = modal.getByPlaceholder('Tên đề, ví dụ ETS 2024 Test 11');
  await input.click();
  await input.pressSequentially(NAME);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(NAME);
  await modal.getByRole('heading', { name: 'Tự gõ một câu sai' }).click();
  await expect(modal.getByRole('combobox', { name: 'Đề', exact: true })).toHaveValue(NAME);
  await expect(modal.getByPlaceholder('Tên đề, ví dụ ETS 2024 Test 11')).toHaveCount(0);
});

test('with known tests, "Đề khác…" opens a field that keeps focus through a full name', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'k1', questionContext: 'Reports should ____ submitted.', nextReviewDate: '2099-01-01', part: 5, category: 'OTHER',
      status: 'NEEDS_REVIEW', options: ['(A) are', '(B) be'], userMistake: '', correctAnswer: '(B) be', answerSource: 'PROVIDED', tags: [],
      sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const modal = await openManualForm(page);
  await modal.getByRole('combobox', { name: 'Đề', exact: true }).selectOption({ label: '＋ Đề khác…' });
  const input = modal.getByPlaceholder('Tên đề, ví dụ ETS 2024 Test 11');
  await expect(input).toBeFocused();
  await input.pressSequentially(NAME);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(NAME);
  await modal.getByRole('heading', { name: 'Tự gõ một câu sai' }).click();
  await expect(modal.getByRole('combobox', { name: 'Đề', exact: true })).toHaveValue(NAME);
});
