import { test, expect } from '@playwright/test';
import { openRecordSheet } from './helpers/nav';
import { openSettings } from './helpers/accountGroup';

test('direct routes and public legal pages are available without an account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hành trình điểm', exact: true }).click();
  await expect(page).toHaveURL(/\/lich-su$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  // /phan-tich opens Hành trình on its "Từng Part" tab.
  await page.goto('/phan-tich');
  await expect(page.getByRole('tab', { name: 'Từng Part', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page).toHaveURL(/\/phan-tich$/);
  await expect(page.getByRole('tab', { name: 'Từng Part', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/chinh-sach-quyen-rieng-tu');
  await expect(page.getByRole('heading', { name: 'Chính sách quyền riêng tư' })).toBeVisible();
  await page.goto('/dieu-khoan');
  await expect(page.getByRole('heading', { name: 'Điều khoản sử dụng' })).toBeVisible();
  await page.goto('/gioi-thieu');
  await expect(page.getByRole('heading', { level: 1, name: /Chụp câu sai/ })).toBeVisible();
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).icons).toHaveLength(3);
  expect((await page.request.get('/icon-192.png')).ok()).toBe(true);
  expect((await page.request.get('/icon-512.png')).ok()).toBe(true);
  expect((await page.request.get('/sw.js')).ok()).toBe(true);
});

test('guest vocabulary entry persists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const original = await page.evaluate(() => ({ ...localStorage }));
  try {
    await page.evaluate(() => {
      const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      const now = '2026-11-10T08:00:00.000Z';
      bundle.mistakes = [{
        id: 'm-guest-vocab', sessionId: 's-gv', sourceTestName: 'ETS Guest', part: 5, questionNumber: 105,
        question: 'The memo was ____.', questionContext: 'The memo was ____.', options: ['(A) brief', '(B) briefly'],
        userChoice: 'B', userChoiceState: 'CHOSEN', userMistake: '(B) briefly', correctAnswer: '(A) brief',
        answerSource: 'PROVIDED', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW',
        savedWords: ['brief'], explanation: { quickTip: 'Adj after be', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: 'brief: ngắn gọn' },
        createdAt: now, updatedAt: now, deletedAt: null,
      }];
      localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
      localStorage.setItem('toeic_onboarding_done_v1', 'true');
    });
    await page.goto('/so-tay');
    await page.getByRole('group', { name: 'Lọc theo trạng thái' }).getByRole('button', { name: /^Từ\s*1$/ }).click();
    await page.getByRole('button', { name: 'Ôn 1 từ', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ôn từ đã lưu', exact: true });
    await dialog.getByRole('button', { name: 'Lật xem nghĩa', exact: true }).click();
    await dialog.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
    await dialog.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
    const saved = () => page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
      return { words: data.vocabLog.filter((entry: { deletedAt: string | null }) => !entry.deletedAt).map((entry: { count: number }) => entry.count) };
    });
    await expect.poll(saved).toEqual({ words: [1] });
    await page.reload();
    expect(await saved()).toEqual({ words: [1] });
  } finally {
    await page.evaluate(saved => { localStorage.clear(); for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value); }, original);
  }
});

test('invalid backup is rejected without changing saved data', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const before = await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"sessions":[{"id":1}]}') });
  await expect(page.getByText('Không thể khôi phục tệp')).toBeVisible();
  const after = await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'));
  expect(after).toBe(before);
});

test('corrupted local data shows recovery without deleting the original bytes', async ({ page }) => {
  await page.goto('/');
  const saved = await page.evaluate(() => ({ ...localStorage }));
  try {
    await page.evaluate(() => localStorage.setItem('toeic_progress_bundle_v3', '{broken'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Không thể mở dữ liệu học tập' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'))).toBe('{broken');
  } finally {
    await page.evaluate(previous => { localStorage.clear(); for (const [key, value] of Object.entries(previous)) localStorage.setItem(key, value); }, saved);
  }
});

test('new feature cards do not overflow supported widths or 125% zoom', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/phan-tich');
    await expect(page.getByRole('tab', { name: 'Từng Part', exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '125% zoom horizontal overflow').toBeLessThanOrEqual(1);
});
