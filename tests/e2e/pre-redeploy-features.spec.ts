import { expect, test, type Page } from '@playwright/test';

async function seedSavedWords(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = '2026-11-10T08:00:00.000Z';
    bundle.mistakes = [{
      id: 'm-vocab-1',
      sessionId: 's-vocab-1',
      sourceTestName: 'ETS Flashcard',
      part: 5,
      questionNumber: 112,
      question: 'Analysts ____ accurate data before making projections.',
      questionContext: 'Analysts ____ accurate data before making projections.',
      context: '',
      options: ['(A) rely on', '(B) turn off', '(C) bring about', '(D) put aside'],
      userChoice: 'B',
      userChoiceState: 'CHOSEN',
      userMistake: '(B) turn off',
      correctAnswer: '(A) rely on',
      answerSource: 'PROVIDED',
      category: 'VOCABULARY_TRAP',
      tags: [],
      status: 'NEEDS_REVIEW',
      savedWords: ['rely on', 'widespread'],
      explanation: {
        quickTip: 'rely on + N = dựa vào.',
        translation: '',
        questionType: '',
        evidence: '',
        paraphrase: '',
        analysis: '',
        keyVocabulary: 'rely on: dựa vào\nwidespread: phổ biến rộng rãi',
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  });
}

test.describe('SavedWordsFlashcard', () => {
  test('desktop: flips saved words, completes deck and logs vocabLog automatically', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedSavedWords(page);
    await page.goto('/so-tay');
    await page.getByRole('tab', { name: /Từ đã lưu/ }).click();
    await page.getByRole('button', { name: 'Ôn 2 từ', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Ôn từ đã lưu', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.fc-word')).toHaveText('rely on');
    await dialog.getByRole('button', { name: 'Lật xem nghĩa', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Nghĩa của từ', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Đã nhớ', exact: true }).click();

    await expect(dialog.locator('.fc-word')).toHaveText('widespread');
    await dialog.getByRole('button', { name: 'Lật xem nghĩa', exact: true }).click();
    await dialog.getByRole('button', { name: 'Đã nhớ', exact: true }).click();

    await expect(dialog.getByRole('heading', { name: 'Đã ôn 2 từ!', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const vocabLog = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).vocabLog);
    expect(vocabLog.some((entry: { count: number }) => entry.count >= 2)).toBe(true);
  });

  test('phone: opens flashcard deck from Từ đã lưu and logs vocabLog', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSavedWords(page);
    await page.goto('/so-tay');
    await page.getByRole('group', { name: 'Lọc theo trạng thái' }).getByRole('button', { name: /^Từ\s*2$/ }).click();
    await page.getByRole('button', { name: 'Ôn 2 từ', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Ôn từ đã lưu', exact: true });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await dialog.getByRole('button', { name: 'Lật xem nghĩa', exact: true }).click();
      await dialog.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
    }
    await expect(dialog.getByRole('heading', { name: 'Đã ôn 2 từ!', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
    const vocabLog = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).vocabLog);
    expect(vocabLog.some((entry: { count: number }) => entry.count >= 2)).toBe(true);
  });
});

test.describe('Public growth & SEO pages', () => {
  test('/quy-doi-diem works cleanly on desktop and mobile without app navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/quy-doi-diem');
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveCount(0);

    const total = page.getByTestId('estimated-total');
    const beforeTotal = Number(await total.textContent());
    const listenInput = page.getByLabel('Số câu đúng Nghe', { exact: true });
    await listenInput.fill('98');
    await listenInput.blur();
    await expect(async () => {
      expect(Number(await total.textContent())).toBeGreaterThan(beforeTotal);
    }).toPass();

    const stamps = page.getByRole('region', { name: 'Thị thực tương đương', exact: true });
    await expect(stamps).toContainText('CEFR');
    await expect(stamps).toContainText('IELTS');
    await expect(stamps).toContainText('VSTEP');
    const cta = page.getByRole('link', { name: 'Lưu kết quả & theo dõi lộ trình miễn phí', exact: true });
    await expect(cta).toHaveAttribute('href', '/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('region', { name: 'Kết quả quy đổi', exact: true })).toBeVisible();
    await expect(page.getByTestId('estimated-total')).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('/gioi-thieu interactive Part 5 sample demo reveals tip on choosing option (B)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/gioi-thieu');
    await page.getByRole('button', { name: /^B\s+by$/ }).click();
    await expect(page.getByText(/Chuẩn rồi!/)).toBeVisible();
    await expect(page.getByText(/Mẹo nhanh:/)).toBeVisible();
    await expect(page.locator('.pub-demo__words').getByText('submitted')).toBeVisible();
    await expect(page.locator('.pub-demo__words').getByText('quarterly')).toBeVisible();
    const convLink = page.getByRole('link', { name: 'Quy đổi điểm TOEIC ↔ IELTS', exact: true });
    await expect(convLink).toHaveAttribute('href', '/quy-doi-diem');
  });
});
