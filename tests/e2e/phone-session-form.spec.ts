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

test('phone Part practice adds and drops rows from the Part buttons and defaults to 30 minutes', async ({ page }) => {
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'Luyện Part', exact: true }).click();
  await expect(dialog.getByText('Hôm nay · 30 phút')).toBeVisible();
  await dialog.getByRole('button', { name: 'Part 6', exact: true }).click();
  await dialog.getByLabel('Số câu đúng Part 5').fill('24');
  await dialog.getByLabel('Số câu đúng Part 6').fill('14');
  await expect(dialog.getByText('83%', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Part 5', exact: true }).click();
  await expect(dialog.getByLabel('Số câu đúng Part 5')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.at(-1));
  expect(saved).toMatchObject({ sessionType: 'PART_PRACTICE', durationMinutes: 30, practiceParts: [{ part: 6, correct: 14, total: 16 }] });
});
