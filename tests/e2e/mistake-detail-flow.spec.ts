import { expect, test, type Page } from '@playwright/test';

/** Logs "ETS Detail" on a phone with three wrong questions and opens the detail flow from the result screen. */
async function logTest(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await form.locator('#session-test-name').fill('ETS Detail');
  await form.getByRole('button', { name: 'Gõ số câu thay vì chạm', exact: true }).click();
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 107 151');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết câu sai ›', exact: true }).click();
  return page.getByRole('dialog', { name: /^Ghi câu sai/ });
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .filter((card: { sourceTestName?: string; deletedAt?: string | null }) => card.sourceTestName === 'ETS Detail' && !card.deletedAt));

test('wrong questions are filled in one after another and leave the pending group once complete', async ({ page }) => {
  const flow = await logTest(page);
  await expect(flow.getByRole('heading', { name: 'Ghi câu sai · 1/3' })).toBeVisible();
  await expect(flow.getByText('Câu 3 · Part 1 · ETS Detail', { exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu · câu tiếp ›', exact: true }).click();
  await expect(flow.getByRole('alert')).toContainText('Điền ít nhất một mục');
  await flow.getByRole('button', { name: 'Bỏ qua', exact: true }).click();

  await expect(flow.getByText('Câu 107 · Part 5 · ETS Detail', { exact: true })).toBeVisible();
  await flow.getByLabel(/^Câu hỏi/).fill('She has exceeded her targets every quarter _____ transferring.\n(A) until\n(B) since\n(C) upon\n(D) onto');
  await expect(flow.getByText('✓ Đã tách 4 phương án', { exact: true })).toBeVisible();
  const chose = flow.getByRole('group', { name: /Bạn chọn/ }), right = flow.getByRole('group', { name: /Đáp án đúng/ });
  await chose.getByRole('button', { name: 'B', exact: true }).click();
  await right.getByRole('button', { name: 'B', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu · câu tiếp ›', exact: true }).click();
  await expect(flow.getByRole('alert')).toContainText('trùng đáp án đúng');
  await chose.getByRole('button', { name: 'A', exact: true }).click();
  await flow.getByRole('button', { name: 'Ngữ pháp', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu · câu tiếp ›', exact: true }).click();

  await expect(flow.getByRole('heading', { name: 'Ghi câu sai · 3/3' })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  const card = (await stored(page)).find((item: { questionNumber: number }) => item.questionNumber === 107);
  expect(card).toMatchObject({ part: 5, options: ['(A) until', '(B) since', '(C) upon', '(D) onto'], userChoice: 'A', userChoiceState: 'CHOSEN',
    correctAnswer: '(B) since', answerSource: 'PROVIDED', category: 'ADVANCED_GRAMMAR' });
  expect(card.question).toContain('every quarter _____ transferring');

  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi chi tiết' })).toContainText('Đã ghi chi tiết 1 câu');
  const pending = page.getByRole('region', { name: 'Chưa ghi chi tiết · 2' });
  await expect(pending).toBeVisible();
  // One row per test, not one per question.
  await expect(pending.getByRole('button', { name: /^Ghi chi tiết/ })).toHaveCount(1);
  await expect(pending.getByText('2 câu sai', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cần ôn · 1' })).toBeVisible();

  // The test's row opens the flow at its first pending card; the full form is one tap away.
  await pending.getByRole('button', { name: 'Ghi chi tiết 2 câu, ETS Detail', exact: true }).click();
  await expect(flow.getByText('Câu 3 · Part 1 · ETS Detail', { exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Form đầy đủ', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await expect(page.locator('#mistake-paste')).toBeVisible();
});

test('the pending group starts the flow for all its cards', async ({ page }) => {
  const flow = await logTest(page);
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu, ETS Detail', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Ghi câu sai · 1/3' })).toBeVisible();
  await flow.getByRole('group', { name: /Bạn chọn/ }).getByRole('button', { name: 'Mình bỏ trống câu này', exact: true }).click();
  await flow.getByRole('group', { name: /Đáp án đúng/ }).getByRole('button', { name: 'C', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu · câu tiếp ›', exact: true }).click();
  const card = (await stored(page)).find((item: { questionNumber: number }) => item.questionNumber === 3);
  // Answers alone keep the card pending until it has a question to review.
  expect(card).toMatchObject({ userChoiceState: 'BLANK', userMistake: 'Bỏ trống', correctAnswer: '(C)', answerSource: 'PROVIDED' });
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Chưa ghi chi tiết · 3' })).toBeVisible();
});
