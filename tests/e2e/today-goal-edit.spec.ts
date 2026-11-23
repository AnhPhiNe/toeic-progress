import { test, expect, type Page } from '@playwright/test';

/** Hôm nay: change the goal from the trophy (✎) or the exam chip. Sketch: design/previews/mock-goal-edit.html */
async function seed(page: Page, examDate: string) {
  await page.clock.install({ time: new Date('2026-11-17T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(async ({ examDate }) => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts' as string)).loadDemoData();
    const key = 'toeic_progress_bundle_v3';
    const data = JSON.parse(localStorage.getItem(key)!);
    const tpl = data.sessions.find((s: { sessionType: string }) => s.sessionType === 'FULL_TEST');
    const mk = (i: number, date: string, total: number, l: number) => ({ ...tpl, id: `g${i}`, date, createdAt: `${date}T09:00:00Z`, updatedAt: `${date}T09:00:00Z`,
      testName: `ETS Test 0${i}`, totalScore: total, scaledListening: l, scaledReading: total - l, attemptNumber: 1 });
    // 560 -> 680 with goal 800: stairs 550 580 610 640 680 710 740 770, Sóc on bậc 5 (680).
    data.sessions = [mk(1, '2026-10-01', 560, 290), mk(2, '2026-10-15', 620, 320), mk(3, '2026-11-01', 680, 350)];
    data.mistakes = [];
    data.profile = { ...data.profile, targetScore: 800, goalChosen: true, examDate };
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  }, { examDate });
  await page.reload();
}

const cup = (page: Page, target: number) => page.getByRole('button', { name: `Cúp mục tiêu ${target}, đổi mục tiêu` });
const editor = (page: Page) => page.getByRole('dialog', { name: 'Mục tiêu của bạn' });
/** The trophy opens its popover; its button opens the goal editor. */
async function editFromCup(page: Page, target: number) {
  await cup(page, target).click();
  await page.getByRole('dialog', { name: `Cúp ${target} · đích` }).getByRole('button', { name: '✎ Đổi mục tiêu' }).click();
}

test('desktop: the trophy popover opens the goal editor; raising re-spaces the eight milestones, lowering below the best never celebrates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, '2026-12-23');

  await editFromCup(page, 800);
  await expect(editor(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  await page.getByRole('button', { name: 'Thi sau 36 ngày' }).click();
  await editor(page).getByRole('button', { name: '850', exact: true }).click();
  await expect(editor(page)).toContainText('Mỗi bậc ≈ 38 điểm · bạn ở bậc 4/8');
  await expect(editor(page)).toContainText(/Tự chia: Nghe \d+ · Đọc \d+/);
  await editor(page).getByRole('button', { name: 'Lưu · cúp 850' }).click();
  await expect(editor(page)).toBeHidden();
  await expect(cup(page, 850)).toBeVisible();
  await expect(page.getByText('Mục tiêu 850 rồi, mỗi bậc giờ ~38 điểm!')).toBeVisible();
  await expect(page.getByText('BẬC 4/8')).toBeVisible();

  await editFromCup(page, 850);
  await editor(page).getByRole('button', { name: '650', exact: true }).click();
  await expect(editor(page)).toContainText('Bạn đã chạm 680 rồi, cao hơn mốc này');
  await editor(page).getByRole('button', { name: 'Vẫn lưu 650' }).click();
  await expect(page.getByText('ĐÃ CHẠM 650')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Bạn đã chạm 650' })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile);
  expect(stored).toMatchObject({ targetScore: 650, goalChosen: true, examDate: '2026-12-23' });
});

test('phone: the trophy opens a bottom sheet with a stepper; the exam chip clears the date', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, '2026-12-23');

  await editFromCup(page, 800);
  await editor(page).getByRole('button', { name: 'Thêm 25 điểm' }).click();
  await expect(editor(page).getByText('825', { exact: true })).toBeVisible();
  await editor(page).getByRole('button', { name: 'Lưu · cúp 825' }).click();
  await expect(cup(page, 825)).toBeVisible();

  await page.getByRole('button', { name: 'Thi sau 36 ngày' }).click();
  await editor(page).getByRole('button', { name: 'Bỏ ngày thi' }).click();
  await expect(editor(page)).toContainText('Chưa đặt ngày thi');
  await editor(page).getByRole('button', { name: 'Lưu · cúp 825' }).click();
  await expect(page.getByRole('button', { name: 'Đặt ngày thi' })).toBeVisible();

  await page.getByRole('button', { name: 'Đặt ngày thi' }).click();
  await editor(page).getByLabel('Ngày thi').fill('2027-01-15');
  await expect(editor(page)).toContainText('còn 59 ngày');
  await editor(page).getByRole('button', { name: 'Lưu · cúp 825' }).click();
  await expect(page.getByRole('button', { name: 'Thi sau 59 ngày' })).toBeVisible();
});

test('a past exam date turns the chip amber and asks once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, '2026-11-10');
  await expect(page.getByText('Thi xong chưa?')).toBeVisible();
  await page.getByRole('button', { name: 'Đã qua ngày thi · Cập nhật' }).click();
  await expect(editor(page)).toContainText('đã qua 7 ngày');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đã qua ngày thi · Cập nhật' })).toBeVisible();
  await expect(page.getByText('Thi xong chưa?')).toHaveCount(0);
});
