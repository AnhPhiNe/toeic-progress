import { test, expect, type Page } from '@playwright/test';

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
      await dish(page, 'Part 7').click();
      await expect(page.getByRole('heading', { name: /Hôm nay nướng Part 7 nhé\?/ })).toBeVisible();
      await expect(dish(page, 'Part 7')).toHaveAttribute('aria-pressed', 'true');
      await expect(dish(page, 'Part 7')).toHaveAccessibleName('Part 7, 54 câu, 55 phút, kỷ lục chưa có');
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
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: '× Dừng', exact: true }).click();
      await expect(clock(page, '11:55')).toBeVisible();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '× Dừng', exact: true }).click();
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

    test('"Ghi kết quả" opens the Part practice logger without starting a clock', async ({ page }) => {
      await open(page);
      await dish(page, 'Part 6').click();
      await page.getByRole('button', { name: /^(Chỉ ghi kết quả|Ghi kết quả)$/ }).click();
      await expect(page.getByRole('dialog', { name: /^Ghi (điểm|buổi luyện)$/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(fire(page)).toBeVisible();
    });
  });
}

test('the Pomodoro button opens the classic clock on a computer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Giai đoạn Pomodoro' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Kết quả', exact: true })).toBeVisible();
});

// Real app bug: on phones the Pomodoro button does nothing, because App keeps the phone bakery on screen for the whole Luyện tập tab
// (phonePageTab) while the classic clock that holds Pomodoro, Kết quả and the statistics only renders on computers.
test('the Pomodoro button opens the classic clock on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Giai đoạn Pomodoro' })).toBeVisible();
});

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
