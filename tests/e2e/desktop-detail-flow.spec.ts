import { expect, test } from '@playwright/test';
import { openDesktopFlow, openPendingList, screenshot, TIP } from './helpers/detailAI';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

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
  await expect(flow.getByRole('status')).toContainText('Đã đọc ảnh, cần kiểm tra');
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
  // The options already show the answers; the pickers open only to change them.
  await expect(flow.getByRole('group', { name: 'Đáp án' })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'D', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, đáp án D', exact: true })).toBeVisible();
  // AI solved 131 differently from the page: the row is flagged until the learner decides.
  const p6 = flow.getByRole('region', { name: 'Part 6' });
  await expect(p6).toContainText('Nghi đáp án');
  await expect(p6).toContainText('● 1 cần xem');
  await flow.getByRole('button', { name: /^Câu 131/ }).click();
  await expect(flow.getByText(TIP)).toBeVisible();
  await expect(flow.getByText('AI chọn', { exact: true })).toBeVisible();
  await expect(flow.getByText('Trang đề', { exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Đổi sang C', exact: true }).click();
  await expect(p6).not.toContainText('Nghi đáp án');
  await expect(flow.getByRole('button', { name: 'Câu 131 Bạn chọn B, đáp án C', exact: true })).toBeVisible();
  // No way out to the full form here: it would drop the rows read but not saved yet.
  await expect(flow.getByRole('button', { name: 'Form đầy đủ' })).toHaveCount(0);

  await flow.getByRole('button', { name: 'Lưu 3 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Table')
    .map((card: { questionNumber: number; userChoice?: string; correctAnswer: string; category: string; explanation?: { quickTip: string } }) =>
      [card.questionNumber, card.userChoice ?? '', card.correctAnswer, card.category, card.explanation?.quickTip ?? ''])
    .sort((a: number[], b: number[]) => a[0] - b[0]));
  expect(saved).toEqual([
    [104, 'C', '(A) accommodates', 'VOCABULARY_TRAP', TIP],
    // Changing a key also invalidates the earlier rationale and its inferred reason.
    [112, 'B', '(D) to accommodate', 'OTHER', ''],
    [131, 'B', '(C) accommodation', 'OTHER', '']
  ]);
});

test('closing the list keeps filled rows as a recoverable draft', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Vì sao sai câu 104').selectOption('TIME_PRESSURE');
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await page.reload();
  await openPendingList(page);
  await expect(flow.getByLabel('Vì sao sai câu 104')).toHaveValue('TIME_PRESSURE');
  await expect(flow.getByText('Đã khôi phục nháp trên trình duyệt này.', { exact: true })).toBeVisible();
});

test('a doubt left open when saving stays on the notebook card until the learner decides', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
  await expect(flow.getByRole('region', { name: 'Part 6' })).toContainText('Nghi đáp án');
  await flow.getByRole('button', { name: 'Lưu 3 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);

  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .find((card: { questionNumber?: number; sourceTestName?: string }) => card.questionNumber === 131 && card.sourceTestName === 'ETS Table'));
  expect(await stored()).toMatchObject({ correctAnswer: '(A) accommodates', answerDoubt: 'C' });
  await gotoPage(page, '/so-tay');
  await openCard(page, /The new reading room/);
  await expect(page.getByRole('note')).toContainText('AI chọn C, trang đề chọn A.');
  await page.getByRole('button', { name: 'Giữ A', exact: true }).click();
  await expect(page.getByRole('note')).toHaveCount(0);
  const kept = await stored();
  expect(kept.correctAnswer).toBe('(A) accommodates');
  expect(kept.answerDoubt).toBeUndefined();
});
