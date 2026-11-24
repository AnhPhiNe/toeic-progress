import { test, expect } from '@playwright/test';
import { openCardEditor } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const options = ['(A) Writing.', '(B) Planning.', '(C) Data Basics.', '(D) Leadership.'];

test('editing a saved Part 7 card keeps its stored reading without an extra reuse prompt', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(options => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{
      id: 'saved-p7', part: 7, category: 'OTHER', status: 'NEEDS_REVIEW', sourceTestName: 'ETS Reuse',
      question: 'Which workshop is free?', context: 'Stored passage text.', questionContext: 'Which workshop is free?\n\nStored passage text.',
      options, correctAnswer: options[2], answerSource: 'PROVIDED', userMistake: '', tags: [], createdAt: now, updatedAt: now, deletedAt: null
    }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, options);
  await page.reload();
  const modal = await openCardEditor(page, 'Which workshop is free?');
  await expect(modal.getByRole('region', { name: /Tái sử dụng/ })).toHaveCount(0);
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toHaveValue('Stored passage text.');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.context).toBe('Stored passage text.');
  expect(saved.sourceImageIds).toBeUndefined();
});
