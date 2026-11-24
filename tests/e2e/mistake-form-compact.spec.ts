import { test, expect } from '@playwright/test';
import { PHONE_VIEWPORT, openCard, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

test('source is required before saving; category and choices are optional in manual entry', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);
  await modal.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn hoặc thêm tên đề');

  await modal.getByLabel('Đề', { exact: true }).fill('ETS Compact');
  await modal.getByRole('button', { name: /Thêm lý do và loại lỗi/ }).click();
  await modal.getByLabel('Loại lỗi').selectOption('TIME_PRESSURE');
  const choice = modal.getByRole('button', { name: 'Mình chọn: A', exact: true });
  await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(modal).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.category).toBe('TIME_PRESSURE');
  expect(saved.part).toBe(5);
  expect(saved.sourceTestName).toBe('ETS Compact');
  expect(saved.userChoiceState).toBe('UNKNOWN');
  expect(saved.userChoice).toBeUndefined();
});

test('editing a Listening card keeps its saved transcript and historical blank choice without a transcript box', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    bundle.mistakes = [{ id: 'context', sourceTestName: 'ETS Context', part: 3, question: 'What does the man need?', context: '(M) I need the report today.',
      questionContext: 'What does the man need?\n\n(M) I need the report today.', options: ['(A) A report.', '(B) A car.'],
      correctAnswer: '(A) A report.', answerSource: 'PROVIDED', userChoiceState: 'BLANK', userMistake: 'Bỏ trống',
      category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload(); await openCard(page, 'What does the man need?');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('What does the man need?\n(A) A report.\n(B) A car.');
  await expect(modal.getByLabel('Transcript', { exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe('What does the man need?'); expect(saved.context).toBe('(M) I need the report today.');
  expect(saved.userChoiceState).toBe('BLANK'); expect(saved.questionContext).toContain('today');
});
