import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/lich-su');
  await page.evaluate(() => {
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.sessions = [{
      id: 'unrecorded', testName: 'ETS Chưa ghi giờ', skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-08',
      durationMinutes: 0, wrongQuestions: [3, 105], scoreSource: 'ESTIMATED', createdAt: stamp, updatedAt: stamp, deletedAt: null
    }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
}

const storedDuration = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions
  .find((item: { id: string }) => item.id === 'unrecorded').durationMinutes);

async function openEdit(page: Page) {
  await page.getByRole('button', { name: 'Sửa bản ghi ETS Chưa ghi giờ' }).first().click();
  const form = page.getByRole('dialog').first();
  await expect(form.locator('#session-test-name')).toHaveValue('ETS Chưa ghi giờ');
  return form;
}

test('editing a Full Test with no recorded duration keeps it unrecorded (0), never 120', async ({ page }) => {
  await seed(page);
  const form = await openEdit(page);
  await expect(form.locator('#session-duration')).toHaveValue('');
  await expect(form.locator('#session-duration')).toHaveAttribute('placeholder', 'Chưa ghi');
  await form.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await storedDuration(page)).toBe(0);
});

test('typing a duration while editing an unrecorded Full Test saves that value', async ({ page }) => {
  await seed(page);
  const form = await openEdit(page);
  await form.locator('#session-duration').fill('95');
  await form.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await storedDuration(page)).toBe(95);
});
