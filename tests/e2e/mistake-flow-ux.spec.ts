import { test, expect } from '@playwright/test';

test('Mistake notebook filtered empty state and analytics card UX flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Visit /phan-tich to ensure store structure is initialized
  await page.goto('/phan-tich');

  // 2. Seed data: "ĐGNL Lần 6" with 0 mistake notes, and "ETS 2024 Test 1" with 2 mistakes
  await page.evaluate(() => {
    let data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3') || '{}');
    if (!data || typeof data !== 'object') data = {};
    const stamp = '2026-10-09T09:00:00Z';
    const parts = { part1: 6, part2: 25, part3: 39, part4: 30, part5: 20, part6: 12, part7: 40 };
    const base = { skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, updatedAt: stamp, deletedAt: null, partScores: parts };

    data.sessions = [
      { ...base, id: 'sess-c', testName: 'ĐGNL Lần 6', date: '2026-10-12', createdAt: '2026-10-12T09:00:00Z', scaledListening: 380, scaledReading: 370, totalScore: 750 }
    ];
    data.mistakes = [
      { id: 'm1', createdAt: '2026-09-15T09:00:00Z', category: 'ADVANCED_GRAMMAR', sourceTestName: 'ETS 2024 Test 1', questionContext: 'Question 1', userMistake: 'A', correctAnswer: 'B', part: 5, status: 'LEARNING', interval: 1, repetition: 0, easeFactor: 2.5, dueDate: '2026-10-25', updatedAt: stamp, deletedAt: null },
      { id: 'm2', createdAt: '2026-09-16T09:00:00Z', category: 'VOCABULARY_TRAP', sourceTestName: 'ETS 2024 Test 1', questionContext: 'Question 2', userMistake: 'C', correctAnswer: 'D', part: 6, status: 'LEARNING', interval: 1, repetition: 0, easeFactor: 2.5, dueDate: '2026-10-25', updatedAt: stamp, deletedAt: null }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
    localStorage.setItem('toeic_onboarding_completed', 'true');
    localStorage.setItem('toeic_study_plan_onboarded', 'true');
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  // 3. VERIFY: Analytics card shows "Chưa lưu thẻ ôn tập" and "Thêm câu sai" button
  await expect(page.getByText('Chưa lưu thẻ ôn tập')).toBeVisible();
  await expect(page.getByText(/Đề sai/i)).toBeVisible();
  const addMistakeBtn = page.getByRole('button', { name: /Thêm câu sai/i }).first();
  await expect(addMistakeBtn).toBeVisible();

  // 4. Click "Thêm câu sai" -> Opens MistakeEntryModal with ĐGNL Lần 6 prefilled
  await addMistakeBtn.click();
  const modal = page.getByRole('dialog', { name: /Thêm câu sai/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: /Chọn đề/i })).toContainText('ĐGNL Lần 6');

  // Close modal to see the Notebook with the filter active
  await modal.getByRole('button', { name: 'Đóng' }).click();
  await expect(modal).toBeHidden();

  // 5. VERIFY Sổ tay shows:
  // a) Filter chip: "Đang lọc đề: ĐGNL Lần 6" with button "✕ Bỏ lọc"
  await expect(page.getByText(/Đang lọc đề:\s*ĐGNL Lần 6/i)).toBeVisible();
  const clearFilterBtn = page.getByRole('button', { name: '✕ Bỏ lọc' });
  await expect(clearFilterBtn).toBeVisible();

  // b) Informative Empty State with context:
  await expect(page.getByText('Chưa có câu sai nào thuộc đề "ĐGNL Lần 6"')).toBeVisible();
  await expect(page.getByText(/Toàn bộ sổ tay của bạn đang có 2 câu sai/i)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Thêm câu sai cho đề này' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem tất cả 2 câu' })).toBeVisible();

  // 6. Click "Xem tất cả 2 câu"
  await page.getByRole('button', { name: 'Xem tất cả 2 câu' }).click();

  // 7. VERIFY: Filter is cleared and cards are shown!
  await expect(page.getByText('Chưa có câu sai nào thuộc đề "ĐGNL Lần 6"')).toBeHidden();
  await expect(page.getByText('Question 1')).toBeVisible();
  await expect(page.getByText('Question 2')).toBeVisible();
});
