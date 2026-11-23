import { test, expect, type Page } from '@playwright/test';

/** Hôm nay hero = the road (design/previews/journey-v2/1b-today-road.html): 0 / 1 / 3 tests and a reached goal, desktop + phone. */
const TESTS: Record<string, [number, string, number][]> = {
  none: [],
  one: [[745, '2026-11-20', 370]],
  three: [[745, '2026-11-20', 370], [770, '2026-11-27', 385], [790, '2026-12-04', 400]],
  done: [[745, '2026-11-20', 370], [800, '2026-11-27', 400], [860, '2026-12-04', 430]]
};

async function seed(page: Page, state: keyof typeof TESTS, examDate: string | null = '2027-02-01') {
  await page.clock.install({ time: new Date('2026-12-05T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(async ({ tests, examDate }) => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts' as string)).loadDemoData();
    const key = 'toeic_progress_bundle_v3';
    const data = JSON.parse(localStorage.getItem(key)!);
    const tpl = data.sessions.find((s: { sessionType: string }) => s.sessionType === 'FULL_TEST');
    data.sessions = tests.map(([total, date, l]: [number, string, number], i: number) => ({ ...tpl, id: `r${i}`, date, createdAt: `${date}T09:00:00Z`, updatedAt: `${date}T09:00:00Z`,
      testName: `ETS Road ${i + 1}`, totalScore: total, scaledListening: l, scaledReading: total - l, attemptNumber: 1 }));
    data.profile = { ...data.profile, targetScore: 850, goalChosen: true, examDate };
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
    localStorage.setItem('rd_goal_celebrated_v1:guest', '850');
  }, { tests: TESTS[state], examDate });
  await page.reload();
}

for (const [device, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(device, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize(size); });

    test('three tests: Sóc on bậc 6, projected dates, sign, flag popover opens the test', async ({ page }) => {
      await seed(page, 'three');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Còn 60 điểm là');
      await expect(page.getByText('BẬC 6/8')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Bậc 6 trên 8, 790 điểm, mục tiêu 850' })).toBeVisible();
      await expect(page.getByText('Theo đà này: chạm 850 ~25/12 · dư 5 tuần')).toBeVisible();
      await page.getByRole('button', { name: 'Bậc 7: 810 điểm, dự báo ~11/12' }).click();
      await expect(page.getByRole('dialog', { name: 'Bậc 7 · 810' })).toContainText('Dự báo ~11/12');
      await page.getByRole('button', { name: 'Bậc 1: 700 điểm, đạt 20/11' }).click();
      await expect(page.getByRole('dialog', { name: 'Bậc 1 · 700' })).toContainText('Đạt 20/11');
      await page.getByRole('button', { name: /Đề ETS Road 2, 770 điểm/ }).click();
      await page.getByRole('dialog', { name: '770 điểm · 27/11' }).getByRole('button', { name: 'Xem đề này' }).click();
      await expect(page.getByRole('dialog').filter({ hasText: 'ETS Road 2' }).first()).toBeVisible();
    });

    test('one test: no projection yet', async ({ page }) => {
      await seed(page, 'one');
      await expect(page.getByText('BẬC 3/8')).toBeVisible();
      await expect(page.getByText('Ghi thêm một đề để Sóc đoán ngày chạm 850')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bậc 4: 760 điểm, còn 15 điểm' })).toBeVisible();
    });

    test('no test yet: estimated stones and the ready heading', async ({ page }) => {
      await seed(page, 'none');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Đường tới');
      await expect(page.getByRole('group', { name: 'Đường tới cúp 850, chưa có đề nào' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Bậc 1: \d+ điểm, ước lượng$/ })).toBeVisible();
    });

    test('goal reached: every stop is a coin and the trophy still opens the goal editor', async ({ page }) => {
      await seed(page, 'done');
      await expect(page.getByText('ĐÃ CHẠM 850')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Đã chạm cúp 850, điểm cao nhất 860' })).toBeVisible();
      await page.getByRole('button', { name: 'Cúp mục tiêu 850, đổi mục tiêu' }).click();
      await page.getByRole('dialog', { name: 'Cúp 850 · đích' }).getByRole('button', { name: '✎ Đổi mục tiêu' }).click();
      await expect(page.getByRole('dialog', { name: 'Mục tiêu của bạn' })).toBeVisible();
    });

    test('no exam date: the sign leaves the exam out', async ({ page }) => {
      await seed(page, 'three', null);
      await expect(page.getByText('Theo đà này: chạm 850 ~25/12', { exact: true })).toBeVisible();
    });
  });
}

test('the road popover is keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, 'three');
  const coin = page.getByRole('button', { name: 'Bậc 6: 790 điểm, bạn đang ở đây' });
  await coin.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Bậc 6 · 790' })).toContainText('bạn đang ở đây');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Bậc 6 · 790' })).toHaveCount(0);
});
