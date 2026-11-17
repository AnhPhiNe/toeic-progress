import { test, expect, type Locator, type Page } from '@playwright/test';
import { openPracticeEdit } from './helpers/sessionForm';

// A Part practice is edited from its row under "Mẻ bánh gần đây" on Luyện tập (a sheet behind the clock button on phones).
async function editPractice(page: Page, rowTitle: string) {
  await openPracticeEdit(page, rowTitle);
  return page.getByRole('dialog', { name: 'Sửa kết quả', exact: true });
}

for (const width of [1280, 375]) {
  test(`legacy practice denominator survives name and correct-count edits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/lich-su');
    await page.evaluate(() => {
      const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      localStorage.setItem('toeic_onboarding_done_v1', 'true');
      bundle.sessions = [{ id: 'legacy-mini-practice', skillType: 'LR', sessionType: 'PART_PRACTICE',
        testName: 'Legacy mini practice', date: '2026-10-09', durationMinutes: 8, totalScore: 0,
        practiceParts: [{ part: 7, correct: 4, total: 5 }], notes: 'Original notes',
        createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:00:00Z', deletedAt: null }];
      localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    });
    await page.goto('/luyen-toc-do');
    let editor = await editPractice(page, 'Part 7 · 1 sai');
    // Computers count wrong answers (4 of 5 correct reads as 1 wrong); the phone edit form still counts correct ones.
    const phone = width < 768;
    const count = (current: Locator) => current.getByLabel(phone ? 'Số câu đúng Part 7' : 'Số câu sai Part 7', { exact: true });
    await expect(count(editor)).toHaveValue(phone ? '4' : '1');
    await (phone ? editor.locator('#session-test-name') : editor.getByLabel('Tên đề hoặc nguồn', { exact: true })).fill('Renamed mini practice');
    await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((row: { id: string }) => row.id === 'legacy-mini-practice'));
    expect(await stored()).toMatchObject({ testName: 'Renamed mini practice', practiceParts: [{ part: 7, correct: 4, total: 5 }], notes: 'Original notes', durationMinutes: 8 });
    // Reopen the persisted row, then change only the numerator.
    await page.reload();
    editor = await editPractice(page, 'Part 7 · 1 sai');
    await count(editor).fill(phone ? '5' : '0');
    await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(await stored()).toMatchObject({ practiceParts: [{ part: 7, correct: 5, total: 5 }], notes: 'Original notes', durationMinutes: 8 });
    await page.reload();
    expect(await stored()).toMatchObject({ practiceParts: [{ part: 7, correct: 5, total: 5 }] });
  });
}
