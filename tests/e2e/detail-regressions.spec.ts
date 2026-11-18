import { expect, test } from '@playwright/test';
import { gotoPage } from './helpers/nav';
import { openDesktopFlow, openPendingList, screenshot, storedCard, TIP } from './helpers/detailAI';

test('answers typed by hand before a screenshot win over what the screenshot shows', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await flow.getByRole('button', { name: '✎ Ghi tay một câu', exact: true }).click();
  const card = flow.getByRole('group', { name: 'Ghi tay một câu' });
  await expect(card.getByRole('button', { name: '104', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'D', exact: true }).click();
  await card.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'D', exact: true }).click();
  await card.getByRole('button', { name: 'Lưu câu 104', exact: true }).click();
  // Save validation stays: the chosen answer cannot be the right one.
  await expect(card.getByRole('alert')).toHaveText('Câu 104: Đáp án bạn chọn trùng đáp án đúng.');
  await card.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'C', exact: true }).click();
  await card.getByRole('button', { name: 'Đóng ghi tay', exact: true }).click();

  await page.evaluate(() => { Object.assign(window, { __pageDelay: 800 }); });
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 1 ảnh', exact: true }).click();
  await expect(flow.getByRole('status').filter({ hasText: 'Sóc đang đọc' })).toBeVisible();
  await expect(flow.getByRole('group', { name: 'Câu 104: Bạn chọn D, đáp án C', exact: true })).toBeVisible();
  // The explanation was written for the screenshot's choice, so it is not offered for the learner's.
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await expect(flow.getByText('Chưa có lời giải phù hợp với thông tin hiện tại.', { exact: false })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  const saved = await storedCard(page, 104);
  expect(saved).toMatchObject({ userChoice: 'D', userChoiceState: 'CHOSEN', correctAnswer: '(C) accommodation' });
  expect(saved.explanation).toBeUndefined();
});

test('a late explanation reaches a card saved before it arrived', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await page.evaluate(() => { Object.assign(window, { __explainDelay: 3000 }); });
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 1 ảnh', exact: true }).click();
  await expect(flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, chưa có đáp án', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect.poll(async () => (await storedCard(page, 112))?.explanation?.quickTip, { timeout: 8000 }).toBe(TIP);
  expect((await storedCard(page, 112)).correctAnswer).toBe('(A) accommodates');
  await expect(flow.getByText(/câu nháp chưa lưu/)).toHaveCount(0);
});

test('retakes with overlapping question numbers open their own Gỡ câu sai', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.evaluate(() => {
    const key = 'toeic_progress_bundle_v3', bundle = JSON.parse(localStorage.getItem(key)!);
    const first = bundle.sessions.find((session: { testName: string }) => session.testName === 'ETS Table');
    bundle.sessions.push({ ...first, id: 'retake-ets', date: '2026-10-21', createdAt: '2026-10-21T10:00:00Z', attemptNumber: 2 });
    const original = bundle.mistakes.filter((card: { sessionId?: string }) => card.sessionId === first.id);
    bundle.mistakes.push(...original.map((card: { id: string }) => ({ ...card, id: `retake:${card.id}`, sessionId: 'retake-ets', createdAt: '2026-10-21T10:00:00Z' })));
    localStorage.setItem(key, JSON.stringify(bundle));
  });
  await page.reload();
  await gotoPage(page, '/so-tay');
  // Two attempts of one test: the row lists both, each opening its own questions.
  await expect(page.getByRole('button', { name: /câu chờ ghi chi tiết, ETS Table/ })).toHaveCount(2);
  await openPendingList(page, 'ETS Table', 1);
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 1 ảnh', exact: true }).click();
  await expect(flow.getByRole('heading', { name: /^Sóc đọc được 2 câu/ })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { questionNumber?: number; question?: string }) => card.questionNumber === 104 && card.question)
    .map((card: { sessionId: string }) => card.sessionId));
  expect(cards).toHaveLength(1);
});

test('changing accounts during screenshot reading cancels later readings and explanation dispatch', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await page.evaluate(() => { Object.assign(window, { __pageDelay: 1200 }); });
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot, screenshot]);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 3 ảnh', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls?.length)).toBe(1);
  await page.evaluate(async () => {
    const path = '/src/shared/data/dataBundle.ts';
    const database = await import(/* @vite-ignore */ path);
    database.writeAccountBundle('detail-other-owner', database.emptyBundle());
    database.activateAccount('detail-other-owner');
    database.setAccountWriteEnabled(true);
    window.dispatchEvent(new Event('toeic:mistakes-changed'));
  });
  await expect(flow).toHaveCount(0);
  await page.waitForFunction(() => (window as Window & { __pageFinished?: number }).__pageFinished === 1);
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => ({
    reads: (window as Window & { __pageCalls?: unknown[] }).__pageCalls,
    explanations: (window as Window & { __explainCalls?: unknown[] }).__explainCalls ?? [],
    tickets: localStorage.getItem('toeic_explain_tickets_v1'),
    mistakes: JSON.parse(localStorage.getItem('toeic_progress_account_detail-other-owner_v3')!).mistakes
  }));
  expect(calls.reads).toHaveLength(1);
  expect(calls.explanations).toEqual([]);
  expect(calls.tickets).toBeNull();
  expect(calls.mistakes).toEqual([]);
});
