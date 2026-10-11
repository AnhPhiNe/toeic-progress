import { chooseNoteSource } from './helpers/noteSource';
import { test, expect, type Page } from '@playwright/test';

const raw = 'Part 5:\nThe latest ____ of decorations in stock indicates adequate preparation.\nproposal\ninventory\nconsideration\ncommitment';

for (const message of [
  'Tài khoản đã dùng hết 10 lượt phân tích AI trong tháng. Lượt mới bắt đầu lúc 07:00 ngày 01/11/2026 (giờ Việt Nam). Bạn vẫn có thể lưu thủ công.',
  'Dịch vụ OpenAI đã hết ngân sách hoặc hạn mức thanh toán. Đây không phải giới hạn lượt của tài khoản bạn. Bạn vẫn có thể lưu thủ công.',
  'OpenAI phản hồi quá thời gian chờ; chưa nhận được kết quả phân tích. Nội dung đang nhập vẫn được giữ. Bạn có thể thử lại hoặc lưu thủ công.',
]) test(`AI feedback preserves input and permits manual save: ${message.split('.')[0]}`, async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI() { window.__failedCalls = (window.__failedCalls || 0) + 1; throw new Error(${JSON.stringify(message)}); }
  ` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await modal.getByRole('button', { name: 'Bạn chọn D', exact: true }).click();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toHaveText(message);
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(raw);
  await expect(modal.getByRole('button', { name: 'Bạn chọn D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Đã lưu lỗi sai');
  expect(await page.evaluate(() => (window as Window & { __failedCalls: number }).__failedCalls)).toBe(1);
});
async function seedCard(page: Page, legacy = false) {
  await page.goto('/so-tay');
  await page.evaluate(legacy => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    bundle.mistakes = [{ id: 'test-note', part: 5, questionContext: 'Reports should ____ submitted.',
      sourceTestName: 'ETS Test 1', options: ['(A) are', '(B) be'], correctAnswer: '(B) be', answerSource: 'PROVIDED',
      ...(!legacy ? { userChoice: 'A', userChoiceState: 'CHOSEN', userReason: 'Reports số nhiều nên chọn are' } : {}),
      userMistake: '(A) are - Reports số nhiều nên chọn are', status: 'NEEDS_REVIEW', category: 'OTHER', tags: [],
      trapTip: 'Sau should dùng động từ nguyên thể.',
      optionNotes: [{ label: 'A', pos: 'v', meaning: 'to be, hiện tại số nhiều' }, { label: 'B', pos: 'v', meaning: 'nguyên thể' }],
      explanation: { quickTip: 'Sau should dùng động từ nguyên thể.', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: 'should be submitted.', keyVocabulary: '' },
      createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, legacy);
  await page.reload();
}

test('review reveals meanings after answering and saves a real timestamp', async ({ page }) => {
  await seedCard(page); await page.getByRole('button', { name: 'Ôn 1 thẻ' }).click();
  const modal = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(modal.getByText(': to be, hiện tại số nhiều')).toHaveCount(0);
  await modal.getByRole('button', { name: /^A\s*are/ }).click();
  await expect(modal.getByRole('status')).toHaveText('Vẫn nhầm như lần trước · ôn lại ngày mai');
  await expect(modal.getByText(': to be, hiện tại số nhiều')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.lastReviewedAt).toMatch(/T.*Z$/);
  await modal.getByRole('button', { name: 'Xem kết quả' }).click(); await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByText('Ôn ngày mai').filter({ visible: true })).toBeVisible();
});

test('quick save needs no preview or AI; missing answers stay out of review until a source key is added', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  let modal = page.getByRole('dialog');
  await expect(modal.getByText('Đáp án đúng từ đề', { exact: false })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Xem mẫu minh họa' })).toHaveCount(0);
  await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await expect(modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true })).not.toBeVisible();

  await modal.getByLabel('Lý do chọn').fill('Chưa chắc nghĩa inventory.\nMình không nhớ đã chọn gì.');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).dblclick();
  await expect(modal.getByRole('status')).toContainText('Chưa có đáp án');
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Chưa có thẻ/ })).toBeDisabled();
  await page.reload(); await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
  await expect(page.getByRole('menuitem', { name: 'Ôn câu này' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click(); modal = page.getByRole('dialog');
  await expect(modal.getByRole('button', { name: 'Bạn chọn A', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(modal.getByLabel('Lý do chọn')).toHaveValue('Chưa chắc nghĩa inventory.\nMình không nhớ đã chọn gì.');
  await modal.getByText('Đáp án đúng từ đề', { exact: false }).click();
  await modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ôn 1 thẻ' })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(saved).toHaveLength(1); expect(saved[0].userChoiceState).toBe('UNKNOWN'); expect(saved[0].userChoice).toBeUndefined();
  expect(saved[0].correctAnswer).toBe('(B) inventory'); expect(saved[0].answerProvidedBy).toBe('SOURCE');
  expect(saved[0].options).toEqual(['(A) proposal', '(B) inventory', '(C) consideration', '(D) commitment']);
});

test('dirty input can be retained and unconfigured AI never substitutes a sample', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('5'); await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await expect(modal.getByRole('button', { name: 'Phân tích với AI' })).toBeDisabled();
  await expect(modal.getByRole('checkbox')).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(raw);
  page.once('dialog', dialog => dialog.accept()); await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
});

test('compact typography fits mobile, desktop, dark mode and zoom with spellcheck disabled', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/so-tay');
    await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
    const modal = page.getByRole('dialog'), textarea = modal.getByLabel('Câu hỏi + phương án');
    expect((await textarea.boundingBox())!.height).toBeGreaterThanOrEqual(144);
    expect((await textarea.boundingBox())!.height).toBeLessThan(210);
    expect(await textarea.evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    await expect(textarea).toHaveAttribute('spellcheck', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(modal.getByRole('button', { name: 'Lưu nhanh' })).toBeVisible();
    if (width === 1024) {
      await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await expect(modal.getByRole('button', { name: 'Lưu nhanh' })).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    }
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  }
});

test('review cannot overwrite a newer question stored elsewhere', async ({ page }) => {
  await seedCard(page); await page.getByRole('button', { name: 'Ôn 1 thẻ' }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await page.evaluate(() => { const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); bundle.mistakes[0].questionContext = 'Question corrected on another device.'; localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle)); });
  await review.getByRole('button', { name: /^A\s*are/ }).click();
  await expect(review.getByRole('alert')).toContainText('Nội dung thẻ đã thay đổi');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.questionContext).toBe('Question corrected on another device.'); expect(saved.reviewCount).toBeUndefined();
  await review.getByRole('button', { name: 'Tải lại thẻ' }).click(); await expect(review.getByText('Question corrected on another device.')).toBeVisible();
});

test('Part and source are required before quick save; category is optional', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await expect(modal.getByLabel('Part', { exact: true })).toHaveValue('');

  await modal.getByText('Đáp án đúng từ đề', { exact: false }).click(); await modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('Chọn Part');
  await expect(modal.getByLabel('Part', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn hoặc thêm tên đề');
  await expect(modal.getByRole('button', { name: 'Chọn đề', exact: true })).toBeFocused();
  await expect(modal.getByText('Ghi chú bổ sung', { exact: true })).toHaveCount(0);
  await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('(B) inventory');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.correctAnswer).toBe('(B) inventory'); expect(saved.category).toBe('OTHER');
});

test('saving a legacy card twice keeps its narration and absent reason', async ({ page }) => {
  await seedCard(page, true);
  for (let pass = 0; pass < 2; pass++) {
    await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click(); await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
    expect(saved.userMistake).toBe('(A) are - Reports số nhiều nên chọn are'); expect(saved.userReason).toBeUndefined();
  }
});

test('AI receives structured input and the learner data survives the preview and return', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      window.__lastAIInput = input;
      return { usage: {}, draft: { part: 5, questionContext: input.question, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userChoice: 'D', userReason: 'Invented reason',
        userMistake: 'Invented narration', category: 'OTHER', tags: [], trapTip: '', optionNotes: [], explanation: null, missingInformation: [] } };
    }` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('5'); await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  const reason = 'Mình chưa chắc nghĩa proposal.\nĐáp án chuẩn: A là ghi chú riêng.';
  await modal.getByLabel('Lý do chọn').fill(reason);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible(); await expect(modal.getByText('AI đề xuất', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Bạn chọn A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.userChoice).toBe('A'); expect(saved.userChoiceState).toBe('CHOSEN'); expect(saved.userReason).toBe(reason); expect(saved.answerSource).toBe('AI_PROPOSED');
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await page.getByRole('button', { name: 'Ôn 1 thẻ' }).click(); const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await review.getByRole('button', { name: /^B\s*inventory/ }).click(); await expect(review.getByText('AI đề xuất', { exact: true })).toBeVisible();
});

test('reason-only edits preserve explanations and request review before saving', async ({ page }) => {
  await seedCard(page); const original = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click(); await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('5'); await modal.getByLabel('Lý do chọn').fill('Mình chỉ ghi thêm lý do.');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible();
  await expect(modal.getByLabel('Giải thích / mẹo ghi nhớ')).not.toBeVisible();
  await modal.getByText('Chỉnh đáp án / lời giải', { exact: true }).click();
  await expect(modal.getByLabel('Giải thích / mẹo ghi nhớ')).toHaveValue(original.trapTip);
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.explanation).toEqual(original.explanation); expect(saved.trapTip).toBe(original.trapTip); expect(saved.optionNotes).toEqual(original.optionNotes); expect(saved.options).toEqual(original.options); expect(saved.userReason).toBe('Mình chỉ ghi thêm lý do.');
});

test('oversized legacy notes cannot be resaved and the complete source remains available', async ({ page }) => {
  for (const [text, error] of [['Q'.repeat(16001), '16.000'], ['Ể'.repeat(11000), '32 KiB']]) {
    await seedCard(page);
    await page.evaluate(text => {
      const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      bundle.mistakes[0].questionContext = text;
      localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    }, text);
    await page.reload();
    await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
    await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
    const modal = page.getByRole('dialog');
    const before = await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'));
    await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(modal.getByRole('alert')).toContainText(error);
    await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(text + '\n(A) are\n(B) be');
    expect(await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  }
});
