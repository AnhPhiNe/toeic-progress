import { expect, test, type Page } from '@playwright/test';

/** Logs "ETS Detail" on a phone with one Listening and three Reading wrong questions; only the Reading ones get cards. */
async function logTest(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await form.locator('#session-test-name').fill('ETS Detail');
  await form.getByRole('button', { name: 'Gõ số câu thay vì chạm', exact: true }).click();
  await form.getByLabel('Số câu sai', { exact: true }).fill('3 103 107 151');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết câu sai ›', exact: true }).click();
  return page.getByRole('dialog', { name: /^Ghi câu sai/ });
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .filter((card: { sourceTestName?: string; deletedAt?: string | null }) => card.sourceTestName === 'ETS Detail' && !card.deletedAt));

test('on a phone the wrong questions are one list; answers and reasons are filled in and saved together', async ({ page }) => {
  const flow = await logTest(page);
  await expect(flow.getByRole('heading', { name: 'Ghi câu sai', exact: true })).toBeVisible();
  await expect(flow.getByText('ETS Detail · 3 câu Reading', { exact: true })).toBeVisible();
  // Listening question 3 gets no card; the Reading ones are listed by Part.
  await expect(flow.locator('[data-row-toggle]')).toHaveText(['Câu 103', 'Câu 107', 'Câu 151']);
  await expect(flow.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();

  // Without a screenshot, opening a question offers the answer pickers.
  await flow.getByRole('button', { name: 'Câu 107', exact: true }).click();
  await flow.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'B', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'B', exact: true }).click();
  await flow.getByLabel('Vì sao sai câu 107').selectOption('ADVANCED_GRAMMAR');
  await flow.getByRole('button', { name: 'Lưu 1 câu', exact: true }).click();
  await expect(flow.getByRole('alert')).toHaveText('Câu 107: Đáp án bạn chọn trùng đáp án đúng.');
  await flow.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'A', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Câu 107 Bạn chọn A, đáp án B', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 1 câu', exact: true }).click();

  await expect(flow).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Đã ghi chi tiết' })).toContainText('Đã ghi chi tiết 1 câu');
  const card = (await stored(page)).find((item: { questionNumber: number }) => item.questionNumber === 107);
  expect(card).toMatchObject({ part: 5, userChoice: 'A', userChoiceState: 'CHOSEN', correctAnswer: '(B)', answerSource: 'PROVIDED', category: 'ADVANCED_GRAMMAR' });
  // Without its question the card waits in the pending group; one row per test, not one per question.
  const pending = page.getByRole('region', { name: 'Chưa ghi chi tiết · 3' });
  await expect(pending.getByRole('button', { name: /^Ghi chi tiết/ })).toHaveCount(1);
  await expect(pending.getByText('3 câu Reading sai', { exact: true })).toBeVisible();
});

test('the pending group restores unsaved filled rows after closing on a phone', async ({ page }) => {
  const flow = await logTest(page);
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu, ETS Detail', exact: true }).click();
  await expect(flow.locator('[data-row-toggle]')).toHaveCount(3);
  await flow.getByLabel('Vì sao sai câu 151').selectOption('TIME_PRESSURE');
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu, ETS Detail', exact: true }).click();
  await expect(flow).toBeVisible();
  await expect(flow.getByLabel('Vì sao sai câu 151')).toHaveValue('TIME_PRESSURE');
});
