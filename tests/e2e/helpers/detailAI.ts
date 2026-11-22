import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { openManualEntry } from './manualEntry';
import { gotoPage, openScoreLogger } from './nav';

export const screenshot = resolve('tests/fixtures/part7-notice.png');
export const TIP = 'Câu thiếu động từ chính → chọn động từ chia thì.';
const draft = (part: number, question: string, correct: string, choice: string, answerSource = 'PROVIDED') => ({
  part, category: 'OTHER', question, context: part === 6 ? 'Library Reopens\nThe library welcomed residents back…' : '', questionContext: question,
  options: ['(A) accommodates', '(B) accommodating', '(C) accommodation', '(D) to accommodate'],
  correctAnswer: correct, answerSource, userChoice: choice, userChoiceState: 'CHOSEN', userMistake: '', trapTip: '',
  tags: [], missingInformation: [], optionNotes: [], explanation: null
});
/** What a screenshot shows for each wrong question; a reading returns only the numbers it was asked for. */
const READS: Record<number, ReturnType<typeof draft>> = {
  104: draft(5, 'The room ____ fifty guests.', '(A) accommodates', 'C'),
  112: draft(5, 'Staff ____ the guests.', '', 'B', 'MISSING'),
  131: draft(6, 'The new reading room ____ twice as many visitors.', '(A) accommodates', 'B'),
  // A question in the same passage set that the learner got right.
  132: draft(6, 'The hall ____ the exhibition.', '(B) accommodating', 'B')
};

/** Replaces the AI module: each reading answers from READS and records what it was asked. */
export async function mockTurnsAI(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true, pageContextImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions, images, getToken, owner, isCurrent, batchId, contextImages = [], slices = []) {
        const calls = (window.__pageCalls = window.__pageCalls || []);
        calls.push({ questions: questions.map(item => item.number), images: images.length, context: contextImages.length, batch: batchId,
          types: [...contextImages, ...images].map(image => image.dataUrl.slice(5, image.dataUrl.indexOf(';'))), slices });
        await new Promise(resolve => setTimeout(resolve, window.__pageDelay ?? 0));
        window.__pageFinished = (window.__pageFinished || 0) + 1;
        const reads = ${JSON.stringify(READS)};
        const body = btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + 86400 })).replace(/=+$/, '');
        const items = questions.filter(item => reads[item.number]).map(item => ({ number: item.number, draft: reads[item.number] }));
        return { items, missing: questions.map(item => item.number).filter(number => !reads[number]), explainTicket: body + '.signature', usage: {} };
      }
      export async function explainBatchWithAI(ticket, items) {
        (window.__explainCalls = window.__explainCalls || []).push(items.map(item => item.number));
        await new Promise(resolve => setTimeout(resolve, window.__explainDelay ?? 200));
        if (window.__explainFails) throw new Error('offline');
        return { failed: [], items: items.map(({ number, input }) => ({ number, draft: { part: input.part, category: 'ADVANCED_GRAMMAR',
          question: input.question, context: input.context, questionContext: input.question, options: input.options,
          correctAnswer: input.options[0], answerSource: 'AI_PROPOSED', userChoice: input.userChoice, userMistake: '', tags: [],
          missingInformation: [], trapTip: '', optionNotes: [], answerDoubt: number === 131 ? 'C' : '',
          explanation: { quickTip: ${JSON.stringify(TIP)}, translation: 'Phòng đọc mới đón gấp đôi khách.', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '' } } })) };
      }`
  }));
}

/** Logs "ETS Table" (wrong 3, 104, 112, 131) on a computer and opens Gỡ câu sai from the result screen. */
export async function openDesktopFlow(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockTurnsAI(page);
  await gotoPage(page, '/lich-su');
  await openScoreLogger(page);
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Ghi điểm', exact: true }) });
  // The paste view has no test-name field; the "Tự chọn câu sai" views do.
  await openManualEntry(page, form);
  await form.locator('#session-test-name').fill('ETS Table');
  await form.getByRole('button', { name: 'Gõ số câu', exact: true }).click();
  await form.getByLabel('Số câu sai').fill('3 104 112 131');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết 3 câu sai', exact: true }).click();
  return page.getByRole('dialog', { name: 'Gỡ câu sai · ETS Table', exact: true });
}

/** Sổ tay gathers a test's number-only drafts in one pink row; this opens Gỡ câu sai for that test (the nth attempt). */
export async function openPendingList(page: Page, testName = 'ETS Table', index = 0) {
  if (!page.url().includes('/so-tay')) await gotoPage(page, '/so-tay');
  const rows = page.getByRole('button', { name: new RegExp(`câu chờ ghi chi tiết, ${testName}`) });
  await rows.nth(index).click();
  return page.getByRole('dialog', { name: `Gỡ câu sai · ${testName}`, exact: true });
}

export const storedCard = (page: Page, number: number, testName = 'ETS Table') => page.evaluate(([value, name]) => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .find((card: { sourceTestName?: string; questionNumber?: number; deletedAt?: string | null }) => card.sourceTestName === name && card.questionNumber === value && !card.deletedAt), [number, testName] as const);
