import { expect, test, type Page } from '@playwright/test';

const longName = 'ETS Practice Test with a deliberately long title to verify selected attempt visibility on narrow screens';
async function seed(page: Page) {
  await page.goto('/');
  await page.evaluate(name => {
    const key = 'toeic_progress_bundle_v3';
    const bundle = JSON.parse(localStorage.getItem(key)!);
    const stamp = '2026-10-24T00:00:00Z';
    bundle.sessions = [{ id: 'ui-final', testName: name, skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-24',
      durationMinutes: 120, totalScore: 860, scaledListening: 460, scaledReading: 400, rawListening: 93, rawReading: 85,
      partScores: { part1: 6, part2: 24, part3: 36, part4: 27, part5: 25, part6: 14, part7: 46 }, createdAt: stamp, updatedAt: stamp }];
    localStorage.setItem(key, JSON.stringify(bundle));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  }, longName);
  await page.reload();
}

test('latest skill scores and raw badges stay within their cards at narrow component widths', async ({ page }) => {
  await seed(page);
  for (const width of [320, 390, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const cards = page.getByRole('region', { name: /Kết quả gần nhất/ }).getByRole('button', { name: /Xem chi tiết (Listening|Reading)/ });
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      expect(await card.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('span')).every(child => {
          const bounds = child.getBoundingClientRect();
          return bounds.left >= rect.left - 1 && bounds.right <= rect.right + 1;
        });
      })).toBe(true);
    }
  }
});

test('phone analytics keeps the attempt on its own visible line for long test names', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seed(page);
  await page.goto('/phan-tich');
  const picker = page.getByRole('button', { name: /^Chọn đề và lần làm:/ });
  const status = picker.locator('span').filter({ hasText: /^Lần 1/ }).last();
  await expect(status).toBeVisible();
  expect(await status.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await picker.click();
  await expect(page.getByLabel('Lần làm', { exact: true })).toBeVisible();
});

test('selected pacing labels meet normal-text contrast in dark mode for all mode tones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/luyen-toc-do');
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  for (const mode of ['Part 5', 'Part 6', 'Part 7', 'Reading 75p', 'Pomodoro']) {
    if (mode === 'Part 7') await page.getByLabel('Chọn Part 7', { exact: true }).selectOption('PART_7');
    else await page.getByRole('button', { name: mode, exact: true }).click();
    const selected = page.locator('.pacing-mode.is-selected');
    const ratio = await selected.evaluate(element => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio, mode).toBeGreaterThanOrEqual(4.5);
  }
});
