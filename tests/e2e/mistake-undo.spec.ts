import { expect, test, type Page } from '@playwright/test';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const question = 'Reports should ____ submitted.';
async function seed(page: Page) {
  await gotoPage(page, '/so-tay');
  await page.evaluate(question => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    bundle.mistakes = [{ id: 'undo-card', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      question, questionContext: question, options: ['(A) are', '(B) be'], correctAnswer: '(B) be',
      answerSource: 'PROVIDED', userMistake: '', tags: [], sourceTestName: 'Undo test',
      reviewStage: 2, reviewCount: 2, nextReviewDate: '2020-01-01', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, question);
  await page.reload();
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);

for (const width of [390, 1280]) {
  test(`deleting a notebook card can be undone and survives reload at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await openCard(page, question);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Xoá câu này', exact: true }).click();
    expect((await saved(page)).deletedAt).toBeTruthy();
    await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã khôi phục thẻ' })).toBeVisible();
    expect((await saved(page)).deletedAt).toBeNull();
    await page.reload();
    await expect(page.locator('.nb-row, .pn-row')).toHaveCount(1);
  });
}

// Removed with the redesign: "Hoàn tác chấm" (undoing a grade from the review's finish screen) no longer exists in
// ReviewSession / ReviewPhone, so the two grade-undo tests that lived here were deleted.
