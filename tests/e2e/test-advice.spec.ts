import { test, expect, type Page, type Route } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';
import { openManualEntry } from './helpers/manualEntry';
import { phoneLogger, phoneManualScore, sessionDialog, setWheel, usePartCounts } from './helpers/sessionForm';

// "Sóc nhận xét đề này": e2e runs without Supabase or a backend, so the advice transport module is replaced by one
// that reports a signed-in (or guest) account and posts to the analyze-attempt URL, which page.route answers.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const BUNDLE = 'toeic_progress_bundle_v3';
const LATEST = 'demo-session-6';

const REPORT = {
  version: 2, model: 'gpt-6-luna', signature: 'a'.repeat(64),
  priorities: [
    { title: 'Part 7 đang kéo điểm nhiều nhất, gỡ nó trước nhé', observation: 'Part 7 sai nhiều nhất đề này, và câu đoạn kép bạn ghi lại cho thấy bạn đọc lướt bảng lịch trình rồi chọn luôn mốc giờ đầu tiên gặp được.',
      practice: 'bấm giờ một đoạn kép, đọc câu hỏi trước rồi mới tìm trong bài.', part: 7, evidenceIds: ['mistake-1'], minutes: 20 },
    { title: 'Part 5: đảo ngữ', observation: 'Câu Hardly bạn chọn theo thói quen chủ ngữ đứng trước.', practice: 'ôn lại câu đảo ngữ trong Sổ tay, tự đoán trước khi xem đáp án.',
      part: 5, evidenceIds: ['mistake-2'], minutes: 15 }
  ],
  parts: [{ part: 7, correct: 46, total: 54, wrong: 8 }], linkedNotes: 2, sampledNotes: 2
};

async function mockTransport(page: Page, opts: { guest?: boolean; remaining?: number } = {}) {
  await page.route('**/src/features/journey/services/adviceTransport.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function adviceEnabled() { return true; }
    export async function adviceAccount() { return ${opts.guest ? "{ kind: 'guest' }" : "{ kind: 'signed', owner: 'e2e-owner' }"}; }
    export async function readAdviceUsage() { return { remaining: ${opts.remaining ?? 8}, limit: 10, guest: false }; }
    export async function postAnalyzeAttempt(body, owner, isCurrent, cancel) {
      window.__adviceBodies = [...(window.__adviceBodies || []), body];
      const response = await fetch('/api/v1/ai/analyze-attempt', { method: 'POST', body: JSON.stringify(body), signal: cancel, headers: { 'Content-Type': 'application/json' } });
      const value = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(value?.detail || 'Lỗi');
        Object.assign(error, { status: response.status, code: response.headers.get('X-Error-Code') || undefined, retryAfter: Number(response.headers.get('Retry-After')) || undefined });
        throw error;
      }
      return value;
    }
  ` }));
}

const answer = (route: Route, status = 200, body: unknown = { report: REPORT, usage: { remaining: 7, limit: 10, guest: false } }, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

async function demo(page: Page, path = '/lich-su') {
  await page.goto(path);
  await page.evaluate(async () => { localStorage.clear(); (await import('/src/shared/data/storage.ts' as string)).loadDemoData(); });
  await page.reload();
}

async function openLatestTest(page: Page) {
  await page.getByRole('tab', { name: /^Các đề/ }).click();
  const phone = (page.viewportSize()?.width ?? 1280) < 768;
  await (phone ? page.locator('.jp-row').filter({ hasText: 'ETS 2024 Test 04' }) : page.locator('.jr-row').filter({ hasText: 'ETS 2024 Test 04' })).first().click();
  return page.getByRole('dialog', { name: 'ETS 2024 Test 04' });
}

for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
  test(`${label}: consent, result, add to Hôm nay and start the task`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockTransport(page);
    let calls = 0;
    await page.route('**/api/v1/ai/analyze-attempt', route => { calls++; return answer(route); });
    await demo(page);
    const detail = await openLatestTest(page);
    const advice = detail.getByTestId('test-advice');
    await expect(advice.getByText('Sóc nhận xét đề này')).toBeVisible();
    await expect(advice.getByText('còn 8 lượt tháng này')).toBeVisible();
    const ask = advice.getByRole('button', { name: 'Nhờ Sóc xem', exact: true });
    await expect(ask).toBeDisabled();
    await advice.getByRole('checkbox', { name: /cho OpenAI/ }).check();
    await ask.click();

    await expect(advice.getByText('Part 7 đang kéo điểm nhiều nhất, gỡ nó trước nhé.')).toBeVisible();
    // Previous full test (Test 01 retake, 870) → Test 04: the praise line is computed locally.
    await expect(advice.locator('.ta-praise')).toHaveCount(1);
    expect(calls).toBe(1);
    const body = (await page.evaluate(() => (window as Window & { __adviceBodies: Record<string, unknown>[] }).__adviceBodies))[0];
    expect(Object.keys(body).sort()).toEqual(['attemptId', 'consent', 'noteVersions', 'provider', 'request_id', 'sessionVersion']);
    expect(body).toMatchObject({ attemptId: LATEST, consent: true, provider: 'openai' });
    expect(Object.keys(body.noteVersions as object).sort()).toEqual(['mistake-1', 'mistake-2']);

    await advice.getByRole('button', { name: 'Còn 1 việc nữa' }).click();
    await expect(advice.locator('.ta-card')).toHaveCount(2);
    await advice.getByRole('button', { name: '＋ Thêm vào việc hôm nay' }).first().click();
    await expect(advice.getByText('✓ Đã thêm vào Hôm nay')).toBeVisible();
    await expect(advice.getByText('Làm ngày')).toBeVisible();
    await expect(advice.getByRole('button', { name: 'Cập nhật lại · còn 7 lượt' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Consent is remembered; reopening shows the cached result without a new request.
    await page.keyboard.press('Escape');
    await page.goto('/');
    const task = page.getByText('Bấm giờ Part 7 · 20′');
    await expect(task).toBeVisible();
    await expect(page.getByText(/Sóc gợi ý từ đề 13\/09/).first()).toBeVisible();
    if (label === 'desktop') await page.locator('.td-sug').getByRole('button', { name: 'Làm', exact: true }).click();
    else await page.locator('.tp-sug .tp-row').click();
    await expect(page).toHaveURL(/\/luyen-toc-do$/);

    await page.goto('/lich-su');
    const again = await openLatestTest(page);
    await expect(again.getByText('Part 7 đang kéo điểm nhiều nhất, gỡ nó trước nhé.')).toBeVisible();
    expect(calls).toBe(1);
  });
}

test('ticking the suggested task on Hôm nay counts it done for today', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockTransport(page);
  await page.route('**/api/v1/ai/analyze-attempt', route => answer(route));
  await demo(page);
  const detail = await openLatestTest(page);
  await detail.getByRole('checkbox', { name: /cho OpenAI/ }).check();
  await detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true }).click();
  await detail.getByRole('button', { name: '＋ Thêm vào việc hôm nay' }).click();
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.getByRole('button', { name: 'Đánh dấu xong: Bấm giờ Part 7 · 20′' }).click();
  await expect(page.getByRole('button', { name: 'Bỏ đánh dấu: Bấm giờ Part 7 · 20′' })).toHaveAttribute('aria-pressed', 'true');
  const tasks = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).profile.suggestedTasks, BUNDLE);
  expect(tasks[0].doneDate).toMatch(/^\d{4}-\d\d-\d\d$/);
});

test('the advice turns stale after the test changes and can be refreshed', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockTransport(page);
  await page.route('**/api/v1/ai/analyze-attempt', route => answer(route));
  await demo(page);
  let detail = await openLatestTest(page);
  await detail.getByRole('checkbox', { name: /cho OpenAI/ }).check();
  await detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true }).click();
  await expect(detail.getByText('Part 7 đang kéo điểm nhiều nhất, gỡ nó trước nhé.')).toBeVisible();
  await expect(detail.getByText(/Bạn vừa sửa điểm/)).toHaveCount(0);
  // Editing the score stamps a new updatedAt on the test.
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const s = data.sessions.find((x: { id: string }) => x.id === 'demo-session-6');
    s.totalScore = 900; s.updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(data));
  }, BUNDLE);
  await page.reload();
  detail = await openLatestTest(page);
  await expect(detail.getByText('Bạn vừa sửa điểm hoặc câu sai, nhận xét có thể lệch.')).toBeVisible();
  await detail.getByRole('button', { name: 'Cập nhật lại', exact: true }).click();
  await expect(detail.getByText(/Bạn vừa sửa điểm/)).toHaveCount(0);
});

test('quota, sync and provider errors say whether a turn was used', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockTransport(page);
  let mode: 'quota' | 'sync' | 'timeout' = 'sync';
  await page.route('**/api/v1/ai/analyze-attempt', route => mode === 'sync'
    ? answer(route, 409, { detail: 'Dữ liệu trên máy và đám mây chưa trùng nhau. Chờ đồng bộ xong rồi phân tích lại; chưa dùng lượt AI.' }, { 'X-Error-Code': 'ANALYSIS_WAIT_SYNC' })
    : mode === 'timeout' ? answer(route, 504, { detail: 'OpenAI chưa trả lời.' }, { 'X-Error-Code': 'ANALYSIS_PROVIDER_TIMEOUT' })
    : answer(route, 429, { detail: 'Tài khoản đã dùng hết 10 lượt phân tích AI trong tháng.' }));
  await demo(page);
  const detail = await openLatestTest(page);
  await detail.getByRole('checkbox', { name: /cho OpenAI/ }).check();
  await detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true }).click();
  await expect(detail.getByText(/Chờ đồng bộ xong rồi phân tích lại; chưa dùng lượt AI/)).toBeVisible();
  mode = 'timeout';
  await detail.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(detail.getByText('Lượt này đã được tính. Bạn thử lại sau ít phút nhé.')).toBeVisible();
  mode = 'quota';
  await detail.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(detail.getByText('Hết lượt nhận xét tháng này')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true })).toBeDisabled();
  await expect(detail.getByText('còn 0 lượt tháng này')).toBeVisible();
});

test('Huỷ stops waiting and returns to the button', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockTransport(page);
  await page.route('**/api/v1/ai/analyze-attempt', async route => { await new Promise(r => setTimeout(r, 4000)); await answer(route).catch(() => {}); });
  await demo(page);
  const detail = await openLatestTest(page);
  await detail.getByRole('checkbox', { name: /cho OpenAI/ }).check();
  await detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true }).click();
  await expect(detail.getByText('Sóc đang đọc đề…')).toBeVisible();
  await detail.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(detail.getByText('Sóc đang đọc đề…')).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Nhờ Sóc xem', exact: true })).toBeEnabled();
  await page.waitForTimeout(4500);
  await expect(detail.getByText(/Part 7 đang kéo điểm/)).toHaveCount(0);
});

for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
  test(`${label}: a guest is asked to sign in`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockTransport(page, { guest: true });
    await page.route('**/api/v1/ai/analyze-attempt', () => { throw new Error('must not be called'); });
    await demo(page);
    const detail = await openLatestTest(page);
    await expect(detail.getByText('Đăng nhập để nhờ Sóc nhận xét')).toBeVisible();
    await page.evaluate(() => window.addEventListener('toeic:ai-sign-in', () => { (window as Window & { __signIn?: number }).__signIn = 1; }));
    await detail.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    expect(await page.evaluate(() => (window as Window & { __signIn?: number }).__signIn)).toBe(1);
  });
}

test('without a backend the advice block stays hidden', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await demo(page);
  const detail = await openLatestTest(page);
  await expect(detail.getByText('Part 7', { exact: true })).toBeVisible();
  await expect(detail.getByTestId('test-advice')).toHaveCount(0);
});

for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
  test(`${label}: "Nhờ Sóc xem đề này" on the result screen opens that test with the advice in view`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockTransport(page);
    await demo(page, '/');
    await openScoreLogger(page);
    if (label === 'phone') {
      const dialog = phoneLogger(page);
      await phoneManualScore(page, 'Advice Test 9');
      await setWheel(dialog, 'Điểm Nghe', 400);
      await setWheel(dialog, 'Điểm Đọc', 350);
      await dialog.getByRole('button', { name: 'Lưu điểm 750', exact: true }).click();
    } else {
      const modal = sessionDialog(page);
      await openManualEntry(page, modal);
      await modal.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/).fill('Advice Test 9');
      await usePartCounts(modal);
      await modal.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Nhờ Sóc xem đề này' }).click();
    await expect(page).toHaveURL(/\/lich-su$/);
    const detail = page.getByRole('dialog', { name: 'Advice Test 9' });
    await expect(detail.getByTestId('test-advice')).toBeInViewport();
  });
}
