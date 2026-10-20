import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

export const screenshot = resolve('tests/fixtures/part7-notice.png');
export const TIP = 'Câu thiếu động từ chính → chọn động từ chia thì.';
const draft = (part: number, question: string, correct: string, choice: string, answerSource = 'PROVIDED') => ({
  part, category: 'OTHER', question, context: part === 6 ? 'Library Reopens\nThe library welcomed residents back…' : '', questionContext: question,
  options: ['(A) accommodates', '(B) accommodating', '(C) accommodation', '(D) to accommodate'],
  correctAnswer: correct, answerSource, userChoice: choice, userChoiceState: 'CHOSEN', userMistake: '', trapTip: '',
  tags: [], missingInformation: [], optionNotes: [], explanation: null
});
// The first turn of screenshots shows the Part 5 questions, the second the Part 6 ones.
const TURNS = [
  [{ number: 104, draft: draft(5, 'The room ____ fifty guests.', '(A) accommodates', 'C') },
   { number: 112, draft: draft(5, 'Staff ____ the guests.', '', 'B', 'MISSING') }],
  [{ number: 131, draft: draft(6, 'The new reading room ____ twice as many visitors.', '(A) accommodates', 'B') }]
];

/** Replaces the AI module: each reading answers with the next turn above and records what it was asked. */
export async function mockTurnsAI(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions, images) {
        const calls = (window.__pageCalls = window.__pageCalls || []);
        calls.push({ questions: questions.map(item => item.number), images: images.length });
        const body = btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + 86400 })).replace(/=+$/, '');
        return { items: ${JSON.stringify(TURNS)}[calls.length - 1] ?? [], missing: [], explainTicket: body + '.signature', usage: {} };
      }
      export async function explainBatchWithAI(ticket, items) {
        await new Promise(resolve => setTimeout(resolve, window.__explainDelay ?? 200));
        return { failed: [], items: items.map(({ number, input }) => ({ number, draft: { part: input.part, category: 'ADVANCED_GRAMMAR',
          question: input.question, context: input.context, questionContext: input.question, options: input.options,
          correctAnswer: input.options[0], answerSource: 'AI_PROPOSED', userChoice: input.userChoice, userMistake: '', tags: [],
          missingInformation: [], trapTip: '', optionNotes: [],
          explanation: { quickTip: ${JSON.stringify(TIP)}, translation: 'Phòng đọc mới đón gấp đôi khách.', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '' } } })) };
      }`
  }));
}

export async function openDesktopFlow(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockTurnsAI(page);
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Ghi Nhận Kết Quả Buổi Học', exact: true });
  await form.locator('#session-test-name').fill('ETS Table');
  await form.getByRole('heading', { name: 'Ghi Nhận Kết Quả Buổi Học' }).click();
  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await form.getByLabel('Số câu sai').fill('3 104 112 131');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('status').getByRole('button', { name: 'Ghi chi tiết ›', exact: true }).click();
  return page.getByRole('dialog', { name: 'Ghi câu sai · ETS Table', exact: true });
}
