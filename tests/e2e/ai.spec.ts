import { chooseNoteSource } from './helpers/noteSource';
import { PHONE_VIEWPORT, noteModal, openAnswerKey, openCard, openCardEditor, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';
import { test, expect, type Page } from '@playwright/test';

const raw = 'Part 5:\nThe latest ____ of decorations in stock indicates adequate preparation.\n(A) proposal\n(B) inventory\n(C) consideration\n(D) commitment';

async function seedCard(page: Page, legacy = false) {
  await gotoPage(page, '/so-tay');
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
  await seedCard(page); await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  const modal = page.getByRole('dialog', { name: 'Ôn câu sai' });
  await expect(modal.getByText('to be, hiện tại số nhiều')).toHaveCount(0);
  await modal.getByRole('button', { name: /^\(A\)\s*are/ }).click();
  await expect(modal.getByText('to be, hiện tại số nhiều')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Xem nghĩa từng phương án', exact: true }).click();
  await expect(modal.getByText('to be, hiện tại số nhiều')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Vẫn chưa chắc', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Tiếp', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.lastReviewedAt).toMatch(/T.*Z$/);
  await expect(page.getByRole('dialog', { name: 'Ôn xong' })).toContainText('Ôn lại ngày mai 1');
  await page.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
  await expect(page.locator('.nb-due')).toHaveText(/^ôn \d\d\/\d\d$/);
});

test('quick save needs no preview or AI; missing answers stay out of review until a source key is added', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const manual = await openManualForm(page);
  await manual.getByLabel('Đề', { exact: true }).fill('ETS Test 1');
  await manual.getByLabel('Câu hỏi và các phương án').fill(raw);
  await manual.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await manual.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await manual.getByRole('button', { name: /Thêm lý do và loại lỗi/ }).click();
  await manual.getByLabel('Lý do bạn chọn').fill('Chưa chắc nghĩa inventory. Mình không nhớ đã chọn gì.');
  await manual.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(manual).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Ôn \d+ câu/ })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await openCard(page);
  await expect(page.getByRole('button', { name: 'Ôn câu này', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  const modal = noteModal(page);
  await expect(modal.getByRole('button', { name: 'Bạn chọn A', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(modal.getByLabel('Lý do chọn')).toHaveValue('Chưa chắc nghĩa inventory. Mình không nhớ đã chọn gì.');
  await openAnswerKey(modal);
  await modal.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ôn câu này', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(saved).toHaveLength(1); expect(saved[0].userChoiceState).toBe('UNKNOWN'); expect(saved[0].userChoice).toBeUndefined();
  expect(saved[0].correctAnswer).toBe('(B) inventory'); expect(saved[0].answerProvidedBy).toBe('SOURCE');
  expect(saved[0].options).toEqual(['(A) proposal', '(B) inventory', '(C) consideration', '(D) commitment']);
});

test('a note saved on a phone without an answer key stays listed so its key can be added', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await seedCard(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    Object.assign(bundle.mistakes[0], { correctAnswer: '', answerSource: 'MISSING' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.locator('.pn-row')).toHaveCount(1);
});

test('dirty input is retained across close/reopen and unconfigured AI shows honest save label', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  let modal = await openManualForm(page);
  await modal.getByLabel('Đề', { exact: true }).fill('ETS Draft');
  await modal.getByLabel('Câu hỏi và các phương án').fill(raw);
  await expect(modal.getByRole('button', { name: 'Lưu vào Sổ tay', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  modal = await openManualForm(page);
  await expect(modal.getByLabel('Câu hỏi và các phương án')).toHaveValue(raw);
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
});

test('compact typography fits phones, tablets and desktop and zoom with spellcheck disabled', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoPage(page, '/so-tay');
    const modal = await openManualForm(page), textarea = modal.getByLabel('Câu hỏi và các phương án');
    expect((await textarea.boundingBox())!.height).toBeGreaterThanOrEqual(100);
    expect((await textarea.boundingBox())!.height).toBeLessThan(240);
    const fontSize = parseFloat(await textarea.evaluate(element => getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(width < 640 ? 16 : 14);
    await expect(textarea).toHaveAttribute('spellcheck', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ })).toBeVisible();
    if (width === 1024) {
      await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
      const box = (await modal.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 1);
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    }
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  }
});

test('review cannot overwrite a newer question stored elsewhere', async ({ page }) => {
  await seedCard(page); await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai' });
  await page.evaluate(() => { const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); bundle.mistakes[0].questionContext = 'Question corrected on another device.'; localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle)); });
  await review.getByRole('button', { name: /^\(A\)\s*are/ }).click();
  await review.getByRole('button', { name: 'Tiếp', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Nội dung thẻ đã thay đổi');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.questionContext).toBe('Question corrected on another device.'); expect(saved.reviewCount).toBeUndefined();
  await review.getByRole('button', { name: /Thoát/ }).click(); await page.reload();
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click(); await expect(review.getByText('Question corrected on another device.')).toBeVisible();
});

test('source is required before saving; category is optional', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);
  await modal.getByLabel('Câu hỏi và các phương án').fill(raw);
  await modal.getByRole('button', { name: 'Đáp án đúng: B', exact: true }).click();
  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn hoặc thêm tên đề');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
  await modal.getByLabel('Đề', { exact: true }).fill('ETS Test 1');
  await modal.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(modal).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.correctAnswer).toBe('(B) inventory'); expect(saved.category).toBe('OTHER');
});

test('saving a legacy card twice keeps its narration and absent reason', async ({ page }) => {
  await seedCard(page, true); await openCard(page);
  for (let pass = 0; pass < 2; pass++) {
    await page.getByRole('button', { name: 'Sửa', exact: true }).click();
    await noteModal(page).getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(noteModal(page)).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
    expect(saved.userMistake).toBe('(A) are - Reports số nhiều nên chọn are'); expect(saved.userReason).toBeUndefined();
  }
});

test('reason-only edits preserve explanations and request review before saving', async ({ page }) => {
  await seedCard(page); const original = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  const modal = await openCardEditor(page); await chooseNoteSource(modal); await modal.getByRole('button', { name: 'Part 5', exact: true }).click(); await modal.getByLabel('Lý do chọn').fill('Mình chỉ ghi thêm lý do.');
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
  const cases: Array<{ text: string; extra?: string; error: string }> = [
    { text: 'Q'.repeat(16001), error: '16.000' },
    { text: 'Ể'.repeat(14000), extra: 'Ể'.repeat(10000), error: '64 KiB' }
  ];
  for (const { text, extra, error } of cases) {
    await seedCard(page);
    await page.evaluate(({ text, extra }) => {
      const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      bundle.mistakes[0].questionContext = text;
      if (extra) {
        bundle.mistakes[0].part = 7;
        bundle.mistakes[0].question = text;
        bundle.mistakes[0].context = extra;
      }
      localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    }, { text, extra });
    await page.reload();
    const modal = await openCardEditor(page);
    const before = await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'));
    await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(modal.getByRole('alert')).toContainText(error);
    await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(text + '\n(A) are\n(B) be');
    expect(await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  }
});
