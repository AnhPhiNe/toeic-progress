import { test, expect, type Page } from '@playwright/test';
import { gotoPage } from './helpers/nav';

type Card = Record<string, unknown>;
const KEY = 'toeic_progress_bundle_v3';

async function seed(page: Page, cards: Card[]) {
  await gotoPage(page, '/so-tay');
  await page.evaluate(({ cards, key }) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const now = new Date().toISOString();
    data.mistakes = cards.map(card => ({ category: 'OTHER', status: 'NEEDS_REVIEW', userMistake: '', answerSource: 'PROVIDED', tags: [],
      sourceTestName: 'Quick fixes', reviewStage: 1, reviewCount: 1, nextReviewDate: '2020-01-01', createdAt: now, updatedAt: now, deletedAt: null, ...card }));
    localStorage.setItem(key, JSON.stringify(data));
  }, { cards, key: KEY });
  await page.reload();
}

const part5: Card = { id: 'p5', part: 5, question: 'Reports should ____ submitted.', questionContext: 'Reports should ____ submitted.',
  options: ['(A) are', '(B) be', '(C) being', '(D) to be'], correctAnswer: '(B) be' };
const stage = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).mistakes[0].reviewStage, KEY);

test('desktop review keys: focus starts on the first option, 1–4 picks, Enter rates and never closes', async ({ page }) => {
  await seed(page, [part5]);
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await expect(review.getByRole('button', { name: /^\(A\)/ })).toBeFocused();
  // Enter on "Thoát" does not end the session.
  await review.getByRole('button', { name: /Thoát/ }).focus();
  await page.keyboard.press('Enter');
  await expect(review).toBeVisible();
  await page.keyboard.press('2');
  const understood = review.getByRole('button', { name: 'Hiểu rồi', exact: true });
  await expect(understood).toBeFocused();
  await page.keyboard.press('Enter');
  const done = page.getByRole('dialog', { name: 'Ôn xong', exact: true });
  await expect(done).toContainText('Hiểu rồi 1');
  await expect(done).toContainText('Ngày mai chưa có câu nào đến hạn');
  expect(await stage(page)).toBe(2);
});

test('desktop review: 0 rates "Vẫn chưa chắc"; a wrong pick shows one "Tiếp" that Enter presses', async ({ page }) => {
  await seed(page, [part5, { ...part5, id: 'p5b', question: 'Forms should ____ signed.', questionContext: 'Forms should ____ signed.' }]);
  await page.getByRole('button', { name: /^Ôn 2 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await page.keyboard.press('2');
  await page.keyboard.press('0');
  await expect(review).toContainText('2 / 2');
  await page.keyboard.press('1');
  await expect(review.getByRole('button', { name: 'Vẫn chưa chắc', exact: true })).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Hiểu rồi', exact: true })).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Tiếp', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const done = page.getByRole('dialog', { name: 'Ôn xong', exact: true });
  await expect(done).toContainText('Ôn lại ngày mai 2');
  await expect(done).toContainText('Ngày mai: 2 câu');
});

test('phone Part 7 review marks no evidence before answering, then marks it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const passage = 'Dear staff,\nThe cafeteria is closed this week. Employees may use the temporary food court in the lobby of Building B, which opens at 7. Thank you.';
  await seed(page, [{ id: 'p7', part: 7, questionNumber: 162, question: 'Where can employees eat this week?', context: passage,
    questionContext: `Where can employees eat this week?\n${passage}`,
    options: ['(A) In the cafeteria', '(B) In Building B', '(C) At home', '(D) Outside'], correctAnswer: '(B) In Building B',
    explanation: { quickTip: 'Tìm chữ "food court".', analysis: '', translation: '', questionType: '', evidence: 'food court in the lobby of Building B', paraphrase: '', keyVocabulary: '' } }]);
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  const passageBox = review.getByLabel('Đoạn văn của câu này');
  await expect(passageBox).toContainText('food court');
  await expect(passageBox.locator('mark')).toHaveCount(0);
  await review.getByRole('button', { name: /^B\s*In Building B/ }).click();
  await expect(passageBox.locator('mark')).toHaveText('food court in the lobby of Building B');
});

test('Listening card: the saved reason shows in the card and in review, with no repeated number heading or ((B))', async ({ page }) => {
  await seed(page, [{ id: 'p2', part: 2, questionNumber: 18, question: 'Câu 18', questionContext: 'Câu 18', correctAnswer: '(B)',
    userReason: 'Nghe nhầm "fair" thành "fare"' }]);
  await page.getByRole('button', { name: /Câu 18/ }).first().click();
  await expect(page.getByText('Nghe nhầm "fair" thành "fare"')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Câu 18', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await review.getByRole('button', { name: 'Xem đáp án', exact: true }).click();
  await expect(review.getByText('Nghe nhầm "fair" thành "fare"')).toBeVisible();
  await expect(review).not.toContainText('((B))');
  await expect(review.getByRole('heading', { name: 'Câu 18', exact: true })).toHaveCount(0);
});

for (const width of [1280, 390]) test(`Sổ tay review button holds 15 cards and says how many are left at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await seed(page, Array.from({ length: 20 }, (_, i) => ({ ...part5, id: `cap-${i}`, question: `Question ${i + 1} ____ ready.`, questionContext: `Question ${i + 1} ____ ready.` })));
  await page.getByRole('button', { name: 'Ôn 15 câu · còn 5', exact: false }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await expect(review).toContainText(width < 768 ? '1/15' : '1 / 15');
});
