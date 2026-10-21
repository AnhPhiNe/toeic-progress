import { expect, test } from '@playwright/test';

async function openForm(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  return page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
}

test('phone Full Test entry walks through every Part from one run of digits and saves the estimate', async ({ page }) => {
  const dialog = await openForm(page);
  await dialog.locator('#session-test-name').fill('ETS Phone');
  await dialog.getByRole('button', { name: 'Số câu đúng mỗi Part', exact: true }).click();
  await dialog.getByLabel('Số câu đúng Part 1').click();
  // 6 | 23 | 36 | 27 | 28 | 15 | 45: each box hands over once no further digit fits.
  await page.keyboard.type('623362');
  // Listening only: Reading and the total wait instead of showing the scale floor.
  const card = dialog.locator('[aria-live="polite"]').first();
  await expect(card).toContainText('R —');
  await expect(card.getByText('—', { exact: true }).first()).toBeVisible();
  await page.keyboard.type('7281545');
  await expect(dialog.getByLabel('Số câu đúng Part 7')).toHaveValue('45');
  await expect(dialog.getByText('92 / 100', { exact: true })).toBeVisible();
  await expect(dialog.getByText('88 / 100', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.at(-1));
  expect(saved).toMatchObject({ testName: 'ETS Phone', rawListening: 92, rawReading: 88, durationMinutes: 120,
    partScores: { part1: 6, part2: 23, part3: 36, part4: 27, part5: 28, part6: 15, part7: 45 } });
});

test('phone Full Test is logged by its wrong questions, which become draft notebook cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [{ id: 'old', testName: 'ETS 2024 Test 03', skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-01', durationMinutes: 120,
      createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', deletedAt: null, totalScore: 800, scaledListening: 400, scaledReading: 400, scoreSource: 'MANUAL_SECTIONS' }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const dialog = await openForm(page);
  await expect(dialog.locator('#session-test-name')).toHaveValue('ETS 2024 Test 04');
  const card = dialog.locator('[aria-live="polite"]').first();
  await expect(card).toContainText('R —');
  await dialog.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await dialog.getByRole('button', { name: /^Part 5/ }).click();
  await dialog.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await dialog.getByRole('button', { name: 'Câu 113', exact: true }).click();
  await dialog.getByRole('button', { name: 'Câu 113', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Part 5, 1 câu sai', exact: true })).toBeVisible();
  await expect(card).toContainText('2 câu sai');
  // Typing replaces the marks: "3" stays, 107 goes, a range is added.
  await dialog.getByRole('button', { name: 'Gõ số câu thay vì chạm', exact: true }).click();
  await expect(dialog.getByLabel('Số câu sai', { exact: true })).toHaveValue('3 107');
  await dialog.getByLabel('Số câu sai', { exact: true }).fill('3 abc');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('abc');
  await dialog.getByLabel('Số câu sai', { exact: true }).fill('3, 151-153');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(card).toContainText('4 câu sai');
  await dialog.getByRole('button', { name: 'Lưu điểm', exact: true }).click();

  const result = page.getByRole('dialog', { name: 'Đã lưu', exact: true });
  await expect(result.getByText('196/200', { exact: true })).toBeVisible();
  await expect(result.getByText('3 câu Reading sai đã vào Sổ tay.', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  const session = stored.sessions.find((item: { testName: string }) => item.testName === 'ETS 2024 Test 04');
  expect(session).toMatchObject({ wrongQuestions: [3, 151, 152, 153], scoreSource: 'ESTIMATED',
    partScores: { part1: 5, part2: 25, part3: 39, part4: 30, part5: 30, part6: 16, part7: 51 } });
  const drafts = stored.mistakes.filter((item: { sessionId?: string; deletedAt?: string | null }) => item.sessionId === session.id && !item.deletedAt);
  expect(drafts.map((item: { questionNumber: number; part: number }) => [item.questionNumber, item.part]).sort((a: number[], b: number[]) => a[0] - b[0]))
    .toEqual([[151, 7], [152, 7], [153, 7]]);
  await result.getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(result).toHaveCount(0);
});

test('phone asks before saving a test with no wrong questions', async ({ page }) => {
  const dialog = await openForm(page);
  await dialog.locator('#session-test-name').fill('Perfect run');
  let asked = '';
  page.once('dialog', prompt => { asked = prompt.message(); void prompt.dismiss(); });
  await dialog.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  expect(asked).toContain('990');
  await expect(dialog).toBeVisible();
});

test('phone Part practice adds and drops rows from the Part buttons and defaults to 30 minutes', async ({ page }) => {
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'Luyện Part', exact: true }).click();
  await expect(dialog.getByText('Hôm nay · 30 phút')).toBeVisible();
  await dialog.getByRole('button', { name: 'Part 6', exact: true }).click();
  await dialog.getByLabel('Số câu đúng Part 5').fill('24');
  await dialog.getByLabel('Số câu đúng Part 6').fill('14');
  await expect(dialog.getByLabel('Số câu đúng Part 5')).toHaveValue('24');
  await expect(dialog.getByLabel('Số câu đúng Part 6')).toHaveValue('14');
  await dialog.getByRole('button', { name: 'Part 5', exact: true }).click();
  await expect(dialog.getByLabel('Số câu đúng Part 5')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.at(-1));
  expect(saved).toMatchObject({ sessionType: 'PART_PRACTICE', durationMinutes: 30, practiceParts: [{ part: 6, correct: 14, total: 16 }] });
});
