import { expect, test, type Page } from '@playwright/test';
import { gotoPage } from './helpers/nav';

/**
 * A phone-logged Full Test with one Listening and three Reading wrong questions; only the Reading ones get draft cards.
 * The test and its drafts are stored directly, exactly as saving a test with those wrong questions leaves them.
 */
async function logTest(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    bundle.sessions = [{ id: 'detail-session', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS Detail', date: '2026-11-10', durationMinutes: 120,
      scaledListening: 400, scaledReading: 350, totalScore: 750, wrongQuestions: [3, 103, 107, 151], createdAt: now, updatedAt: now, deletedAt: null }];
    bundle.mistakes = [[103, 5], [107, 5], [151, 7]].map(([number, part]) => ({
      id: `draft:detail-session:${number}`, sessionId: 'detail-session', sourceTestName: 'ETS Detail', part, questionNumber: number,
      questionContext: '', question: '', userMistake: '', correctAnswer: '', answerSource: 'MISSING', userChoiceState: 'UNKNOWN',
      category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('button', { name: '3 câu chờ ghi chi tiết, ETS Detail. Gỡ câu sai', exact: true }).click();
  return page.getByRole('dialog', { name: 'Gỡ câu sai · ETS Detail', exact: true });
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .filter((card: { sourceTestName?: string; deletedAt?: string | null }) => card.sourceTestName === 'ETS Detail' && !card.deletedAt));

test('on a phone a question is written by hand in a bottom sheet and saved', async ({ page }) => {
  const flow = await logTest(page);
  await expect(flow.getByRole('heading', { name: /^Gỡ câu sai/ })).toBeVisible();
  await expect(flow.getByText('ETS Detail · 4 câu sai', { exact: true })).toBeVisible();
  // No AI on this build: the Part opens for writing by hand.
  await flow.getByRole('button', { name: 'Ghi tay Part 5', exact: true }).click();
  await flow.getByRole('button', { name: '✎ Ghi tay', exact: true }).click();
  const card = flow.getByRole('group', { name: 'Ghi tay một câu' });
  await card.getByRole('button', { name: '107', exact: true }).click();
  await card.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'B', exact: true }).click();
  await card.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'B', exact: true }).click();
  await card.getByRole('group', { name: 'Vì sao sai câu 107' }).getByRole('button', { name: 'Ngữ pháp', exact: true }).click();
  await card.getByRole('button', { name: 'Lưu câu 107', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveText('Câu 107: Đáp án bạn chọn trùng đáp án đúng.');
  await card.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'A', exact: true }).click();
  await card.getByRole('button', { name: 'Lưu câu 107', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(flow.getByRole('button', { name: 'Câu 107, đã ghi', exact: true })).toBeVisible();

  const saved = (await stored(page)).find((item: { questionNumber: number }) => item.questionNumber === 107);
  expect(saved).toMatchObject({ part: 5, userChoice: 'A', userChoiceState: 'CHOSEN', correctAnswer: '(B)', answerSource: 'PROVIDED', category: 'ADVANCED_GRAMMAR' });
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi chi tiết' })).toContainText('Đã ghi chi tiết 1 câu');
  // The card with content is in the list; the two drafts still wait in the pink row.
  await expect(page.getByRole('button', { name: '2 câu chờ ghi chi tiết, ETS Detail. Gỡ câu sai', exact: true })).toBeVisible();
});

test('the pink row restores unsaved reasons after closing on a phone', async ({ page }) => {
  const flow = await logTest(page);
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await flow.getByRole('group', { name: 'Vì sao sai câu 3' }).getByRole('button', { name: 'Hết giờ', exact: true }).click();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '3 câu chờ ghi chi tiết, ETS Detail. Gỡ câu sai', exact: true }).click();
  await expect(flow.getByText('Còn 1 câu nháp chưa lưu')).toBeVisible();
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await expect(flow.getByRole('group', { name: 'Vì sao sai câu 3' }).getByRole('button', { name: 'Hết giờ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
