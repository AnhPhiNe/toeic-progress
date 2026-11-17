import { test, expect, type Page } from '@playwright/test';

async function seedUnfinished(page: Page) {
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
}

test('the overview has no resume banner; Sổ tay lists the unfinished details on a computer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedUnfinished(page);
  await expect(page.getByRole('button', { name: /Tiếp tục ghi chi tiết/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Sổ tay/ }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  const pending = page.locator('.nb-pend');
  await expect(pending.first()).toContainText('Same source');
  await expect(pending.first()).toContainText('chưa ghi chi tiết');
  await expect(pending.first().getByRole('button', { name: 'Ghi chi tiết', exact: true })).toBeVisible();
});

test('on a phone Sổ tay names the unfinished details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedUnfinished(page);
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: /^Sổ tay/ }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('button', { name: /^Ghi chi tiết \d+ câu, Same source/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
