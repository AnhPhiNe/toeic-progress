import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) test(`overview resumes the right unfinished attempt at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    const session = (id: string, date: string) => ({ id, testName: 'Same source', date, skillType: 'LR', sessionType: 'FULL_TEST',
      durationMinutes: 120, totalScore: 700, createdAt: now, updatedAt: now, deletedAt: null });
    const draft = (id: string, sessionId: string, questionNumber: number) => ({ id, sessionId, questionNumber, part: 7,
      sourceTestName: 'Same source', question: '', questionContext: '', userMistake: '', correctAnswer: '', answerSource: 'MISSING',
      tags: [], category: 'OTHER', status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null });
    bundle.sessions = [session('earlier', '2026-10-20'), session('latest', '2026-10-23')];
    bundle.mistakes = [draft('earlier-card', 'earlier', 156), draft('latest-card', 'latest', 153),
      { ...draft('done-card', 'latest', 154), question: 'Who is speaking?', questionContext: 'Who is speaking?', correctAnswer: 'B', answerSource: 'PROVIDED' }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  });
  await page.reload();
  const resume = page.getByRole('button', { name: /Tiếp tục ghi chi tiết Same source/ });
  await expect(resume).toContainText('Còn 1 câu');
  await expect(resume).toContainText('23/10/2026');
  await expect(resume).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await resume.click();
  await expect(page).toHaveURL(/\/so-tay$/);
  const flow = page.getByRole('dialog');
  await expect(flow.getByRole('button', { name: /^Câu 153(?:\s|$)/ }).first()).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Câu 156(?:\s|$)/ })).toHaveCount(0);
  await expect(flow.getByRole('button', { name: /^Câu 154(?:\s|$)/ })).toHaveCount(0);
});
