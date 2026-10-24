import { expect, test, type Page } from '@playwright/test';

const question = 'When will the library reopen?';
const sourceImageIds = ['a'.repeat(64), 'b'.repeat(64)];
const tip = 'Đối chiếu ngày mở cửa được ghi trong ảnh thông báo.';

async function openImageCard(page: Page) {
  // Mock only the provider-facing module: the notebook, merge and storage paths remain real.
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, persistentImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI(text, captcha, input, images, sourceImageIds) {
        window.__imageExplanationCall = { text, input, images, sourceImageIds };
        if (window.__holdImageExplanation) await new Promise(resolve => { window.__releaseImageExplanation = resolve; });
        return { usage: {}, draft: { part: 7, category: 'VOCABULARY_TRAP',
          question: input.question, context: 'OCR text must not replace the saved source image.',
          questionContext: input.question, options: input.options, correctAnswer: input.options[2],
          answerSource: 'AI_PROPOSED', userChoice: 'D', userChoiceState: 'CHOSEN',
          userMistake: 'AI narration must not replace the learner data.', userReason: 'Invented reason',
          tags: ['notice'], trapTip: ${JSON.stringify(tip)}, optionNotes: [], missingInformation: [],
          explanation: { quickTip: ${JSON.stringify(tip)}, translation: '', questionType: 'Chi tiết',
            evidence: 'The library reopens on Monday.', paraphrase: '', analysis: 'Check the opening date.', keyVocabulary: '' }
        } };
      }
    `
  }));
  await page.goto('/so-tay');
  // This is the persisted shape produced by saving a manual note with context images.
  await page.evaluate(({ question, sourceImageIds }) => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    bundle.mistakes = [{ id: 'image-only-manual', part: 7, category: 'OTHER', status: 'NEEDS_REVIEW',
      question, questionContext: question, context: '', sourceImageIds,
      options: ['(A) Monday', '(B) Tuesday', '(C) Wednesday', '(D) Thursday'],
      sourceTestName: 'QA Image Explanation', correctAnswer: '(A) Monday', answerSource: 'PROVIDED',
      answerProvidedBy: 'SOURCE', userChoice: 'B', userChoiceState: 'CHOSEN', userReason: 'Nhầm ngày trong ảnh',
      userMistake: '(B) Tuesday - Nhầm ngày trong ảnh', tags: [], createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, { question, sourceImageIds });
  await page.reload();
  await page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }).click();
}

test('explaining an image-only Part 7 card forwards its source images and preserves learner facts after reload', async ({ page }) => {
  await openImageCard(page);
  await page.getByRole('button', { name: 'Giải thích với AI', exact: true }).click();
  await expect(page.getByText(`Mẹo 10s: ${tip}`, { exact: true })).toBeVisible();

  const call = await page.evaluate(() => (window as Window & { __imageExplanationCall: {
    input: { context: string; sourceAnswer: string; userChoice: string; userChoiceState: string; userReason: string };
    images: unknown[]; sourceImageIds: string[];
  } }).__imageExplanationCall);
  expect(call.sourceImageIds).toEqual(sourceImageIds);
  expect(call.images).toEqual([]);
  expect(call.input).toMatchObject({ context: '', sourceAnswer: 'A', userChoice: 'B', userChoiceState: 'CHOSEN', userReason: 'Nhầm ngày trong ảnh' });

  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ sourceImageIds, question, context: '', correctAnswer: '(A) Monday', answerSource: 'PROVIDED',
    answerProvidedBy: 'SOURCE', userChoice: 'B', userChoiceState: 'CHOSEN', userReason: 'Nhầm ngày trong ảnh', explanation: { quickTip: tip } });
  await page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }).click();
  await expect(page.getByText(`Mẹo 10s: ${tip}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Giải thích với AI', exact: true })).toHaveCount(0);
});

for (const changedField of ['question', 'sourceImageIds', 'deletedAt'] as const) {
  test(`a late image explanation cannot overwrite a card whose ${changedField} changed`, async ({ page }) => {
    await openImageCard(page);
    await page.evaluate(() => { (window as Window & { __holdImageExplanation: boolean }).__holdImageExplanation = true; });
    await page.getByRole('button', { name: 'Giải thích với AI', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Đang viết lời giải…', exact: true })).toBeDisabled();
    await page.waitForFunction(() => typeof (window as Window & { __releaseImageExplanation?: () => void }).__releaseImageExplanation === 'function');
    await page.evaluate(changedField => {
      const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      const card = bundle.mistakes[0];
      if (changedField === 'question') card.question = 'What is the new opening time?';
      if (changedField === 'sourceImageIds') card.sourceImageIds = ['c'.repeat(64)];
      if (changedField === 'deletedAt') card.deletedAt = new Date().toISOString();
      localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
      (window as Window & { __releaseImageExplanation: () => void }).__releaseImageExplanation();
    }, changedField);
    await expect(page.getByText('Nội dung thẻ đã thay đổi hoặc bị xóa. Chưa áp dụng lời giải; hãy mở lại thẻ để kiểm tra.', { exact: true })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
    expect(saved.explanation).toBeUndefined();
    expect(saved.trapTip).toBeUndefined();
    if (changedField === 'question') expect(saved.question).toBe('What is the new opening time?');
    if (changedField === 'sourceImageIds') expect(saved.sourceImageIds).toEqual(['c'.repeat(64)]);
    if (changedField === 'deletedAt') expect(saved.deletedAt).toMatch(/T.*Z$/);
  });
}
