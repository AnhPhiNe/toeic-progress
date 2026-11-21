import { expect, test, type Page } from '@playwright/test';
import { mockWrongDetailAI, screenshot, seedTests, TEST, WRONG } from './helpers/wrongDetail';

type Call = { questions: number[]; images: number; context: number; batch: string };
const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []) as Promise<Call[]>;
// WD_SHOTS=1 saves the design screenshots (design/previews/img).
const shot = async (page: Page, name: string) => { if (process.env.WD_SHOTS) await page.screenshot({ path: `design/previews/img/build-notebook-capture-part-${name}.png` }); };

for (const phone of [false, true]) {
  test(`Sổ tay capture on a ${phone ? 'phone' : 'computer'} opens directly on Auto-Part and switches to a Part 7 passage group`, async ({ page }) => {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await mockWrongDetailAI(page);
    await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
    await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
    await page.goto('/so-tay');
    await page.getByRole('button', { name: phone ? /Chụp$/ : /Chụp trang chữa bài/ }).first().click();
    const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
    // Zero-wall entry: starts on Auto-Part with the image tray immediately visible and all 7 Part quick-switch pills.
    await expect(capture.getByRole('button', { name: 'Tự nhận Part từ số câu trên ảnh', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(capture.getByLabel('Ảnh câu hỏi', { exact: true })).toHaveCount(1);
    await expect(capture.getByRole('button', { name: /^Part \d · / })).toHaveCount(7);
    await expect(capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true })).toContainText('21');
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

test('Auto-Part captures mixed screenshots immediately without selecting a Part', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  await page.goto('/so-tay');
  await page.getByRole('button', { name: /Chụp trang chữa bài/ }).first().click();
  const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
  // Stay on default Auto-Part and upload directly
  await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot]);
  await capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true }).click();
  await expect(capture.getByRole('heading', { name: /^Soát \d+ câu/ })).toBeVisible();
  const sent = await calls(page);
  expect(sent.length).toBeGreaterThanOrEqual(1);
  // Wide continuation passes stay within the exact same batchId (1 AI use) with no context_images split.
  expect(new Set(sent.map(call => call.batch)).size).toBe(1);
  expect(sent[0].context).toBe(0);
  expect(sent[0].images).toBe(2);
  // First pass searches all unrecorded logged wrong questions across Parts 1–7 in one unified request
  expect(sent[0].questions).toEqual(WRONG);
  // Mixed Parts (5, 6, 7) are extracted and shown together in review without ever picking a Part!
  await expect(capture.getByText('Part 5 · câu 103')).toBeVisible();
  await expect(capture.getByText('Part 6 · câu 133')).toBeVisible();
  await expect(capture.getByText('Part 7 · câu 186')).toBeVisible();
});

test('continuous multi-batch queue: Gửi & chụp tiếp queues in background and Lưu & chụp tiếp keeps modal open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  await page.goto('/so-tay');
  await page.getByRole('button', { name: /Chụp trang chữa bài/ }).first().click();
  const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
  await capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true }).click();
  await capture.getByRole('button', { name: /^Nhóm 186–190/ }).click();
  await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);

  // Queue in background and stay on Step 1 ready for next group
  await capture.getByRole('button', { name: /Gửi & chụp tiếp/ }).click();
  // Tray clears immediately and group auto-advances to Nhóm 191–195
  await expect(capture.getByRole('button', { name: /^Nhóm 191–195/ })).toHaveAttribute('aria-pressed', 'true');
  // Live queue bar shows accumulated items and Soát ngay button
  await expect(capture.getByRole('button', { name: /Soát ngay/ })).toBeVisible();
  await expect(capture.getByText(/Đã đọc xong 2 câu/)).toBeVisible();

  await capture.getByRole('button', { name: /Soát ngay/ }).click();
  await expect(capture.getByRole('heading', { name: /^Soát 2 câu sai/ })).toBeVisible();

  // Save & continue returns cleanly to Step 1 without closing modal or losing testName
  await capture.getByRole('button', { name: 'Lưu & chụp tiếp', exact: true }).click();
  await expect(capture).toBeVisible();
  await expect(capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { questionNumber?: number; question?: string }) => card.question && [186, 189].includes(card.questionNumber!)).length);
  expect(saved).toBe(2);
});

test('desktop Sổ tay supports zero-click Ctrl+V image entry and text-paste redirect to Tự gõ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  await page.goto('/so-tay');

  // 1. Pasting an image anywhere on Desktop Sổ tay opens CaptureModal with the image already staged.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'clipboard-shot.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
  await expect(capture).toBeVisible();
  await expect(capture.getByRole('img', { name: 'Ảnh câu hỏi 1' })).toBeVisible();

  // 2. Pasting a TOEIC question as text shows the lightweight redirect banner to Tự gõ.
  const sampleText = '101. The manager ___ the report before noon.\n(A) submit\n(B) submitted\n(C) submitting\n(D) submission';
  await page.evaluate(text => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, sampleText);
  await expect(capture.getByText(/Bạn vừa dán văn bản câu hỏi/)).toBeVisible();
  await capture.getByRole('button', { name: 'Chuyển sang Tự gõ', exact: true }).click();

  const manual = page.getByRole('dialog', { name: 'Tự gõ một câu sai', exact: true });
  await expect(manual).toBeVisible();
  await expect(manual.locator('#man-raw')).toHaveValue(sampleText);
});

test('mobile capture offers side-by-side Chụp liên tiếp & Chọn nhiều ảnh and handles unavailable camera cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: /Chụp$/ }).first().click();

  const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
  await expect(capture.getByRole('button', { name: /Chụp liên tiếp/ })).toBeVisible();
  await expect(capture.getByRole('button', { name: /Chọn nhiều ảnh/ })).toBeVisible();

  await capture.getByRole('button', { name: /Chụp liên tiếp/ }).click();
  const burst = page.getByRole('dialog', { name: /Ảnh trang chữa bài/ });
  await expect(burst).toBeVisible();
  // Headless Chromium has no camera device: cleanly renders fallback UI with close button.
  await expect(burst.getByRole('button', { name: /Chọn nhiều ảnh từ thư viện/ }).or(burst.getByRole('button', { name: 'Chụp ảnh', exact: true }))).toBeVisible();
  await burst.getByRole('button', { name: 'Đóng camera', exact: true }).click();
  await expect(burst).toHaveCount(0);
});
