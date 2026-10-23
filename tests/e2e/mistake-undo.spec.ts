import { expect, test, type Page } from '@playwright/test';

const question = 'Reports should ____ submitted.';
async function seed(page: Page) {
  await page.goto('/so-tay');
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
    if (width < 768) {
      await page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }).click();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('menuitem', { name: 'Xóa', exact: true }).click();
    }
    expect((await saved(page)).deletedAt).toBeTruthy();
    await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã khôi phục thẻ' })).toBeVisible();
    expect((await saved(page)).deletedAt).toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: `Mở câu: ${question}`, exact: true })).toBeVisible();
  });
}

test('grade undo restores schedule and summary after advancing to the finished screen', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /^Ôn 1 (thẻ|câu đến hạn)$/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last().click();
  await review.getByRole('button', { name: 'Dễ', exact: true }).click();
  expect(await saved(page)).toMatchObject({ reviewStage: 4, reviewCount: 3 });
  await review.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await expect(review).toContainText('Trả lời đúng 1/1');
  await review.getByRole('button', { name: 'Hoàn tác chấm', exact: true }).click();
  expect(await saved(page)).toMatchObject({ reviewStage: 2, reviewCount: 2, nextReviewDate: '2020-01-01' });
  await expect(review.getByRole('button', { name: 'Hoàn tác chấm', exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last().click();
  await review.getByRole('button', { name: 'Quên', exact: true }).click();
  await review.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await expect(review).toContainText('Trả lời đúng 0/1');
  await page.reload();
  expect(await saved(page)).toMatchObject({ reviewStage: 0, reviewCount: 3 });
});

test('grade undo refuses a newer concurrent grade without replacing it', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /^Ôn 1 (thẻ|câu đến hạn)$/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last().click();
  await review.getByRole('button', { name: 'Dễ', exact: true }).click();
  await page.evaluate(() => {
    const key = 'toeic_progress_bundle_v3', bundle = JSON.parse(localStorage.getItem(key)!);
    bundle.mistakes[0].reviewCount = 8;
    localStorage.setItem(key, JSON.stringify(bundle));
  });
  await review.getByRole('button', { name: 'Hoàn tác chấm', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Thẻ đã thay đổi');
  expect((await saved(page)).reviewCount).toBe(8);
});
