import { expect, test } from '@playwright/test';

test('phone overview shows score report, tasks, hides progress chart on phone, and preserves chart on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-01T09:00:00Z';
    const rows: Array<[string, string, number]> = [
      ['a', 'ETS A', 800], ['b', 'ETS B', 820], ['c', 'ETS C', 840], ['d', 'ETS A', 900], ['e', 'ETS D', 870]
    ];
    data.sessions = rows.map(([id, testName, totalScore], index) => ({
      id, skillType: 'LR', sessionType: 'FULL_TEST', testName, totalScore, scaledListening: 450, scaledReading: totalScore - 450,
      date: `2026-09-0${index + 1}`, durationMinutes: 120, createdAt: stamp, updatedAt: stamp, deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();

  await expect(page.getByRole('tab', { name: 'Lần đầu' })).toHaveCount(0);
  await expect(page.locator('.overview-chart-labels text')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Nhiệm vụ hôm nay' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Xem chi tiết 7 Part/ })).toBeVisible();
  const goalBar = page.locator('[data-goal-bar]');
  await expect(goalBar).toHaveClass(/bg-blue-600/);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.profile.targetScore = 850;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByText('Đã đạt mục tiêu')).toBeVisible();
  await expect(goalBar).toHaveClass(/bg-emerald-500/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('tab', { name: 'Lần đầu' })).toBeVisible();
  await expect(page.locator('.overview-chart-labels text')).toHaveCount(5);
  await expect(page.locator('.overview-chart-labels [data-retest]')).toHaveCount(0);
});

test('clicking Listening or Reading card opens skill detail modal and allows switching skills', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-20T09:00:00Z';
    data.sessions = [{
      id: 'session-detailed',
      skillType: 'LR',
      sessionType: 'FULL_TEST',
      testName: 'ETS 2024 Test 05',
      date: '2026-10-20',
      durationMinutes: 120,
      totalScore: 935,
      scaledListening: 475,
      scaledReading: 460,
      rawListening: 96,
      rawReading: 98,
      partScores: {
        part1: 6,
        part2: 24,
        part3: 38,
        part4: 28,
        part5: 29,
        part6: 16,
        part7: 53
      },
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null
    }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();

  // Chạm vào thẻ Listening
  await page.getByRole('button', { name: /Xem chi tiết Listening/ }).click();
  const modal = page.getByRole('dialog', { name: /^Chi tiết (Listening|Reading):/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('tab', { name: /^Listening/ })).toHaveAttribute('aria-selected', 'true');
  await expect(modal.getByText('Part 1 · Mô tả tranh')).toBeVisible();
  await expect(modal.getByText('6 / 6 câu · 100%')).toBeVisible();
  await expect(modal.getByText('Part 4 · Bài nói ngắn')).toBeVisible();
  await expect(modal.getByText('28 / 30 câu · 93%')).toBeVisible();

  // Chuyển tab sang Reading
  await modal.getByRole('tab', { name: /^Reading/ }).click();
  await expect(modal.getByRole('tab', { name: /^Reading/ })).toHaveAttribute('aria-selected', 'true');
  await expect(modal.getByText('Part 5 · Hoàn thành câu')).toBeVisible();
  await expect(modal.getByText('29 / 30 câu · 97%')).toBeVisible();
  await expect(modal.getByText('Part 7 · Đoạn đơn & đôi/ba')).toBeVisible();

  // Đóng modal
  await modal.getByRole('button', { name: 'Đóng chi tiết kỹ năng', exact: true }).click();
  await expect(modal).toHaveCount(0);

  // Chạm vào thẻ Reading trực tiếp
  await page.getByRole('button', { name: /Xem chi tiết Reading/ }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('tab', { name: /^Reading/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
