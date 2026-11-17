import { expect, test } from '@playwright/test';
import { gotoPage } from './helpers/nav';
import { openDesktopFlow, openPendingList, screenshot, TIP } from './helpers/detailAI';

test('manual choices before and during a delayed screenshot are preserved, including clearing', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await page.evaluate(() => { Object.assign(window, { __pageDelay: 1200, __explainDelay: 800 }); });
  await flow.getByRole('button', { name: /^Câu 104/ }).click();
  const choice = flow.getByRole('group', { name: 'Bạn chọn', exact: true });
  const answer = flow.getByRole('group', { name: 'Đáp án', exact: true });
  await choice.getByRole('button', { name: 'D', exact: true }).click();
  await answer.getByRole('button', { name: 'C', exact: true }).click();
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await expect.poll(() => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls?.length)).toBe(1);
  // Explicitly clear a value while the request is still in flight.
  await choice.getByRole('button', { name: 'D', exact: true }).click();
  await expect(flow.getByRole('status')).toContainText('Đã đọc 2 câu, cần kiểm tra');
  await expect(flow.getByRole('button', { name: 'Câu 104 đáp án C', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await expect(choice.getByRole('button', { name: 'B', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(answer.getByRole('button', { name: 'C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByText('Chưa có lời giải phù hợp với thông tin hiện tại.', { exact: false })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .find((card: { sourceTestName?: string; questionNumber?: number }) => card.sourceTestName === 'ETS Table' && card.questionNumber === 104));
  expect(saved).toMatchObject({ userChoiceState: 'UNKNOWN', correctAnswer: '(C) accommodation' });
  expect(saved.userChoice).toBeUndefined();
  expect(saved.explanation).toBeUndefined();
});

test('a late explanation reaches a saved partial card reopened in the pending list', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await page.evaluate(() => { Object.assign(window, { __explainDelay: 4000 }); });
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await expect(flow.getByRole('status')).toContainText('Đã đọc ảnh, cần kiểm tra');
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await openPendingList(page);
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, chưa có đáp án', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^Câu 112/ }).click();
  await expect(flow.getByText(TIP)).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Câu 112 Bạn chọn B, đáp án A', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^Lưu \d câu$/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .find((card: { sourceTestName?: string; questionNumber?: number }) => card.sourceTestName === 'ETS Table' && card.questionNumber === 112));
  expect(saved.explanation.quickTip).toBe(TIP);
  expect(saved.correctAnswer).toBe('(A) accommodates');
});

test('retakes with overlapping question numbers open distinct screenshot lists', async ({ page }) => {
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
  // One row per attempt (the rows do not name the attempt on computers, so the second is picked by position).
  await expect(page.locator('.nb-pend').filter({ hasText: 'ETS Table' })).toHaveCount(2);
  await openPendingList(page, 'ETS Table', 1);
  await expect(flow.locator('[data-row-toggle]')).toHaveCount(3);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await expect(flow.getByRole('status')).toContainText('Đã đọc 2 câu, cần kiểm tra');
  expect(await page.evaluate(() => (window as Window & { __pageCalls: unknown }).__pageCalls)).toEqual([{ questions: [104, 112, 131], images: 1 }]);
});

test('changing accounts during screenshot reading cancels later chunks and explanation dispatch', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await page.evaluate(() => { Object.assign(window, { __pageDelay: 1200 }); });
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles([screenshot, screenshot, screenshot, screenshot]);
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
