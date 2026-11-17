import { expect, test, type Locator, type Page } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';
import { openGridForm } from './helpers/sessionForm';

async function expectFocusWithin(page: Page, dialog: Locator, steps = 16) {
  for (let index = 0; index < steps; index++) {
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
}

for (const close of ['Escape', 'Back'] as const) {
  test(`nested settings isolates focus and ${close} dismisses only the edit sheet`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/lich-su');
    await openSettings(page);
    const settings = page.getByRole('dialog', { name: 'Cài đặt', exact: true, includeHidden: true });
    await settings.getByRole('button', { name: /^Điểm mục tiêu/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Mục tiêu của bạn', exact: true });
    await expectFocusWithin(page, sheet);
    await expect.poll(() => settings.evaluate(node => !!node.closest('[inert]'))).toBe(true);
    if (close === 'Escape') await page.keyboard.press('Escape'); else await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect.poll(() => settings.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    expect(await page.locator('body').evaluate(node => node.style.overflow)).not.toBe('hidden');
    // The sheet that opened Cài đặt closes with it, so focus cannot return to a control; it must at least stay on the page.
    expect(await page.evaluate(() => !!document.activeElement?.isConnected)).toBe(true);
  });
}

// Phones use the PhoneLogger, whose score review lives in its own wrong-question step.
for (const width of [1280]) {
  test(`source score dialog blocks the question grid and retains corrections on close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 480 : 750 });
    await page.goto('/lich-su');
    await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
    await page.reload();
    const form = await openGridForm(page);
    await form.locator('#session-test-name').fill('QA modal score');
    await form.getByRole('heading', { name: 'Ghi điểm' }).click();
    const wrong = form.getByRole('button', { name: 'Câu 3', exact: true, includeHidden: true });
    await wrong.scrollIntoViewIfNeeded();
    await wrong.evaluate(node => { (window as unknown as { qaGridClicks: number }).qaGridClicks = 0; node.addEventListener('click', () => (window as unknown as { qaGridClicks: number }).qaGridClicks++); });
    await form.getByRole('button', { name: /Điểm từ đề thi|Nhập điểm từ đề/ }).first().click();
    let review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh', exact: true });
    await review.getByLabel('Điểm từ ảnh: Listening').fill('400');
    await review.getByLabel('Điểm từ ảnh: Reading').fill('350');
    await expectFocusWithin(page, review);
    const bounds = await review.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect.poll(() => wrong.evaluate(node => !!node.closest('[inert]'))).toBe(true);
    const under = await wrong.boundingBox();
    const point = { x: under!.x + under!.width / 2, y: Math.max(1, Math.min(page.viewportSize()!.height - 1, under!.y + under!.height / 2)) };
    // On a short phone viewport the panel covers the grid. Tap the dimmed margin,
    // not a panel action that happens to overlap the grid's old coordinates.
    if (point.x >= bounds!.x && point.x <= bounds!.x + bounds!.width
      && point.y >= bounds!.y && point.y <= bounds!.y + bounds!.height) point.x = 4;
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => (window as unknown as { qaGridClicks: number }).qaGridClicks)).toBe(0);
    // A backdrop click may dismiss the panel; both it and Escape must preserve its candidate.
    if (await review.count()) await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: /Kiểm tra điểm chưa áp dụng|Điểm từ đề: Cần kiểm tra/ }).click();
    review = page.getByRole('dialog', { name: 'Kiểm tra điểm từ ảnh', exact: true });
    await expect(review.getByLabel('Điểm từ ảnh: Listening')).toHaveValue('400');
    await expect(review.getByLabel('Điểm từ ảnh: Reading')).toHaveValue('350');
    await page.goBack();
    await expect(review).toHaveCount(0);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: /^(Lưu điểm|Lưu kết quả)$/ }).click();
    await expect(form.getByRole('alert')).toContainText('Kiểm tra và áp dụng điểm từ đề');
  });
}
