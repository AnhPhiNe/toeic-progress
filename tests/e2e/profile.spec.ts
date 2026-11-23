import { test, expect, type Page } from '@playwright/test';
import type { DataBundle } from '../../frontend/src/shared/data/dataBundle';
import { joined, signIn } from './helpers/rank';

/** Hồ sơ của Sóc (Thành tích folded in): Tủ đồ with a live preview + save, 20 badges × 3 tiers with a detail view. */
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
const tests = [500, 560, 620, 700].map((score, i) => ({ id: `t${i}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: `ETS ${i}`, date: day(i * 7),
  durationMinutes: 120, totalScore: score, scaledListening: score / 2 + 10, scaledReading: score / 2 - 10, createdAt: `${day(i * 7)}T10:00:00Z`, updatedAt: `${day(i * 7)}T10:00:00Z` }));
const cards = Array.from({ length: 24 }, (_, i) => ({ id: `m${i}`, part: 5, questionContext: `Câu ${101 + i}`, userMistake: '(A)', correctAnswer: '(B)', category: 'OTHER',
  tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', reviewCount: 1, reviewStage: 1,
  lastReviewedAt: `2026-10-${String(2 + i).padStart(2, '0')}T10:00:00Z`, userReason: i < 12 ? 'đọc ẩu' : undefined }));
const data = { sessions: tests, mistakes: cards } as unknown as Partial<DataBundle>;

async function open(page: Page) {
  await signIn(page, joined, data);
  await page.goto('/thanh-tich');
  await expect(page).toHaveURL(/\/ho-so-soc$/);
  await expect(page.getByRole('heading', { name: 'Hồ sơ của Sóc', level: 1 })).toBeVisible();
}

test.describe('Hồ sơ của Sóc', () => {
  test('desktop: badges show tiers; detail lists the three tiers and opens the right page', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: /Huy hiệu/ })).toContainText('/60 bậc');
    const streak = page.getByRole('button', { name: /^Ôn đúng liên tiếp:/ });
    await expect(streak).toHaveAccessibleName('Ôn đúng liên tiếp: Bạc · 24/50 tới Vàng');
    await streak.click();
    const dialog = page.getByRole('dialog', { name: 'Ôn đúng liên tiếp' });
    await expect(dialog).toContainText('Bậc hiện tại: Bạc');
    await expect(dialog.getByRole('listitem')).toHaveCount(3);
    await expect(dialog.getByRole('listitem').nth(0)).toContainText('Đã đạt');
    await expect(dialog.getByRole('listitem').nth(2)).toContainText('24/50');
    await dialog.getByRole('button', { name: 'Ôn thẻ câu sai' }).click();
    await expect(page).toHaveURL(/\/so-tay$/);
  });

  test('desktop: Tủ đồ previews the selection and saves it; season rewards appear', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: /Khung Vàng/ })).toContainText('Quà mùa 1');
    await expect(page.getByRole('button', { name: /Khăn ngọc/ })).toBeDisabled();
    const save = page.getByRole('button', { name: 'Lưu bộ đồ' });
    await expect(save).toBeDisabled();
    await page.getByRole('radio', { name: 'Xám tro' }).click();
    await page.getByRole('button', { name: /Khung Vàng/ }).click();
    await expect(page.getByRole('button', { name: /Khung Vàng/ })).toHaveAttribute('aria-pressed', 'true');
    // The big preview wears the selection before saving: grey coat and the gold frame.
    const preview = await page.locator('.pf-room__art').innerHTML();
    expect(preview).toContain('#d99a00');
    expect(preview).toContain('#a9b2bf');
    await save.click();
    await expect(page.getByRole('button', { name: 'Đã lưu' })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3') ?? '{}').profile);
    expect(stored.socCoat).toBe('xam');
    expect(stored.socGear).toContain('frame-vang.m1');
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Tủ đồ and Huy hiệu tabs; badge detail opens as a sheet', async ({ page }) => {
      await open(page);
      await expect(page.getByRole('tab', { name: 'Tủ đồ' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: 'Lưu bộ đồ' })).toBeVisible();
      await page.getByRole('tab', { name: /Huy hiệu · \d+\/60/ }).click();
      await page.getByRole('button', { name: /^Cán mốc:/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Cán mốc' });
      await expect(sheet).toContainText('Bậc hiện tại: Đồng');
      await expect(sheet).toContainText('700/750');
    });
  });
});

/* RANK_SHOTS=1 npx playwright test profile.spec.ts -g "profile screenshots" */
test.describe('profile screenshots', () => {
  test.skip(!process.env.RANK_SHOTS, 'only on request');
  const out = 'design/previews/rank-v1/built/';
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    test(`ho-so ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      await page.screenshot({ path: `${out}hoso-tudo-${label}.png` });
      if (label === 'phone') {
        await page.getByRole('tab', { name: /Huy hiệu/ }).click();
        await page.screenshot({ path: `${out}hoso-huyhieu-phone.png` });
      }
      await page.getByRole('button', { name: /^Ôn đúng liên tiếp:/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}hoso-chitiet-${label}.png` });
    });
  }
});
