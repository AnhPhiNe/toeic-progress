import { expect, test } from '@playwright/test';
import { openDesktopFlow, screenshot, TIP } from './helpers/detailAI';

test('a computer reads all screenshots of a test in turns and saves the whole list at once', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  // Listening question 3 counts in the score but has no card, so the list is Reading only, without tabs.
  await expect(flow.getByRole('tablist')).toHaveCount(0);
  await expect(flow.getByRole('button', { name: /^Câu 3/ })).toHaveCount(0);
  await expect(flow.getByRole('region', { name: 'Part 5' })).toBeVisible();

  // Explanations take a moment, so the rows are first seen as read from the page.
  await page.evaluate(() => { (window as Window & { __explainDelay?: number }).__explainDelay = 1500; });
  // Four screenshots are read as two turns (three images, then one); the second asks only for questions still missing.
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
  await expect(flow.getByRole('status')).toHaveText('AI đã điền 3 câu. Kiểm tra lý do rồi bấm Lưu.');
  expect(await page.evaluate(() => (window as Window & { __pageCalls: unknown }).__pageCalls)).toEqual([
    { questions: [104, 112, 131], images: 3 }, { questions: [131], images: 1 }
  ]);

  // Each row reads like an answer sheet; a question without an answer on the page is flagged.
  await expect(flow.getByRole('img', { name: 'Bạn chọn C, đáp án A', exact: true })).toBeVisible();
  await expect(flow.getByRole('region', { name: 'Part 5' })).toContainText('● 1 cần xem');
  await expect(flow.getByRole('img', { name: 'Bạn chọn B, chưa có đáp án', exact: true })).toBeVisible();

  // The explanation written in the background suggests the reason (and an answer where the page had none);
  // keys 1–6 change the reason on the focused row.
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('ADVANCED_GRAMMAR');
  await flow.getByRole('button', { name: /^Câu 104/ }).focus();
  await page.keyboard.press('1');
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('VOCABULARY_TRAP');

  // Opening a row shows the question, the pickers and the tip; the learner fills the missing answer.
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, đáp án A', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^Câu 112/ }).click();
  await flow.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'D', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, đáp án D', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^Câu 131/ }).click();
  await expect(flow.getByText(TIP)).toBeVisible();

  await flow.getByRole('button', { name: 'Lưu 3 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Table')
    .map((card: { questionNumber: number; userChoice?: string; correctAnswer: string; category: string; explanation?: { quickTip: string } }) =>
      [card.questionNumber, card.userChoice ?? '', card.correctAnswer, card.category, card.explanation?.quickTip ?? ''])
    .sort((a: number[], b: number[]) => a[0] - b[0]));
  expect(saved).toEqual([
    [104, 'C', '(A) accommodates', 'VOCABULARY_TRAP', TIP],
    [112, 'B', '(D) to accommodate', 'ADVANCED_GRAMMAR', TIP],
    [131, 'B', '(A) accommodates', 'ADVANCED_GRAMMAR', TIP]
  ]);
});

test('closing the list with filled rows asks first', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Vì sao sai câu 104').selectOption('TIME_PRESSURE');
  page.once('dialog', dialog => { expect(dialog.message()).toBe('Đóng mà không lưu 1 câu đã điền?'); void dialog.dismiss(); });
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toBeVisible();
});
