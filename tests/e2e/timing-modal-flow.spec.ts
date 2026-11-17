import { test, expect } from '@playwright/test';
import { openGridForm } from './helpers/sessionForm';

// Phones (<768px) log a Full Test through the full-screen PhoneLogger, covered in phone-session-form.spec.ts.
for (const width of [1280]) {
  test(`actual Part time records only known values, preserves decimals, and isolates Escape at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/lich-su');
    await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
    await page.reload();
const form = await openGridForm(page);
    await form.locator('#session-test-name').fill('QA actual Part time');
    await form.getByRole('heading', { name: 'Ghi điểm' }).click();
    // Record an actual wrong answer so saving does not invoke the separate
    // 990-point confirmation (Playwright dismisses unhandled native dialogs).
    await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
    await form.getByRole('button', { name: /Thời gian Part 5 – 7/ }).click();
    const timing = page.getByRole('dialog', { name: 'Thời gian thực tế Part 5 – 7', exact: true });
    for (const part of [5, 6, 7]) await expect(timing.getByLabel(`Thời gian Part ${part} (phút)`, { exact: true })).toBeEmpty();
    await timing.getByLabel('Thời gian Part 5 (phút)', { exact: true }).fill('18.5');
    await expect(timing.getByLabel('Thời gian Part 7 (phút)', { exact: true })).toBeEmpty();
    await timing.getByRole('button', { name: 'Áp dụng thời gian', exact: true }).click();
    await expect(form.getByText('18.5p', { exact: true })).toBeVisible();
    await expect(form.getByText('Tổng 75p', { exact: true })).toHaveCount(0);
    await form.getByRole('button', { name: 'Chỉnh sửa thời gian thực tế', exact: true }).click();
    await timing.getByLabel('Thời gian Part 6 (phút)', { exact: true }).fill('-1');
    await timing.getByRole('button', { name: 'Áp dụng thời gian', exact: true }).click();
    await expect(timing.getByRole('alert')).toContainText('0 đến 1440');
    await page.keyboard.press('Escape');
    await expect(timing).toHaveCount(0);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
    await expect(form).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((row: { testName: string }) => row.testName === 'QA actual Part time')?.partDurations)).toEqual({ part5: 18.5 });
  });
}
