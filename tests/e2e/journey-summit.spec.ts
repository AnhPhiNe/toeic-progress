import { test, expect, type Page } from '@playwright/test';

/** Hành trình điểm › Điểm số: the illustrated mountain (design/previews/journey-v3/score-mountain-v3.html). */
async function seed(page: Page, tests: [number, string, number][]) {
  await page.clock.install({ time: new Date('2026-12-05T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(async ({ tests }) => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts' as string)).loadDemoData();
    const key = 'toeic_progress_bundle_v3';
    const data = JSON.parse(localStorage.getItem(key)!);
    const tpl = data.sessions.find((s: { sessionType: string }) => s.sessionType === 'FULL_TEST');
    data.sessions = tests.map(([total, date, l]: [number, string, number], i: number) => ({ ...tpl, id: `m${i}`, date, createdAt: `${date}T09:00:00Z`, updatedAt: `${date}T09:00:00Z`,
      testName: `ETS Mountain ${i + 1}`, totalScore: total, scaledListening: l, scaledReading: total - l, attemptNumber: 1 }));
    data.profile = { ...data.profile, targetScore: 850, goalChosen: true, examDate: '2027-02-01' };
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  }, { tests });
  await page.goto('/lich-su');
}
const THREE: [number, string, number][] = [[745, '2026-11-20', 370], [770, '2026-11-27', 385], [790, '2026-12-04', 400]];

for (const [device, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`${device}: three tests answer Kịp!, flags fill stakes Đề 1..3, Nghe toggle, flag popover opens the test`, async ({ page }) => {
    await page.setViewportSize(size);
    await seed(page, THREE);
    await expect(page.getByText('Kịp!')).toBeVisible();
    await expect(page.getByText(/Theo đà này chạm 850 khoảng 25\/12 — trước ngày thi 01\/02\./)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Leo núi tới 850: 3 đề đã cắm cờ, mới nhất 790' })).toBeVisible();
    // max(4, 3 + 3) = 6 stakes: three flags and Đề 4..6 still grey
    for (const k of [4, 5, 6]) await expect(page.locator('svg text', { hasText: `Đề ${k}` })).toHaveCount(1);
    await expect(page.locator('svg text', { hasText: 'Đề 7' })).toHaveCount(0);
    if (device === 'desktop') await expect(page.getByText('Cọc mới nhất 790, cao nhất từ trước tới giờ!')).toBeVisible();
    else await expect(page.locator('.sm-bub')).toHaveCount(0);

    await page.getByRole('group', { name: 'Xem điểm' }).getByRole('button', { name: 'Nghe' }).click();
    await expect(page.getByRole('group', { name: /^Leo núi tới \d+: 3 đề đã cắm cờ, mới nhất 400$/ })).toBeVisible();
    await page.getByRole('group', { name: 'Xem điểm' }).getByRole('button', { name: 'Tổng' }).click();

    await page.getByRole('button', { name: '27/11 · ETS Mountain 2: 770' }).click();
    await page.getByRole('dialog', { name: '770 điểm · 27/11' }).getByRole('button', { name: 'Xem đề này' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'ETS Mountain 2' }).first()).toBeVisible();
  });

  test(`${device}: one test asks for another before drawing the projection`, async ({ page }) => {
    await page.setViewportSize(size);
    await seed(page, THREE.slice(0, 1));
    await expect(page.getByText('Ghi thêm một đề để Sóc vẽ đường dự báo')).toBeVisible();
    for (const k of [2, 3, 4]) await expect(page.locator('svg text', { hasText: `Đề ${k}` })).toHaveCount(1);
  });
}

test('phone: the summit flag stays clear of the card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page, THREE);
  const card = await page.locator('.sm-card').boundingBox();
  const flag = await page.locator('.sm-summit').boundingBox();
  expect(flag!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
});
