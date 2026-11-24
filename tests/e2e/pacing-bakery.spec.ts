import { test, expect, type Page } from '@playwright/test';
import { answerConfirm } from './helpers/confirmDialog';

// Luyện tập is the bakery: pick a Part (a "dish"), set minutes, "Bật lò", "Xong rồi · ra lò", then say how many were wrong.
// Desktop (BakeryChoose/Run/Done) and phone (PhoneBakery*) share their labels, so one set of helpers drives both.

async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // "Bật lò" starts at once instead of after its 0.5 s animation
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T09:00:01Z'));
  await page.goto('/luyen-toc-do');
}
const data = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
const dish = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}, \\d+ câu`) });
const fire = (page: Page) => page.getByRole('button', { name: /Bật lò/ });
/** Phones keep the Part list in a bottom sheet behind the chosen-Part card; computers show it on the counter. */
async function openParts(page: Page) {
  const trigger = page.getByRole('button', { name: /^Part đang chọn/ });
  if (await trigger.count()) await trigger.click();
}
async function closeParts(page: Page) {
  if (await page.getByRole('dialog', { name: 'Chọn Part' }).count()) await page.keyboard.press('Escape');
}
async function pick(page: Page, label: string) {
  await openParts(page);
  await (label === 'Mẻ tự do' ? free(page) : dish(page, label)).click();
}
const finish = (page: Page) => page.getByRole('button', { name: 'Xong rồi · ra lò', exact: true });
/** Computers list the recent bakes on the page; phones keep them in a sheet behind the clock button. */
async function recentRow(page: Page, name: RegExp) {
  const sheet = page.getByRole('button', { name: 'Mẻ bánh gần đây', exact: true });
  if (await sheet.count()) await sheet.click();
  return page.getByRole('button', { name }).first();
}
const clock = (page: Page, text: string) => page.getByRole('timer', { name: `Còn ${text}`, exact: true });

for (const [name, viewport] of [['computer', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize(viewport); });

    test('Part 7 bakes for its full time; saving the wrong count writes the run and its paired Part practice', async ({ page }) => {
      await open(page);
      await openParts(page);
      await expect(dish(page, 'Part 7')).toHaveAccessibleName('Part 7, 54 câu, 55 phút, kỷ lục chưa có');
      await dish(page, 'Part 7').click();
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Part 7 nhé\?/ })).toBeVisible();
      await openParts(page);
      await expect(dish(page, 'Part 7')).toHaveAttribute('aria-pressed', 'true');
      await closeParts(page);
      await expect(fire(page)).toHaveText(/Bật lò · 55 phút/);
      await fire(page).click();
      await expect(clock(page, '55:00')).toBeVisible();
      await page.clock.fastForward(10000);
      await expect(clock(page, '54:50')).toBeVisible();
      await finish(page).click();
      // On phones the save buttons sit under the card, not inside it, so act on the page.
      const done = page.getByRole('dialog', { name: /^Ra lò! Part 7 trong/ });
      await expect(done).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Số câu sai', exact: true })).toHaveValue('0');
      await page.getByRole('button', { name: 'Thêm một câu sai', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Số câu sai', exact: true }).fill('6');
      await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
      await expect(done).toHaveCount(0);
      const bundle = await data(page);
      expect(bundle.pacingRuns).toHaveLength(1);
      expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'PART_7', totalQuestions: 54, correctAnswers: 48 });
      expect(bundle.pacingRuns[0].accuracyPercent).toBeCloseTo(88.9, 1);
      expect(bundle.pacingRuns[0].actualSeconds).toBeCloseTo(10, 0);
      expect(bundle.sessions).toHaveLength(1);
      expect(bundle.sessions[0]).toMatchObject({ sessionType: 'PART_PRACTICE', id: bundle.pacingRuns[0].id });
      expect(bundle.sessions[0].practiceParts).toEqual([{ part: 7, correct: 48, total: 54 }]);
      await expect(await recentRow(page, /^Part 7 · 6 sai/)).toBeVisible();
    });

    test('"Để sau" keeps only the real time: the run has no grade and the session no Part detail', async ({ page }) => {
      await open(page);
      await fire(page).click();
      await page.clock.fastForward(15000);
      await finish(page).click();
      const done = page.getByRole('dialog', { name: /^Ra lò! Part 5 trong/ });
      await expect(done).toBeVisible();
      await page.getByRole('button', { name: 'Để sau', exact: true }).click();
      await expect(done).toHaveCount(0);
      const bundle = await data(page);
      expect(bundle.pacingRuns).toHaveLength(1);
      expect(bundle.pacingRuns[0]).not.toHaveProperty('correctAnswers');
      expect(bundle.pacingRuns[0].actualSeconds).toBeCloseTo(15, 0);
      expect(bundle.sessions).toHaveLength(1);
      expect(bundle.sessions[0]).not.toHaveProperty('practiceParts');
      await expect(await recentRow(page, /^Part 5 · chưa chấm/)).toBeVisible();
    });

    test('minutes step by one, cannot reach zero, and the plan survives a reload', async ({ page }) => {
      await open(page);
      const minutes = page.getByRole('group', { name: 'Số phút', exact: true });
      await expect(minutes).toContainText('12');
      await minutes.getByRole('button', { name: 'Thêm một phút', exact: true }).click();
      await expect(minutes).toContainText('13');
      await minutes.getByRole('button', { name: 'Bớt một phút', exact: true }).click();
      await minutes.getByRole('button', { name: 'Bớt một phút', exact: true }).click();
      await expect(minutes).toContainText('11');
      await page.reload();
      await expect(page.getByRole('group', { name: 'Số phút', exact: true })).toContainText('11');
      await fire(page).click();
      await expect(clock(page, '11:00')).toBeVisible();
    });

    test('a running and a paused clock survive reload; stopping asks first and saves nothing', async ({ page }) => {
      await open(page);
      await fire(page).click();
      await page.clock.fastForward(5000);
      await expect(clock(page, '11:55')).toBeVisible();
      await page.reload();
      await expect(clock(page, '11:55')).toBeVisible();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await page.clock.fastForward(60000);
      await page.reload();
      await expect(clock(page, '11:55')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '× Dừng', exact: true }).click();
      await answerConfirm(page, false);
      await expect(clock(page, '11:55')).toBeVisible();
      await page.getByRole('button', { name: '× Dừng', exact: true }).click();
      await answerConfirm(page, true);
      await expect(fire(page)).toBeVisible();
      expect((await data(page)).pacingRuns).toHaveLength(0);
      expect((await data(page)).sessions).toHaveLength(0);
    });

    test('a finished bake waits through a reload; a failed save keeps the card and the wrong count, and a retry saves', async ({ page }) => {
      await open(page);
      await fire(page).click();
      await page.clock.fastForward(10000);
      await finish(page).click();
      await page.reload();
      const done = page.getByRole('dialog', { name: /^Ra lò! Part 5 trong/ });
      await expect(done).toBeVisible();
      await page.getByRole('spinbutton', { name: 'Số câu sai', exact: true }).fill('4');
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        (window as typeof window & { restoreWrites?: () => void }).restoreWrites = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function (key, value) {
          if (key === 'toeic_progress_bundle_v3') throw new DOMException('quota reached', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      });
      await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Không đủ dung lượng');
      await expect(done).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Số câu sai', exact: true })).toHaveValue('4');
      expect((await data(page)).sessions).toHaveLength(0);
      await page.evaluate(() => (window as typeof window & { restoreWrites?: () => void }).restoreWrites?.());
      await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
      await expect(done).toHaveCount(0);
      expect((await data(page)).pacingRuns[0]).toMatchObject({ totalQuestions: 30, correctAnswers: 26 });
    });

    test('one primary says the minutes; the other ways in are quiet links; Part 5 has no mode chips', async ({ page }) => {
      await open(page);
      await expect(fire(page)).toHaveText(/Bật lò · 12 phút/);
      await expect(fire(page)).toHaveCount(1);
      await expect(page.getByRole('button', { name: /^(Chỉ ghi kết quả|Ghi kết quả)$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Công thức', exact: true })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Chế độ Part 7' })).toHaveCount(0);
      await page.getByRole('group', { name: 'Số phút', exact: true }).getByRole('button', { name: 'Thêm một phút', exact: true }).click();
      await expect(fire(page)).toHaveText(/Bật lò · 13 phút/);
      await pick(page, 'Part 7');
      await expect(page.getByRole('group', { name: 'Chế độ Part 7' })).toBeVisible();
      for (const name of [/Bật lò/, /^(Chỉ ghi kết quả|Ghi kết quả)$/, /^Công thức$/]) {
        const box = await page.getByRole('button', { name }).first().boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(43);
      }
    });

    test('recent bakes show their whole title and day (no ellipsis)', async ({ page }) => {
      await open(page);
      await fire(page).click();
      await page.clock.fastForward(10000);
      await finish(page).click();
      await page.getByRole('button', { name: 'Để sau', exact: true }).click();
      const row = await recentRow(page, /^Part 5 · chưa chấm/);
      await expect(row).toBeVisible();
      const clipped = await row.locator('b, small').evaluateAll(els => els.some(el => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis'));
      expect(clipped).toBe(false);
    });

    test('"Ghi kết quả" opens the Part practice logger without starting a clock', async ({ page }) => {
      await open(page);
      await pick(page, 'Part 6');
      await page.getByRole('button', { name: /^(Chỉ ghi kết quả|Ghi kết quả)$/ }).click();
      await expect(page.getByRole('dialog', { name: /^Ghi (điểm|buổi luyện)$/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(fire(page)).toBeVisible();
    });
  });
}

// Real app bug: after a saved bake is edited from its row, the row keeps showing the old wrong count until the page reloads
// (useBakery keeps `runs` in state that only changes on its own save, so the edit made through PacingResultEditor is not picked up).
test('editing a bake from its row updates the row at once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await fire(page).click();
  await page.clock.fastForward(10000);
  await finish(page).click();
  await page.getByRole('spinbutton', { name: 'Số câu sai', exact: true }).fill('4');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await page.getByRole('button', { name: /^Part 5 · 4 sai/ }).click();
  const editor = page.getByRole('dialog', { name: 'Kết quả Part 5', exact: true });
  await editor.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('20');
  await editor.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Part 5 · 10 sai/ })).toBeVisible();
});

// Mẻ tự do (free study) replaced the Pomodoro button: a fifth item in the case, the same oven, a ra-lò card and a cooling break.
const free = (page: Page) => page.getByRole('button', { name: /^Mẻ tự do, học tự do, \d+ phút$/ });
async function seedFocusRuns(page: Page, count: number) {
  await page.evaluate(count => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.pacingRuns = Array.from({ length: count }, (_, i) => ({ id: `focus-${i}`, presetId: 'POMODORO_WORK', presetName: 'Pomodoro', partType: 'POMODORO', date: '2026-10-09',
      createdAt: `2026-10-09T0${i + 5}:00:00Z`, updatedAt: '2026-10-09T08:00:00Z', deletedAt: null, plannedMinutes: 25, actualMinutes: 25, actualSeconds: 1500, finishedNaturally: true, phases: [] }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, count);
  await page.reload();
}

for (const [name, viewport] of [['computer', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(`Mẻ tự do on a ${name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize(viewport); });

    test('choose a short free bake, let it finish, start the break and skip it', async ({ page }) => {
      await open(page);
      await expect(page.getByRole('button', { name: 'Pomodoro', exact: true })).toHaveCount(0);
      await pick(page, 'Mẻ tự do');
      await openParts(page);
      await expect(free(page)).toHaveAttribute('aria-pressed', 'true');
      await closeParts(page);
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
      await expect(page.getByText('Học từ, nghe, shadowing… phút vẫn tính vào chuỗi.', { exact: true })).toHaveCount(1);
      const minutes = page.getByRole('group', { name: 'Số phút', exact: true });
      await expect(minutes).toContainText('25');
      const less = minutes.getByRole('button', { name: 'Bớt một phút', exact: true });
      for (const shown of ['20', '15', '10', '5', '4', '3', '2', '1']) { await less.click(); await expect(minutes).toContainText(shown); }
      await expect(less).toBeDisabled();
      // The choice is remembered for this account.
      await page.reload();
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Số phút', exact: true })).toContainText('1');

      await fire(page).click();
      await expect(clock(page, '01:00')).toBeVisible();
      await expect(page.getByText(/nên ở khoảng câu/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Xong sớm · ra lò', exact: true })).toBeVisible();
      await page.clock.fastForward(61000);
      const done = page.getByRole('dialog', { name: '+1 phút', exact: true });
      await expect(done).toBeVisible();
      await expect(done).toContainText('Đã luyện hôm nay1 phút');
      await expect(page.getByRole('spinbutton', { name: 'Số câu sai' })).toHaveCount(0);
      let bundle = await data(page);
      expect(bundle.pacingRuns).toHaveLength(1);
      expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'POMODORO', presetId: 'POMODORO_WORK', actualSeconds: 60, finishedNaturally: true });
      expect(bundle.sessions).toHaveLength(1);
      expect(bundle.sessions[0]).toMatchObject({ id: bundle.pacingRuns[0].id, sessionType: 'PART_PRACTICE', testName: 'Pomodoro: tập trung' });

      await page.getByRole('button', { name: 'Nghỉ 5 phút', exact: true }).click();
      await expect(clock(page, '05:00')).toBeVisible();
      await expect(page.getByText('Uống nước, đứng dậy duỗi người nhé.', { exact: true })).toBeVisible();
      await page.clock.fastForward(3000);
      await page.getByRole('button', { name: 'Bỏ nghỉ · nướng tiếp', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
      await expect(fire(page)).toBeVisible();
      bundle = await data(page);
      expect(bundle.pacingRuns).toHaveLength(2);
      expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'POMODORO', presetId: 'POMODORO_SHORT_BREAK', finishedNaturally: false });
      expect(bundle.sessions).toHaveLength(1);
      // The free bake is listed with the others.
      await expect(await recentRow(page, /^Mẻ tự do · 1 phút/)).toBeVisible();
    });

    test('the fourth bake of the day offers the long break, which ends by itself back at the case', async ({ page }) => {
      await open(page);
      await seedFocusRuns(page, 3);
      await pick(page, 'Mẻ tự do');
      const less = page.getByRole('group', { name: 'Số phút', exact: true }).getByRole('button', { name: 'Bớt một phút', exact: true });
      for (let i = 0; i < 8; i++) await less.click();
      await fire(page).click();
      await page.clock.fastForward(30000);
      await page.getByRole('button', { name: 'Xong sớm · ra lò', exact: true }).click();
      const done = page.getByRole('dialog', { name: '+30 giây', exact: true });
      await expect(done).toContainText('Mẻ thứ 4 hôm nay');
      await expect(done).toContainText('Đã luyện hôm nay1 giờ 15 phút');
      await page.getByRole('button', { name: 'Nghỉ dài 15 phút', exact: true }).click();
      await expect(clock(page, '15:00')).toBeVisible();
      await page.clock.fastForward(15 * 60 * 1000 + 1000);
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
      const bundle = await data(page);
      expect(bundle.pacingRuns[0]).toMatchObject({ presetId: 'POMODORO_LONG_BREAK', finishedNaturally: true, actualSeconds: 900 });
      expect(bundle.sessions).toHaveLength(1);
    });
  });
}

test('the old /phong-thi link opens the bakery on Mẻ tự do', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/phong-thi');
  await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Hôm nay nướng Mẻ tự do nhé\?/ })).toBeVisible();
  await expect(free(page)).toHaveAttribute('aria-pressed', 'true');
});