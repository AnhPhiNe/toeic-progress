import { test, expect } from '@playwright/test';

test('Part timing modal flow: presets, auto-calculation, direct manual input and chips display', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 950 });
  await page.addInitScript(() => {
    localStorage.setItem('toeic_onboarding_completed', 'true');
    localStorage.setItem('toeic_study_plan_onboarded', 'true');
  });
  await page.goto('/lich-su');
  await page.waitForLoadState('networkidle');

  // Open 'Ghi điểm'
  await page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await expect(form).toBeVisible();

  // Test name
  await form.locator('#session-test-name').fill('Test Phân Bổ Thời Gian');

  // 1. Initial State: Click "Thời gian Part 5 – 7"
  const timeBtn = form.getByRole('button', { name: /Thời gian Part 5 – 7/i });
  await expect(timeBtn).toBeVisible();
  await timeBtn.click();

  // 2. Dialog is visible
  const timingDialog = page.getByRole('dialog', { name: /Phân bổ thời gian Part 5 – 7/i });
  await expect(timingDialog).toBeVisible();

  // Verify all 3 cards have "phút" label
  const phutLabels = timingDialog.getByText('phút', { exact: true });
  await expect(phutLabels).toHaveCount(3);

  // 3. Click preset "Gấp: 18 - 10 - 47"
  await timingDialog.getByRole('button', { name: 'Gấp: 18 - 10 - 47' }).click();

  // 4. Click "Áp dụng thời gian"
  await timingDialog.getByRole('button', { name: 'Áp dụng thời gian' }).click();
  await expect(timingDialog).toBeHidden();

  // 5. Verify 3 chips are visible on the score card: 18p, 10p, 47p
  await expect(form.getByText('18p')).toBeVisible();
  await expect(form.getByText('10p')).toBeVisible();
  await expect(form.getByText('47p')).toBeVisible();

  // 6. Click edit button ✏️
  const editBtn = form.getByTitle('Chỉnh sửa phân bổ thời gian');
  await editBtn.click();
  await expect(timingDialog).toBeVisible();

  // 7. Manually change Part 7 input to 50
  const inputs = timingDialog.locator('input[type="number"]');
  await expect(inputs).toHaveCount(3);
  await inputs.nth(2).fill('50');

  // 8. Apply updated time
  await timingDialog.getByRole('button', { name: 'Áp dụng thời gian' }).click();
  await expect(timingDialog).toBeHidden();

  // 9. Verify updated chip: 50p
  await expect(form.getByText('18p')).toBeVisible();
  await expect(form.getByText('10p')).toBeVisible();
  await expect(form.getByText('50p')).toBeVisible();
});
