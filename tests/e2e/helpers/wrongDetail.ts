import type { Locator, Page } from '@playwright/test';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

/** A screenshot-sized PNG of noise (it does not compress): `side` px square, about side² × 3 bytes. */
export function noisyPng(side: number): { name: string; mimeType: string; buffer: Buffer } {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0); header.writeUInt32BE(side, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.concat(Array.from({ length: side }, () => Buffer.concat([Buffer.from([0]), randomBytes(side * 3)])));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
  return { name: `noise-${side}.png`, mimeType: 'image/png', buffer: png };
}

/** Gỡ câu sai (design/previews/mock-wrong-detail.html): a seeded test, a mocked AI module and the ways in. */
export const screenshot = resolve('tests/fixtures/part7-notice.png');
export const TIP = 'Câu hỏi mục đích: đọc câu đầu email.';
export const TEST = 'ETS 2024 Test 03';
/** The sketch's 43 wrong questions: Listening has no cards until saved, Reading has number-only drafts. */
export const WRONG = [4, 9, 14, 18, 22, 27, 35, 41, 48, 62, 74, 83, 95, 103, 112, 118, 124, 129, 133, 134, 141, 146,
  149, 153, 158, 162, 163, 166, 171, 173, 176, 178, 181, 183, 184, 186, 189, 191, 194, 196, 198, 199, 200];

/** Part 7 passages come back as labelled text (images are never stored): one label per passage, tables in Markdown. */
export const PART7_PASSAGE = 'Đoạn 1 — Email\nFrom: Lena Ortiz\nTo: Harbor Hotel\nSubject: My stay in May\nI am writing about…\nLena Ortiz\n\n'
  + 'Đoạn 2 — Phiếu giao hàng\n| Item | Qty |\n|---|---|\n| Towels | 2 |';
const option = (letter: string, text: string) => `(${letter}) ${text}`;
const OPTIONS = ['To announce a change', 'To ask for a refund', 'To confirm a booking', 'To report a problem'];
const read = (number: number, question: string, choice: string, answer: string) => ({
  number, draft: { part: number >= 147 ? 7 : number >= 131 ? 6 : 5, category: 'OTHER', question, questionContext: question,
    context: number >= 147 ? PART7_PASSAGE : number >= 131 ? 'From: Lena Ortiz\nTo: Harbor Hotel\nSubject: My stay in May\nI am writing about…' : '',
    options: OPTIONS.map((text, index) => option('ABCD'[index], text)), correctAnswer: answer ? option(answer, OPTIONS['ABCD'.indexOf(answer)]) : '',
    answerSource: answer ? 'PROVIDED' : 'MISSING', userChoice: choice, userChoiceState: 'CHOSEN', userMistake: '', trapTip: '', tags: [],
    missingInformation: [], optionNotes: [], explanation: null }
});
/** What a reading finds for each number (190 and 192 are questions the learner got right). */
export const READS: Record<number, ReturnType<typeof read>> = {
  103: read(103, 'The manager ____ the report before the meeting.', 'B', 'D'),
  112: read(112, 'Staff are asked to ____ their badges at all times.', 'A', 'C'),
  133: read(133, 'The renovation will be ____ by the end of June.', 'C', 'A'),
  186: read(186, 'What is the purpose of the e-mail?', 'C', 'A'),
  189: read(189, 'In the second e-mail, the word "settle" in paragraph 1 is closest in meaning to', 'D', 'C'),
  190: read(190, 'What will Ms. Ortiz most likely do next?', 'B', 'B'),
  191: read(191, 'What is indicated about Ms. Okafor?', 'B', 'D'),
  192: read(192, 'Where does Mr. Lindqvist work?', 'A', 'A'),
  194: read(194, 'When will the renovation most likely be finished?', 'A', '')
};

/** Replaces the AI module; readings answer from READS and record what was sent. */
export async function mockWrongDetailAI(page: Page, { contextImages = true } = {}) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true${contextImages ? ', pageContextImages: true' : ''} }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions, images, getToken, owner, isCurrent, batchId, contextImages = [], slices = []) {
        const calls = (window.__pageCalls = window.__pageCalls || []);
        calls.push({ questions: questions.map(item => item.number), images: images.length, context: contextImages.length, batch: batchId,
          types: [...contextImages, ...images].map(image => image.dataUrl.slice(5, image.dataUrl.indexOf(';'))), slices });
        await new Promise(resolve => setTimeout(resolve, window.__pageDelay ?? 0));
        window.__pageFinished = (window.__pageFinished || 0) + 1;
        // window.__failOnce = a question number: the next reading asking for it fails once.
        if (window.__failOnce && questions.some(item => item.number === window.__failOnce)) { window.__failOnce = 0; throw new Error('Máy chủ đang bận.'); }
        const reads = ${JSON.stringify(READS)};
        const body = btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + 86400 })).replace(/=+$/, '');
        const items = questions.map(item => reads[item.number]).filter(Boolean);
        return { items, missing: questions.map(item => item.number).filter(number => !reads[number]), explainTicket: body + '.signature', usage: {} };
      }
      export async function explainBatchWithAI(ticket, items) {
        (window.__explainCalls = window.__explainCalls || []).push(items.map(item => item.number));
        await new Promise(resolve => setTimeout(resolve, window.__explainDelay ?? 200));
        if (window.__explainFails) throw new Error('offline');
        return { failed: [], items: items.map(({ number, input }) => ({ number, draft: { part: input.part, category: 'VOCABULARY_TRAP',
          question: input.question, context: input.context, questionContext: input.question, options: input.options,
          correctAnswer: input.options[0], answerSource: 'AI_PROPOSED', userChoice: input.userChoice, userMistake: '', tags: [],
          missingInformation: [], trapTip: '', optionNotes: [], answerDoubt: number === 189 ? 'B' : '',
          explanation: { quickTip: ${JSON.stringify(TIP)}, translation: 'Mục đích của email là gì?', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '' } } })) };
      }`
  }));
}

export interface SeedTest { id: string; name: string; wrong: number[]; filled?: number[]; date?: string }
/** Stores tests and their cards exactly as saving them leaves them: a number-only draft per Reading wrong question. */
export async function seedTests(page: Page, tests: SeedTest[]) {
  await page.goto('/');
  await page.evaluate(seed => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = '2026-11-10T08:00:00.000Z';
    bundle.sessions = seed.map(test => ({ id: test.id, skillType: 'LR', sessionType: 'FULL_TEST', testName: test.name, date: test.date ?? '2026-11-10', durationMinutes: 120,
      scaledListening: 400, scaledReading: 385, totalScore: 785, wrongQuestions: test.wrong, createdAt: now, updatedAt: now, deletedAt: null }));
    bundle.mistakes = seed.flatMap(test => test.wrong.filter(number => number > 100).map(number => {
      const part = number <= 130 ? 5 : number <= 146 ? 6 : 7;
      const card = { id: `draft:${test.id}:${number}`, sessionId: test.id, sourceTestName: test.name, part, questionNumber: number,
        questionContext: '', question: '', userMistake: '', correctAnswer: '', answerSource: 'MISSING', userChoiceState: 'UNKNOWN',
        category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null };
      return (test.filled ?? []).includes(number) ? { ...card, question: `Question ${number}?`, questionContext: `Question ${number}?`,
        options: ['(A) one', '(B) two', '(C) three', '(D) four'], userChoice: 'B', userChoiceState: 'CHOSEN', userMistake: '(B) two',
        correctAnswer: '(A) one', answerSource: 'PROVIDED', category: 'VOCABULARY_TRAP' } : card;
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  }, tests);
  await page.reload();
}

/** Opens Gỡ câu sai for a test from the pink row in Sổ tay. */
export async function openFromNotebook(page: Page, name = TEST) {
  if (!page.url().includes('/so-tay')) await page.goto('/so-tay');
  const row = page.getByRole('button', { name: new RegExp(`câu chờ ghi chi tiết, ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  await row.first().click();
  return page.getByRole('dialog', { name: `Gỡ câu sai · ${name}`, exact: true });
}

export const stored = (page: Page, name = TEST) => page.evaluate(test => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .filter((card: { sourceTestName?: string; deletedAt?: string | null }) => card.sourceTestName === test && !card.deletedAt), name);

/** Capture's other ways: the phone's ⋯ sheet, or the computer's "Cách khác" menu. */
export async function captureMore(flow: Locator, name: string) {
  const dots = flow.getByRole('button', { name: 'Thêm lựa chọn', exact: true });
  if (await dots.isVisible()) {
    await dots.click();
    // Gỡ câu sai keeps its sheet inside the flow; the Sổ tay capture's sheet is a portal on the page.
    const inside = flow.getByRole('dialog', { name: 'Thêm lựa chọn' });
    const sheet = (await inside.count()) ? inside : flow.page().getByRole('dialog', { name: 'Thêm lựa chọn' });
    await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    return;
  }
  await flow.getByRole('button', { name: /^Cách khác/ }).click();
  await flow.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
}

/** A portrait "page" (600×800): a title block and ruled text lines, so thumbnails show the top of a page. */
export function pageTopPng(): { name: string; mimeType: string; buffer: Buffer } {
  const width = 600, height = 800;
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3, 255); row[0] = 0;
    const line = Math.floor((y - 90) / 30);
    let from = 0, to = 0, shade = 70;
    if (y >= 40 && y < 70) { from = 40; to = 260; shade = 40; }
    else if (y >= 90 && (y - 90) % 30 < 10) { from = 40; to = 40 + Math.round(width * (0.6 + 0.3 * ((line * 7) % 5) / 4)) - 40; shade = 90; }
    for (let x = from; x < to && x < width - 40; x += 1) { row[1 + x * 3] = shade; row[2 + x * 3] = shade; row[3 + x * 3] = shade; }
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return { name: 'page-top.png', mimeType: 'image/png', buffer: png };
}
