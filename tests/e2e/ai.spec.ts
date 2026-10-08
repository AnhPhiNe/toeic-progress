import { test, expect, type Page } from '@playwright/test';

const raw = 'Part 5:\nThe latest ____ of decorations in stock indicates adequate preparation.\nproposal\ninventory\nconsideration\ncommitment';
async function seedCard(page: Page, legacy = false) {
  await page.goto('/so-tay');
  await page.evaluate(legacy => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    bundle.mistakes = [{ id: 'test-note', part: 5, questionContext: 'Reports should ____ submitted.',
      options: ['(A) are', '(B) be'], correctAnswer: '(B) be', answerSource: 'PROVIDED',
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
  await expect(modal.getByText('Có đáp án từ đề', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Xem mẫu minh họa' })).toHaveCount(0);
  await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await expect(modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true })).not.toBeVisible();
  await modal.getByRole('button', { name: 'Không nhớ', exact: true }).click();
  await modal.getByLabel('Lý do chọn').fill('Chưa chắc nghĩa inventory.\nMình không nhớ đã chọn gì.');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).dblclick();
  await expect(modal.getByRole('status')).toContainText('Chưa có đáp án');
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Chưa có thẻ/ })).toBeDisabled();
  await page.reload(); await page.getByRole('button', { name: 'Tùy chọn thẻ' }).click();
  await expect(page.getByRole('menuitem', { name: 'Ôn câu này' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click(); modal = page.getByRole('dialog');
  await expect(modal.getByRole('button', { name: 'Không nhớ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByLabel('Lý do chọn')).toHaveValue('Chưa chắc nghĩa inventory.\nMình không nhớ đã chọn gì.');
  await modal.getByText('Có đáp án từ đề', { exact: true }).click();
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
  const modal = page.getByRole('dialog'); await modal.getByLabel('Câu hỏi + phương án').fill(raw);
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
    expect((await textarea.boundingBox())!.height).toBeGreaterThanOrEqual(210);
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

test('unknown Part prompts inline selection and saves the key plus a manual explanation', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByLabel('Câu hỏi + phương án').fill(raw.replace('Part 5:\n', ''));
  await modal.getByRole('button', { name: 'Bỏ trống', exact: true }).click();
  await modal.getByText('Có đáp án từ đề', { exact: true }).click(); await modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('Chọn Part');
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  await modal.getByLabel('Giải thích / mẹo ghi nhớ').fill('Inventory là bản kiểm kê.');
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('(B) inventory');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.correctAnswer).toBe('(B) inventory'); expect(saved.trapTip).toBe('Inventory là bản kiểm kê.');
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
    export async function extractMistakeWithAI(text, captcha, provider, input) {
      window.__lastAIInput = input;
      return { usage: {}, draft: { part: 5, questionContext: input.question, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userChoice: 'D', userReason: 'Invented reason',
        userMistake: 'Invented narration', category: 'OTHER', tags: [], trapTip: '', optionNotes: [], explanation: null, missingInformation: [] } };
    }` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByLabel('Câu hỏi + phương án').fill(raw);
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
  const modal = page.getByRole('dialog'); await modal.getByLabel('Lý do chọn').fill('Mình chỉ ghi thêm lý do.');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible(); await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.explanation).toEqual(original.explanation); expect(saved.trapTip).toBe(original.trapTip); expect(saved.optionNotes).toEqual(original.optionNotes); expect(saved.options).toEqual(original.options); expect(saved.userReason).toBe('Mình chỉ ghi thêm lý do.');
});

test('oversized quick save is rejected without writes and retains input', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await modal.getByLabel('Câu hỏi + phương án').fill(raw); await modal.getByRole('button', { name: 'Không nhớ', exact: true }).click();
  await modal.getByRole('button', { name: 'Sửa', exact: true }).click(); await modal.getByRole('textbox', { name: 'Câu hỏi', exact: true }).fill('Q'.repeat(16001));
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('16.000');
  await expect(modal.getByRole('textbox', { name: 'Câu hỏi', exact: true })).toHaveValue('Q'.repeat(16001));
  await modal.getByRole('textbox', { name: 'Câu hỏi', exact: true }).fill('Ể'.repeat(11000));
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('32 KiB');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
});
