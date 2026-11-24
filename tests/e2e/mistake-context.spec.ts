import { test, expect } from '@playwright/test';
import { PHONE_VIEWPORT, openCard, openCardEditor, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const question = 'What problem does the man mention?';
const passage = '(M-Cn) The warehouse was out of the small food containers.\n(W-Am) Sales are slow today.';
const options = ['(A) Sales are slow.', '(B) More staff is needed.', '(C) An order is incomplete.', '(D) Some equipment is broken.'];

test('Part 7 passage and stem stay separate across manual entry, phone card, review and editing', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByLabel('Đề', { exact: true }).fill('ETS Context');
  await modal.getByLabel('Câu hỏi và các phương án').fill(question + '\n' + options.join('\n'));
  await modal.getByLabel('Đoạn văn').fill(passage);
  await modal.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await modal.getByRole('button', { name: 'Đáp án đúng: C', exact: true }).click();
  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();

  await expect(page.locator('.pn-row')).toHaveCount(1);
  await openCard(page);
  await page.getByRole('tab', { name: 'Đoạn văn', exact: true }).click();
  await expect(page.locator('.cdp-pcard').getByText(passage, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Câu hỏi', exact: true }).click();
  await expect(page.locator('.cd-q')).toHaveText(question);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe(question);
  expect(saved.context).toBe(passage);
  expect(saved.userChoice).toBe('A');
  expect(saved.correctAnswer).toBe(options[2]);

  await page.setViewportSize(PHONE_VIEWPORT);
  await page.reload();
  await openCard(page);
  await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai' });
  await expect(review.getByText(passage, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /^C\s*An order is incomplete/ }).click();
  await review.getByRole('button', { name: 'Hiểu rồi', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ôn xong' })).toContainText('Hiểu rồi 1');
  await page.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
  await page.reload();

  const editor = await openCardEditor(page);
  await expect(editor.getByLabel('Câu hỏi + phương án')).toHaveValue(question + '\n' + options.join('\n'));
  await expect(editor.getByLabel('Đoạn đọc', { exact: true })).toHaveValue(passage);
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(edited.question).toBe(question);
  expect(edited.context).toBe(passage);
  expect(edited.correctAnswer).toBe(options[2]);
  expect(edited.reviewStage).toBe(1);
});
