import { expect, test, type Page } from '@playwright/test';
import { mockWrongDetailAI, screenshot, seedTests, TEST, WRONG } from './helpers/wrongDetail';

type Call = { questions: number[]; images: number; context: number; batch: string };
const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []) as Promise<Call[]>;
// WD_SHOTS=1 saves the design screenshots (design/previews/img).
const shot = async (page: Page, name: string) => { if (process.env.WD_SHOTS) await page.screenshot({ path: `design/previews/img/build-notebook-capture-part-${name}.png` }); };

for (const phone of [false, true]) {
  test(`Sổ tay capture on a ${phone ? 'phone' : 'computer'} asks the Part first and reads a passage group with its questions`, async ({ page }) => {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await mockWrongDetailAI(page);
    await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
    await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
    await page.goto('/so-tay');
    await page.getByRole('button', { name: phone ? /Chụp$/ : /Chụp trang chữa bài/ }).first().click();
    const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
    await expect(capture.getByText('Chụp câu Part mấy?')).toBeVisible();
    // Reading (Part 5–7) plus optional Listening (Part 1–4) = 7 Part buttons with logged wrong counts.
    await expect(capture.getByRole('button', { name: /^Part \d · / })).toHaveCount(7);
    await expect(capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true })).toContainText('21 câu sai');
    await shot(page, `1-pick-${phone ? 'phone' : 'desktop'}`);

    await capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true }).click();
    await capture.getByRole('button', { name: /^Nhóm 186–190/ }).click();
    await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot, screenshot]);
    await shot(page, `2-part7-${phone ? 'phone' : 'desktop'}`);
    await capture.getByRole('button', { name: /^Gửi Sóc đọc/ }).click();
    await expect(capture.getByRole('heading', { name: /^Soát \d+ câu sai/ }).or(capture.getByText(/^Soát \d+ câu sai/))).toBeVisible();
    // All group photos went together in one unified request, looking for the group's wrong questions only.
    expect((await calls(page)).map(call => [call.questions, call.images, call.context])).toEqual([[[186, 189], 3, 0]]);
    await shot(page, `3-review-${phone ? 'phone' : 'desktop'}`);
    await capture.getByRole('button', { name: /^Lưu \d+ câu vào Sổ tay/ }).click();
    await expect(capture).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
      .filter((card: { questionNumber?: number; question?: string }) => card.question && [186, 189].includes(card.questionNumber!)).length);
    expect(saved).toBe(2);
  });
}

test('a test without a wrong list is captured freely: Part 5 sends every screenshot together', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: /Chụp trang chữa bài/ }).first().click();
  const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
  await capture.getByLabel('Đề', { exact: true }).fill('Free Test');
  await capture.getByRole('button', { name: 'Part 5 · Điền câu', exact: true }).click();
  await expect(capture.getByRole('group', { name: 'Nhóm bài đọc' })).toHaveCount(0);
  await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot]);
  await capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true }).click();
  await expect(capture.getByText(/^Soát \d+ câu sai/)).toBeVisible();
  const sent = await calls(page);
  expect(sent.every(call => call.images === 2)).toBe(true);
  expect(sent.flatMap(call => call.questions)).toEqual(Array.from({ length: 30 }, (_, index) => 101 + index));
});
