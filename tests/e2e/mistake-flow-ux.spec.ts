import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers/nav';

// The old flow started from the Analytics card ("Chưa lưu thẻ ôn tập" + "Thêm câu sai") and a "Đang lọc đề" banner with a
// tailored empty state. Analytics and that banner are gone; what remains is the filtered empty state of the redesigned Sổ tay,
// which this test now covers.
test('a filter that matches no card shows an empty state that can be cleared', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3') || '{}');
    const stamp = '2026-10-09T09:00:00Z';
    const parts = { part1: 6, part2: 25, part3: 39, part4: 30, part5: 20, part6: 12, part7: 40 };
    const base = { skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, updatedAt: stamp, deletedAt: null, partScores: parts };
    data.sessions = [
      { ...base, id: 'sess-c', testName: 'ĐGNL Lần 6', date: '2026-10-12', createdAt: '2026-10-12T09:00:00Z', scaledListening: 380, scaledReading: 370, totalScore: 750 }
    ];
    data.mistakes = [
      { id: 'm1', createdAt: '2026-09-15T09:00:00Z', category: 'ADVANCED_GRAMMAR', sourceTestName: 'ETS 2024 Test 1', questionContext: 'Question 1', userMistake: 'A', correctAnswer: 'B', answerSource: 'PROVIDED', options: ['(A) a', '(B) b'], part: 5, status: 'LEARNING', interval: 1, repetition: 0, easeFactor: 2.5, dueDate: '2026-10-25', updatedAt: stamp, deletedAt: null },
      { id: 'm2', createdAt: '2026-09-16T09:00:00Z', category: 'VOCABULARY_TRAP', sourceTestName: 'ETS 2024 Test 1', questionContext: 'Question 2', userMistake: 'C', correctAnswer: 'D', answerSource: 'PROVIDED', options: ['(C) c', '(D) d'], part: 6, status: 'LEARNING', interval: 1, repetition: 0, easeFactor: 2.5, dueDate: '2026-10-25', updatedAt: stamp, deletedAt: null }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const rows = page.locator('.nb-row');
  await expect(rows).toHaveCount(2);

  await page.getByRole('button', { name: /^Lọc/ }).click();
  await page.getByRole('dialog', { name: 'Bộ lọc' }).getByRole('button', { name: 'Chưa gắn đề', exact: true }).click();
  await page.getByRole('dialog', { name: 'Bộ lọc' }).getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ lọc đề' })).toContainText('chưa gắn');
  await expect(page.getByText('Không có câu nào khớp bộ lọc.')).toBeVisible();
  await expect(rows).toHaveCount(0);

  await page.locator('.nb-none').getByRole('button', { name: 'Bỏ lọc', exact: true }).click();
  await expect(page.getByText('Không có câu nào khớp bộ lọc.')).toBeHidden();
  await expect(page.getByText('Question 1')).toBeVisible();
  await expect(page.getByText('Question 2')).toBeVisible();
});
