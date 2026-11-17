import { test, expect } from '@playwright/test';
import { PHONE_VIEWPORT, noteModal, openAnswerKey, openCardEditor, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

/** Computers' Sổ tay filter popover ("Lọc"): picks a chip by its name. */
async function pickFilter(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: /^Lọc/ }).click();
  const filter = page.getByRole('dialog', { name: 'Bộ lọc' });
  await filter.getByRole('button', { name, exact: true }).click();
  await filter.getByRole('button', { name: 'Xong', exact: true }).click();
}

test('filtered review prioritizes the oldest overdue card', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [
      ['recent', 'Recent should ____ submitted.', '2001-01-01'],
      ['oldest', 'Oldest overdue should ____ submitted.', '2000-01-01'],
      ['future', 'Future should ____ submitted.', '2099-01-01'],
    ].map(([id, questionContext, nextReviewDate]) => ({ id, questionContext, nextReviewDate,
      part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', options: ['(A) are', '(B) be'],
      userMistake: '', correctAnswer: '(B) be', answerSource: 'PROVIDED', tags: [], sourceTestName: 'ETS Test 1',
      createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await pickFilter(page, 'ETS Test 1');
  await page.getByRole('button', { name: /^Ôn 2 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai' });
  await expect(review.getByText(/Oldest overdue should/)).toBeVisible();
  await expect(review.getByText('1 / 2', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /Thoát/ }).click();
  // Removed with the redesign: starting a review early for a card that is not due yet (the card page offers "Ôn câu này" only when due).
});

const question = 'Part 5:\nReports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been';

test('source names survive repeated entry, filter with other criteria, and scope the due review', async ({ page }) => {
  // Notes are typed on a phone; the filters are on computers.
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  let modal = await openNoteForm(page);
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('ETS 2024 Test 03');
  await page.getByRole('option', { name: '+ Thêm tên đề “ETS 2024 Test 03”', exact: true }).click();
  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question);

  await openAnswerKey(modal);
  await modal.getByRole('button', { name: 'Đáp án từ đề: B' }).click();
  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await modal.getByRole('button', { name: 'Thêm câu tiếp' }).click();
  await expect(modal.getByRole('button', { name: 'Part 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toBeFocused();
  await expect(modal.locator('button[aria-label="Đáp án từ đề: B"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(modal.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText('ETS 2024 Test 03');
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('');
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('  ets 2024   test 03  ');
  await page.getByRole('option', { name: 'ETS 2024 Test 03', exact: true }).click();
  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question.replace('Reports', 'Forms'));

  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  for (const sourceName of ['ETS 2023 Test 02', 'ETS 2021 Test 01']) {
    modal = await openNoteForm(page);
    await expect(modal.getByRole('group', { name: 'Part', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
    await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill(sourceName);
    await page.getByRole('option', { name: `+ Thêm tên đề “${sourceName}”`, exact: true }).click();
    await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
    await modal.getByLabel('Câu hỏi + phương án').fill(question);

    await openAnswerKey(modal);
    await modal.getByRole('button', { name: 'Đáp án từ đề: B' }).click();
    await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
    await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  const rows = page.locator('.nb-row');
  await page.getByRole('button', { name: /^Lọc/ }).click();
  const filter = page.getByRole('dialog', { name: 'Bộ lọc' });
  // "Tất cả", the three tests and "Chưa gắn đề".
  await expect(filter.locator('.nb-cs').first().getByRole('button')).toHaveCount(5);
  await filter.getByRole('button', { name: 'ETS 2024 Test 03', exact: true }).click();
  await filter.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Tất cả\s*2$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ôn 1 câu/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Lọc/ }).click();
  // Only Part 5 cards exist, so the Part filter offers just "5"; combined with the test it still leaves the same two cards.
  await expect(filter.getByRole('button', { name: '7', exact: true })).toHaveCount(0);
  await filter.getByRole('button', { name: '5', exact: true }).click();
  await expect(filter).toContainText('2 câu khớp');
  await filter.getByRole('button', { name: 'Xong', exact: true }).click();
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  await expect(page.getByRole('dialog', { name: 'Ôn câu sai' }).getByText('1 / 1', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Ôn câu sai' }).getByRole('button', { name: /Thoát/ }).click();
  await page.getByRole('button', { name: /^Lọc/ }).click();
  await filter.getByRole('button', { name: 'Chưa gắn đề', exact: true }).click();
  await filter.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await page.locator('.nb-none').getByRole('button', { name: 'Bỏ lọc', exact: true }).click();
  await expect(rows).toHaveCount(4);
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((m: { sourceTestName: string }) => m.sourceTestName));
  expect(names.filter((name: string) => name === 'ETS 2024 Test 03')).toHaveLength(2);
});

test('legacy linked mistakes inherit a required source and retain their review schedule', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions = [{ id: 'legacy-session', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS 2022 Test 01',
      date: '2026-10-08', durationMinutes: 120, createdAt: now, updatedAt: now, deletedAt: null }];
    data.mistakes = [{ id: 'legacy-card', sessionId: 'legacy-session', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: 'Reports should ____ submitted.', options: ['(A) are', '(B) be', '(C) were', '(D) been'],
      userMistake: '', correctAnswer: '(B) be', answerSource: 'PROVIDED', tags: [], reviewStage: 3, reviewCount: 4,
      nextReviewDate: '2099-01-01', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('.nb-row')).toContainText('ETS 2022 Test 01');
  const modal = await openCardEditor(page);
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await expect(page.getByRole('option', { name: 'ETS 2022 Test 01', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Chưa gắn đề', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'ETS 2022 Test 01', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(noteModal(page)).toHaveCount(0);
  await page.reload();
  await pickFilter(page, 'ETS 2022 Test 01');
  await expect(page.locator('.nb-row')).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ sessionId: 'legacy-session', sourceTestName: 'ETS 2022 Test 01', reviewStage: 3, reviewCount: 4, nextReviewDate: '2099-01-01' });
});
