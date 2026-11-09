import { test, expect } from '@playwright/test';
import { openManualEntry } from './helpers/manualEntry';

test('entering official score stays on the 200-question grid and saves directly', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 950 });
  await page.addInitScript(() => {
    localStorage.setItem('toeic_onboarding_completed', 'true');
    localStorage.setItem('toeic_study_plan_onboarded', 'true');
  });
  await page.goto('/lich-su');
  await page.waitForLoadState('networkidle');

  // Open 'Ghi điểm'
  await page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await expect(form).toBeVisible();

  // Test name
  await form.locator('#session-test-name').fill('Test Lưu Điểm Trực Tiếp');
  await openManualEntry(page, form);

  // Click "+ Nhập ›" on "Điểm từ đề thi"
  const enterScoreBtn = form.getByRole('button', { name: /Điểm từ đề thi/i });
  await enterScoreBtn.click();

  // Wait for ResultScoreReview modal
  const reviewDialog = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh' });
  await expect(reviewDialog).toBeVisible();

  // Enter Listening 450, Reading 450
  const lInput = reviewDialog.getByLabel(/Listening/i);
  const rInput = reviewDialog.getByLabel(/Reading/i);
  await lInput.fill('450');
  await rInput.fill('450');

  // Click "Áp dụng điểm từ đề"
  await reviewDialog.getByRole('button', { name: 'Áp dụng điểm từ đề' }).click();

  // 1. VERIFY: ResultScoreReview is closed
  await expect(reviewDialog).toBeHidden();

  // 2. VERIFY: The 200-question grid is STILL MOUNTED and visible!
  // It must NOT show Hình 1 (the manual input form with 'Điểm Listening /495' input)!
  await expect(form.getByRole('button', { name: 'Câu 200', exact: true })).toBeVisible();
  await expect(form.getByLabel('Điểm Listening /495')).toHaveCount(0);

  // 3. VERIFY: Score Card shows 900, L 450, R 450, and 'Điểm từ đề thi'
  await expect(form.getByText('Điểm từ đề thi').first()).toBeVisible();
  await expect(form.getByText('Chính thức', { exact: true })).toBeVisible();
  await expect(form.getByText('900', { exact: true })).toBeVisible();
  await expect(form.getByText('L 450')).toBeVisible();
  await expect(form.getByText('R 450')).toBeVisible();

  // 4. Mark some wrong questions on the grid
  await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await form.getByRole('button', { name: 'Câu 101', exact: true }).click();
  await expect(form.getByText('2 câu sai trên đề')).toBeVisible();

  // 5. Capture screenshot of this awesome live state!
  await page.screenshot({ path: 'C:/Users/A Fee/.gemini/antigravity/brain/967192ac-13f3-4a0e-9091-d141833aec36/screenshots/live_applied_score_on_grid.png' });

  // 6. Click "Lưu điểm" directly on the grid!
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();

  // 7. Verify modal closes and session saved
  await expect(form).toBeHidden();

  const savedSession = await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3') || '{}');
    return (bundle.sessions || []).find((s: any) => s.testName === 'Test Lưu Điểm Trực Tiếp');
  });

  expect(savedSession).toBeTruthy();
  expect(savedSession.totalScore).toBe(900);
  expect(savedSession.scaledListening).toBe(450);
  expect(savedSession.scaledReading).toBe(450);
  expect(savedSession.scoreSource).toBe('MANUAL_SECTIONS');
  expect(savedSession.wrongQuestions).toEqual([3, 101]);
});
