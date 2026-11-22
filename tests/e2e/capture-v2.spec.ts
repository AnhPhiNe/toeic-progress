import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mockWrongDetailAI, openFromNotebook, screenshot, seedTests, stored, TEST, WRONG } from './helpers/wrongDetail';

type Call = { questions: number[]; images: number; context: number; batch: string };
const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []) as Promise<Call[]>;
const DESKTOP = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844 };
// CV_SHOTS=1 saves the built screens next to the approved mockups (design/previews/capture-v2/built).
const BUILT = process.env.CV_SHOTS_DIR ?? 'design/previews/capture-v2/built';
async function shot(page: Page, name: string) {
  if (!process.env.CV_SHOTS) return;
  mkdirSync(BUILT, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${BUILT}/${name}.png` });
}

/** The approved mockup's test: 2 Listening, 3 + 1 Part 5, one Part 6 and two Part 7 questions. */
const SEVEN = [14, 22, 38, 45, 46, 71, 88, 103, 107, 112, 128, 135, 149, 189];
const OPTIONS = ['(A) by', '(B) until', '(C) at', '(D) since'];
const read = (number: number, question: string, choice: string, answer: string, context = '') => ({
  number, draft: { part: number >= 147 ? 7 : number >= 131 ? 6 : 5, category: 'VOCABULARY_TRAP', question, questionContext: question, context,
    options: OPTIONS, correctAnswer: OPTIONS['ABCD'.indexOf(answer)], answerSource: 'PROVIDED', userChoice: choice, userChoiceState: 'CHOSEN',
    userMistake: '', trapTip: '', tags: [], missingInformation: [], optionNotes: [], explanation: null }
});
const EMAIL = 'Đoạn 1 — Email\nFrom: Lena Ortiz\nI am writing about my stay.';
const SEVEN_READS: Record<number, ReturnType<typeof read>> = {
  103: read(103, 'The manager asked that all reports ___ by Friday.', 'B', 'C'),
  107: read(107, 'Ms. Lee has worked ___ the finance team since 2019.', 'A', 'D'),
  112: read(112, 'Tickets are available ___ the front desk.', 'D', 'B'),
  128: read(128, 'The new parking policy will take effect ___ the end of the month.', 'B', 'C'),
  135: read(135, 'Đoạn 135–138 · thư gửi khách hàng', 'C', 'A', 'Dear customer, …'),
  149: read(149, 'What is the purpose of the e-mail?', 'A', 'C', EMAIL),
  189: read(189, 'What will Ms. Tran most likely do next?', 'B', 'D', EMAIL)
};

/** A reading module that knows the seven questions; 128's number is one Sóc guessed. */
async function mockSeven(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true, pageContextImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions, images, getToken, owner, isCurrent, batchId, contextImages = []) {
        (window.__pageCalls = window.__pageCalls || []).push({ questions: questions.map(item => item.number), images: images.length, context: contextImages.length, batch: batchId });
        await new Promise(resolve => setTimeout(resolve, window.__pageDelay ?? 0));
        const reads = ${JSON.stringify(SEVEN_READS)};
        const items = questions.map(item => reads[item.number]).filter(Boolean).map(item => item.number === 128 ? { ...item, numberSource: 'inferred' } : item);
        return { items, missing: questions.map(item => item.number).filter(number => !reads[number]), explainTicket: null, explainNumbers: [], usage: {} };
      }
      export async function explainBatchWithAI() { return { failed: [], items: [] }; }`
  }));
}

async function openSeven(page: Page, size = DESKTOP) {
  await page.setViewportSize(size);
  await mockSeven(page);
  await seedTests(page, [{ id: 's7', name: TEST, wrong: SEVEN }]);
  return openFromNotebook(page);
}

test('Listening comes first: several numbers take one reason, Sóc suggests the usual one', async ({ page }) => {
  const flow = await openSeven(page);
  await expect(flow.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
  // Every open number starts selected; the suggestion is the default reason.
  await expect(flow.getByRole('button', { name: 'Gán cho 7 câu', exact: true })).toBeVisible();
  const reasons = flow.getByRole('group', { name: 'Lý do sai' });
  await expect(reasons.getByRole('button', { name: /Không kịp tốc độ.*Sóc gợi ý/ })).toHaveAttribute('aria-pressed', 'true');
  for (const number of [14, 22, 46, 88]) await flow.getByRole('button', { name: `Câu ${number}`, exact: true }).click();
  await expect(flow.getByText('Còn câu 14, 22, 46, 88')).toBeVisible();
  await reasons.getByRole('button', { name: /Không biết từ/ }).click();
  await flow.getByRole('button', { name: 'Gán cho 3 câu', exact: true }).click();
  await expect(flow.getByLabel('Câu 38, đã ghi lý do')).toContainText('từ vựng');
  const saved = await stored(page);
  expect(saved.filter((card: { part: number }) => card.part <= 4).map((card: { questionNumber: number; category: string }) => [card.questionNumber, card.category]).sort((a: [number], b: [number]) => a[0] - b[0]))
    .toEqual([[38, 'VOCABULARY_TRAP'], [45, 'VOCABULARY_TRAP'], [71, 'VOCABULARY_TRAP']]);
  // The rest is selected for the next reason; Sóc now suggests the learner's own most used one.
  await expect(flow.getByRole('button', { name: 'Gán cho 4 câu', exact: true })).toBeVisible();
  await expect(reasons.getByRole('button', { name: /Không biết từ.*Sóc gợi ý/ })).toBeVisible();
  for (const number of [46, 88]) await flow.getByRole('button', { name: `Câu ${number}`, exact: true }).click();
  await shot(page, '5-listening-desktop');
  await flow.getByRole('button', { name: 'Gán cho 2 câu', exact: true }).click();
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Phần Nghe còn 2 câu · Ghi lý do', exact: true })).toBeVisible();
});

test('on a phone Listening asks only "Sai vì sao?" and assigns the chosen numbers', async ({ page }) => {
  const flow = await openSeven(page, PHONE);
  await expect(flow.getByRole('heading', { name: 'Sai vì sao?', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Đổi', exact: true }).click();
  for (const number of [14, 22, 46, 88]) await flow.getByRole('button', { name: `Câu ${number}`, exact: true }).click();
  await flow.getByRole('button', { name: 'Xong · 3 câu', exact: true }).click();
  await shot(page, '5-listening-phone');
  await flow.getByRole('button', { name: /^Mất tập trung/ }).click();
  await flow.getByRole('button', { name: 'Gán cho 3 câu', exact: true }).click();
  await expect(flow.getByText('Còn câu', { exact: false })).toHaveCount(0);
  await flow.getByRole('button', { name: /^Không kịp tốc độ/ }).click();
  await flow.getByRole('button', { name: 'Gán cho 4 câu', exact: true }).click();
  // Listening is done: the capture opens on the first Tấm.
  await expect(flow.getByRole('button', { name: 'Cần chụp 0/5', exact: true })).toBeVisible();
  expect((await stored(page)).filter((card: { part: number }) => card.part <= 4)).toHaveLength(7);
});

for (const size of [DESKTOP, PHONE]) {
  const phone = size === PHONE;
  test(`the shot list ticks itself after a reading and Soát opens doubtful rows only (${phone ? 'phone' : 'desktop'})`, async ({ page }) => {
    const flow = await openSeven(page, size);
    await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
    const list = async () => { if (phone) await flow.getByRole('button', { name: /^Cần chụp \d/ }).click(); };
    await list();
    // Derived from the wrong list: 103, 107, 112 share one Tấm; 128 has its own.
    for (const name of ['Tấm 1 · câu 103–112', 'Tấm 2 · câu 128', 'Nhóm 135–138', 'Nhóm 149–150', 'Nhóm 186–190']) {
      await expect(flow.getByRole('button', { name, exact: true })).toBeVisible();
    }
    if (phone) await flow.getByRole('button', { name: 'Tấm 1 · câu 103–112', exact: true }).click();
    await page.evaluate(() => { (window as Window & { __pageDelay?: number }).__pageDelay = 600; });
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
    await flow.getByRole('button', { name: phone ? 'Xong tấm' : /^Tấm tiếp: câu 128/ }).click();
    // One reading looks for every open Part 5 number; the Tấm ticks when its numbers come back.
    await list();
    await expect(flow.getByRole('button', { name: 'Tấm 1 · câu 103–112, xong', exact: true })).toBeVisible();
    await expect(flow.getByRole('button', { name: 'Tấm 2 · câu 128, xong', exact: true })).toBeVisible();
    expect((await calls(page))[0].questions).toEqual([103, 107, 112, 128]);
    if (phone) await flow.getByRole('button', { name: 'Nhóm 135–138', exact: true }).click();
    else await flow.getByRole('button', { name: 'Nhóm 135–138', exact: true }).click();
    for (const [label, next] of [['Ảnh câu hỏi', /^Nhóm tiếp: 149–150|^Xong nhóm$/], ['Ảnh câu hỏi', /^Nhóm tiếp: 186–190|^Xong nhóm$/], ['Ảnh câu hỏi', /^Xong nhóm cuối|^Xong nhóm$/]] as const) {
      await flow.getByLabel(label, { exact: true }).setInputFiles(screenshot);
      await flow.getByRole('button', { name: next }).click();
    }
    // After the last group Soát opens by itself once every reading is back.
    await expect(flow.getByRole('button', { name: 'Lưu tất cả (7)', exact: true })).toBeVisible({ timeout: 10000 });
    const check = flow.getByRole('region', { name: 'Kiểm lại câu 128' });
    await expect(check).toContainText('Sóc đoán là câu 128');
    await expect(flow.getByRole('region', { name: /^Kiểm lại/ })).toHaveCount(1);
    await expect(flow.getByRole('button', { name: /^Mở câu / })).toHaveCount(6);
    await shot(page, `4-soat-${phone ? 'phone' : 'desktop'}`);
    await check.getByRole('button', { name: '128', exact: true }).click();
    await expect(flow.getByRole('region', { name: /^Kiểm lại/ })).toHaveCount(0);
    await flow.getByRole('button', { name: 'Lưu tất cả (7)', exact: true }).click();
    await expect.poll(async () => (await stored(page)).filter((card: { question?: string }) => card.question).length).toBe(7);
  });
}

test('Part 7 continuous capture: "Nhóm tiếp" sends group 1 and moves to group 2 while Sóc reads', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  const flow = await openFromNotebook(page);
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  await flow.getByRole('button', { name: 'Nhóm 181–185', exact: true }).click();
  await page.evaluate(() => { (window as Window & { __pageDelay?: number }).__pageDelay = 2500; });
  await expect(flow.getByRole('heading', { name: /^Nhóm 181–185/ })).toBeVisible();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: /^Nhóm tiếp: 186–190/ }).click();
  await expect(flow.getByRole('heading', { name: /^Nhóm 186–190/ })).toBeVisible();
  await expect(flow.getByRole('status', { name: 'Các nhóm đã gửi' })).toContainText('181–185 · Sóc đang đọc');
  await expect(flow.getByRole('button', { name: 'Nhóm 181–185, Sóc đang đọc', exact: true })).toBeVisible();
  await shot(page, '3-part7-lien-tuc-desktop');
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: /^Nhóm tiếp: 191–195/ }).click();
  await expect.poll(async () => (await calls(page)).map(call => call.questions)).toEqual([[181, 182, 183, 184, 185], [186, 187, 188, 189, 190]]);
  // One sitting, one AI use.
  expect(new Set((await calls(page)).map(call => call.batch)).size).toBe(1);
  await expect(flow.getByRole('status', { name: 'Các nhóm đã gửi' })).toContainText('186–190 · 2 câu', { timeout: 10000 });
});

for (const size of [DESKTOP, PHONE]) {
  const phone = size === PHONE, kind = phone ? 'phone' : 'desktop';
  test(`screens for the design review (${kind})`, async ({ page }) => {
    test.skip(!process.env.CV_SHOTS, 'CV_SHOTS=1 takes the built screenshots');
    const flow = await openSeven(page, size);
    await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
    await shot(page, `2a-can-chup-part5-${kind}-staged`);
    await flow.getByRole('button', { name: phone ? 'Xong tấm' : /^Tấm tiếp/ }).click();
    if (phone) await flow.getByRole('button', { name: /^Cần chụp \d/ }).click();
    await flow.getByRole('button', { name: /^Nhóm 149–150/ }).click();
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).last().setInputFiles(screenshot);
    await shot(page, `2b-can-chup-part7-${kind}`);
    await page.evaluate(() => { (window as Window & { __pageDelay?: number }).__pageDelay = 4000; });
    await flow.getByRole('button', { name: phone ? 'Xong nhóm' : /^Nhóm tiếp: 186–190/ }).click();
    await flow.getByLabel('Đoạn văn', { exact: false }).first().isVisible();
    await shot(page, `3-part7-lien-tuc-${kind}`);
    if (phone) await flow.getByRole('button', { name: /^Cần chụp \d/ }).click();
    else await flow.getByRole('button', { name: /^Tấm 2/ }).click();
    await shot(page, `2a-can-chup-part5-${kind}`);
  });
}
