import { test, expect } from '@playwright/test';

test('filtered review prioritizes the oldest overdue card and still supports reviewing a future card early', async ({ page }) => {
  await page.goto('/so-tay');
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
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS Test 1' });
  await page.getByRole('button', { name: 'Ôn 2 thẻ', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText(/Oldest overdue should/)).toBeVisible();
  await review.getByRole('button', { name: 'Đóng phiên ôn tập' }).click();
  const futureRow = page.getByRole('button', { name: 'Mở câu: Future should ____ submitted.', exact: true }).locator('..');
  await futureRow.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
  await page.getByRole('menuitem', { name: 'Ôn câu này', exact: true }).click();
  await expect(review.getByText(/Future should/)).toBeVisible();
  await expect(review.getByText('1 / 1', { exact: true })).toBeVisible();
});

const question = 'Part 5:\nReports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been';

test('source names survive repeated entry, filter with other criteria, and scope the due review', async ({ page }) => {
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('ETS 2024 Test 03');
  await page.getByRole('option', { name: '+ Thêm tên đề “ETS 2024 Test 03”', exact: true }).click();
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByLabel('Câu hỏi + phương án').fill(question);

  await modal.getByText('Đáp án đúng từ đề', { exact: false }).click();
  await modal.getByRole('button', { name: 'Đáp án từ đề: B' }).click();
  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await modal.getByRole('button', { name: 'Thêm lỗi tiếp' }).click();
  await expect(modal.getByLabel('Part', { exact: true })).toHaveValue('5');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toBeFocused();
  await expect(modal.locator('button[aria-label="Đáp án từ đề: B"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(modal.getByText('ETS 2024 Test 03', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('');
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('  ets 2024   test 03  ');
  await page.getByRole('option', { name: 'ETS 2024 Test 03', exact: true }).click();
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByLabel('Câu hỏi + phương án').fill(question.replace('Reports', 'Forms'));

  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  for (const sourceName of ['ETS 2023 Test 02', 'ETS 2021 Test 01']) {
    await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
    modal = page.getByRole('dialog');
    await expect(modal.getByLabel('Part', { exact: true })).toHaveValue('');
    await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
    await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill(sourceName);
    await page.getByRole('option', { name: `+ Thêm tên đề “${sourceName}”`, exact: true }).click();
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
    await modal.getByLabel('Câu hỏi + phương án').fill(question);

    await modal.getByText('Đáp án đúng từ đề', { exact: false }).click();
    await modal.getByRole('button', { name: 'Đáp án từ đề: B' }).click();
    await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
    await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  const examFilter = page.getByLabel('Đề', { exact: true });
  await expect(examFilter.getByRole('option')).toHaveCount(5);
  await examFilter.selectOption({ label: 'ETS 2024 Test 03' });
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Tất cả 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ôn 1 thẻ', exact: true })).toBeEnabled();
  await page.getByLabel('Part', { exact: true }).selectOption('7');
  await expect(page.getByText('Không có thẻ nào khớp bộ lọc.')).toBeVisible();
  await page.getByLabel('Part', { exact: true }).selectOption('ALL');
  await page.getByRole('button', { name: 'Ôn 1 thẻ', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ôn tập' }).getByText('1 / 1', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Ôn tập' }).getByRole('button', { name: 'Đóng phiên ôn tập', exact: true }).click();
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await examFilter.selectOption('NONE');
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(4);
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.map((m: { sourceTestName: string }) => m.sourceTestName));
  expect(names.filter((name: string) => name === 'ETS 2024 Test 03')).toHaveLength(2);
});

test('legacy linked mistakes inherit a required source and retain their review schedule', async ({ page }) => {
  await page.goto('/so-tay');
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
  await expect(page.getByText('ETS 2022 Test 01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Chọn đề', exact: true }).click();
  await expect(page.getByRole('option', { name: 'ETS 2022 Test 01', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Chưa gắn đề', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'ETS 2022 Test 01', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS 2022 Test 01' });
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ sessionId: 'legacy-session', sourceTestName: 'ETS 2022 Test 01', reviewStage: 3, reviewCount: 4, nextReviewDate: '2099-01-01' });
});
