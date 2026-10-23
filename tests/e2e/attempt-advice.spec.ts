import { expect, test, type Page } from '@playwright/test';
import { emptyBundle } from '../../frontend/src/shared/data/dataBundle';

async function setup(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  const bundle = emptyBundle();
  const stamp = '2026-10-23T00:00:00Z';
  bundle.sessions = ['old', 'current'].map((id, index) => ({ id, testName: 'QA attempt advice', skillType: 'LR', sessionType: 'FULL_TEST',
    date: `2026-10-${22 + index}`, durationMinutes: 120, createdAt: stamp, updatedAt: stamp, totalScore: 700,
    partScores: { part1: 5, part2: 23, part3: 35, part4: 25, part5: 25, part6: 13, part7: 45 } }));
  bundle.mistakes = ['old', 'current', 'source-only'].map(id => ({ id: `note-${id}`, sessionId: id === 'source-only' ? undefined : id,
    sourceTestName: 'QA attempt advice', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
    questionContext: `Evidence for ${id} attempt`, userMistake: 'A', correctAnswer: '(B) submitted', tags: [], createdAt: stamp, updatedAt: stamp }));
  await page.addInitScript(bundle => {
    if (!localStorage.getItem('toeic_progress_account_alice_v3')) localStorage.setItem('toeic_progress_account_alice_v3', JSON.stringify(bundle));
    localStorage.setItem('toeic_active_account_v1', 'alice');
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  }, bundle);
  await page.route('**/src/features/account/hooks/useCloudAccount.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function useCloudAccount() { return { available: true, hasAccountSession: true, status: 'synced', email: 'alice@example.test',
      error: '', pendingTransfer: null, signOut: async()=>{}, retry: async()=>{}, signInGoogle: async()=>{},
      sendOtp: async()=>false, verifyOtp: async()=>{}, deleteAccount: async()=>{}, resetLearningData: async()=>{}, chooseTransfer: async()=>{} }; }
  ` }));
  await page.route('**/src/shared/api/supabaseClient.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const cloud = { auth: { getSession: async () => ({ data: { session: { user: { id: localStorage.getItem('toeic_active_account_v1'), is_anonymous: false } } } }) } };
  ` }));
  await page.route('**/src/shared/api/api.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const apiAvailable = true;
    export class ApiRequestError extends Error {}
    export async function backendRequest(path, method, body, owner, current) {
      if (!path.includes('analyze-attempt')) return {};
      window.__adviceCalls = [...(window.__adviceCalls || []), { body, owner }];
      if (window.__holdAdvice) await new Promise(resolve => { window.__releaseAdvice = resolve; });
      if (window.__adviceError) throw new Error(window.__adviceError);
      return { report: { version: 1, model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', signature: 'a'.repeat(64),
        priorities: [{ title: 'Đối chiếu cấu trúc bị động', observation: 'Câu đã lưu cho thấy cần đối chiếu cấu trúc.',
          practice: 'Làm lại câu và nêu căn cứ để loại từng phương án trước khi xem đáp án.', part: 5,
          evidenceIds: ['note-' + body.attemptId], minutes: 15 }],
        parts: [{ part: 5, correct: 25, total: 30, wrong: 5 }], linkedNotes: 1, sampledNotes: 1 } };
    }
  ` }));
  await page.goto('/phan-tich');
  const panel = page.getByRole('region', { name: 'Chẩn đoán & Gợi ý ôn tập', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
const calls = (page: Page) => page.evaluate(() => (window as Window & { __adviceCalls?: { body: { attemptId: string; noteVersions: Record<string, string> }; owner: string }[] }).__adviceCalls || []);

for (const width of [390, 1280]) {
  test(`advice is explicit, scoped, cached and usable at ${width}px`, async ({ page }, testInfo) => {
    test.slow();
    let panel = await setup(page, width);
    expect(await calls(page)).toEqual([]);
    await expect(panel.getByText('Chưa phân tích')).toBeVisible();

    // Click button on panel to open modal
    await panel.getByRole('button', { name: 'Phân tích đề này với AI ›', exact: true }).click();
    const modal = page.getByRole('dialog', { name: /Chẩn đoán & Gợi ý ôn tập/i });
    await expect(modal).toBeVisible();

    const submitBtn = modal.getByRole('button', { name: 'Bắt đầu Chẩn đoán bằng AI', exact: true });
    await expect(submitBtn).toBeDisabled();

    // Consent check
    await modal.getByRole('checkbox').check();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Modal renders report
    await expect(modal.getByRole('heading', { name: /Đối chiếu cấu trúc bị động/ })).toBeVisible();
    expect(await calls(page)).toHaveLength(1);
    expect((await calls(page))[0]).toMatchObject({ owner: 'alice', body: { attemptId: 'current', noteVersions: { 'note-current': '2026-10-23T00:00:00Z' } } });
    expect(Object.keys((await calls(page))[0].body.noteVersions)).toEqual(['note-current']);

    // Evidence is visible in report
    await expect(modal.getByText('Evidence for current attempt', { exact: true })).toBeVisible();
    await expect(modal.getByText('Evidence for old attempt', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`attempt-advice-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Navigate to plan from modal
    await modal.getByRole('button', { name: 'Thêm vào Kế hoạch tuần', exact: true }).click();
    await expect(page).toHaveURL(/ke-hoach/);

    // Return to analytics and check cached badge
    await page.goto('/phan-tich');
    panel = page.getByRole('region', { name: 'Chẩn đoán & Gợi ý ôn tập', exact: true });
    await expect(panel.getByText('✓ Báo cáo có sẵn')).toBeVisible();
    expect(await calls(page)).toEqual([]); // No extra call on fresh navigation
  });
}

test('changing attempt invalidates a late response and does not cache it', async ({ page }) => {
  const panel = await setup(page);
  await page.evaluate(() => { (window as Window & { __holdAdvice: boolean }).__holdAdvice = true; });

  await panel.getByRole('button', { name: 'Phân tích đề này với AI ›', exact: true }).click();
  const modal = page.getByRole('dialog', { name: /Chẩn đoán & Gợi ý ôn tập/i });
  await modal.getByRole('checkbox').check();
  await modal.getByRole('button', { name: 'Bắt đầu Chẩn đoán bằng AI', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Đang đối chiếu dữ liệu và tạo gợi ý…', exact: true })).toBeDisabled();

  // Switch attempt from background dropdown while advice in flight
  await page.getByLabel('Lần làm', { exact: true }).selectOption('old');
  await page.evaluate(() => (window as Window & { __releaseAdvice: () => void }).__releaseAdvice());

  // Late response for previous attempt is ignored
  await expect(panel.getByRole('button', { name: 'Phân tích đề này với AI ›', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('toeic_attempt_advice_alice_v1'))).toBeNull();
});

test('sync conflict retains results and existing report while permitting explicit retry', async ({ page }) => {
  const panel = await setup(page);
  await page.evaluate(() => { (window as Window & { __adviceError: string }).__adviceError = 'Dữ liệu chưa đồng bộ. Chưa dùng lượt AI.'; });

  await panel.getByRole('button', { name: 'Phân tích đề này với AI ›', exact: true }).click();
  const modal = page.getByRole('dialog', { name: /Chẩn đoán & Gợi ý ôn tập/i });
  await modal.getByRole('checkbox').check();
  await modal.getByRole('button', { name: 'Bắt đầu Chẩn đoán bằng AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toHaveText('Dữ liệu chưa đồng bộ. Chưa dùng lượt AI.');
  expect(await calls(page)).toHaveLength(1);

  await page.evaluate(() => { (window as Window & { __adviceError: string }).__adviceError = ''; });
  await modal.getByRole('button', { name: 'Bắt đầu Chẩn đoán bằng AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: /Đối chiếu cấu trúc bị động/ })).toBeVisible();
  expect(await calls(page)).toHaveLength(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3')!).sessions)).toHaveLength(2);
});

test('edited evidence makes the cached report stale without an automatic AI request', async ({ page }) => {
  let panel = await setup(page);
  await panel.getByRole('button', { name: 'Phân tích đề này với AI ›', exact: true }).click();
  let modal = page.getByRole('dialog', { name: /Chẩn đoán & Gợi ý ôn tập/i });
  await modal.getByRole('checkbox').check();
  await modal.getByRole('button', { name: 'Bắt đầu Chẩn đoán bằng AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: /Đối chiếu cấu trúc bị động/ })).toBeVisible();
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();

  await page.evaluate(() => {
    const key = 'toeic_progress_account_alice_v3'; const bundle = JSON.parse(localStorage.getItem(key)!);
    bundle.mistakes.find((note: { id: string }) => note.id === 'note-current').questionContext = 'Updated evidence';
    localStorage.setItem(key, JSON.stringify(bundle));
  });
  await page.reload();
  panel = page.getByRole('region', { name: 'Chẩn đoán & Gợi ý ôn tập', exact: true });
  await expect(panel.getByText('Dữ liệu có thay đổi')).toBeVisible();
  expect(await calls(page)).toEqual([]); // No new automatic call on reload!
});
