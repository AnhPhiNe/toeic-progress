import { expect, test } from '@playwright/test';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const QUESTION = 'Mr. Osei ____ a daily report of each delivery to the regional office.';
const OPTIONS = ['(A) posting', '(B) was posted', '(C) post', '(D) posts'];
const TIP = 'Chủ ngữ số ít và có tân ngữ phía sau: chọn động từ chủ động chia -s.';

test('a card read from a screenshot gets its explanation on request, once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI(text, captcha, input) {
        window.__explainInput = input;
        return { usage: {}, draft: { part: 5, category: 'ADVANCED_GRAMMAR', question: ${JSON.stringify(QUESTION)}, context: '',
          questionContext: ${JSON.stringify(QUESTION)}, options: ${JSON.stringify(OPTIONS)}, correctAnswer: '(D) posts', answerSource: 'PROVIDED',
          userChoice: 'B', userMistake: '(B) was posted', tags: ['subject-verb agreement'], missingInformation: [], trapTip: 'Mẹo 10s: ${TIP}',
          optionNotes: [], explanation: { quickTip: ${JSON.stringify(TIP)}, translation: '', questionType: '', evidence: '', paraphrase: '',
          analysis: 'Dấu hiệu: Mr. Osei là chủ ngữ số ít.', keyVocabulary: '' } } };
      }
      export async function extractPageWithAI() { throw new Error('not used'); }
      export async function readResultsWithAI() { throw new Error('not used'); }`
  }));
  await gotoPage(page, '/so-tay');
  await page.evaluate(([question, options]) => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-20T09:00:00.000Z';
    data.mistakes = [{ id: 'draft:s1:109', sessionId: 's1', sourceTestName: 'ETS Screen', part: 5, questionNumber: 109, question, context: '',
      questionContext: question, options, userChoice: 'B', userChoiceState: 'CHOSEN', userMistake: '(B) was posted', correctAnswer: '(D) posts',
      answerSource: 'PROVIDED', answerProvidedBy: 'SOURCE', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, [QUESTION, OPTIONS] as const);
  await page.reload();
  await openCard(page);
  const explain = page.getByRole('button', { name: /^Giải thích với AI/ });
  await explain.click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm giải thích' })).toBeVisible();
  // Phone tabs: the tip is on "Giải thích".
  await page.getByRole('tab', { name: 'Giải thích' }).click();

  await expect(page.getByText(TIP).first()).toBeVisible();
  await expect(explain).toHaveCount(0);
  const input = await page.evaluate(() => (window as Window & { __explainInput: unknown }).__explainInput);
  expect(input).toMatchObject({ question: QUESTION, options: OPTIONS, part: 5, userChoice: 'B', userChoiceState: 'CHOSEN', sourceAnswer: 'D' });
  const card = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(card).toMatchObject({ category: 'ADVANCED_GRAMMAR', correctAnswer: '(D) posts', answerSource: 'PROVIDED', tags: ['subject-verb agreement'] });
  expect(card.explanation.quickTip).toBe(TIP);
});
