import { test, expect, type Page } from '@playwright/test';

async function editPractice(page: Page, name: string, phone: boolean) {
  if (phone) {
    await page.getByRole('button', { name: new RegExp(`^Xem chi tiết ${name}`) }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sửa kết quả', exact: true }).click();
  } else {
    await page.getByRole('button', { name: `Sửa bản ghi ${name}`, exact: true }).click();
  }
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
    await page.reload();
    const phone = width < 768;
    let editor = await editPractice(page, 'Legacy mini practice', phone);
    await expect(editor.getByLabel('Số câu đúng Part 7', { exact: true })).toHaveValue('4');
    await editor.locator('#session-test-name').fill('Renamed mini practice');
    await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((row: { id: string }) => row.id === 'legacy-mini-practice'));
    expect(await stored()).toMatchObject({ testName: 'Renamed mini practice', practiceParts: [{ part: 7, correct: 4, total: 5 }], notes: 'Original notes', durationMinutes: 8 });
    // Reopen the persisted row, then change only the numerator.
    await page.reload();
    editor = await editPractice(page, 'Renamed mini practice', phone);
    await editor.getByLabel('Số câu đúng Part 7', { exact: true }).fill('5');
    await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(await stored()).toMatchObject({ practiceParts: [{ part: 7, correct: 5, total: 5 }], notes: 'Original notes', durationMinutes: 8 });
    await page.reload();
    expect(await stored()).toMatchObject({ practiceParts: [{ part: 7, correct: 5, total: 5 }] });
  });
}
