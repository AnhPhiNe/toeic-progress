import { chooseNoteSource } from './helpers/noteSource';
import { openCardEditor, openManualForm, PHONE_VIEWPORT } from './helpers/mistakeForm';
import { test, expect } from '@playwright/test';
import { openManualEntry } from './helpers/manualEntry';
import { closeTestResult, openGridForm, useOfficialScore } from './helpers/sessionForm';
import { gotoPage, openScoreLogger } from './helpers/nav';
import { answerConfirm } from './helpers/confirmDialog';

// Phones (<768px) pick the test from chips in the PhoneLogger; this is the computer form's dropdown.
for (const width of [1280]) {
  test(`source suggestions follow the animated form and leave Save reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/lich-su');
    const form = await openGridForm(page);
    const input = form.getByRole('combobox', { name: /^Tên (đề|Đề Thi \/ Nguồn)$/, exact: true });
    await input.fill('QA animated source');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    const popup = page.getByRole('listbox', { name: 'Tên đề gợi ý', exact: true });
    await expect.poll(() => popup.evaluate(list => {
      const anchor = document.querySelector('#session-test-name')!.getBoundingClientRect();
      const bounds = list.closest('[data-modal-owner]')!.getBoundingClientRect();
      return Math.abs(bounds.top - anchor.bottom - 5);
    })).toBeLessThan(2);
    await expect(popup.getByRole('option', { name: '+ Thêm tên đề “QA animated source”', exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
    await answerConfirm(page, false, '990');
    await expect(form).toBeVisible();
    await expect(popup).toHaveCount(0);
  });
}

test('search stays inside the dropdown, keeps the field stable and marks the selected source when editing a card', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'pick-card', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', sourceTestName: 'ETS 2025 Test 03',
      question: 'Reports should ____ submitted.', questionContext: 'Reports should ____ submitted.', options: ['(A) are', '(B) be'],
      correctAnswer: '(B) be', answerSource: 'PROVIDED', userMistake: '', tags: [], createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const modal = await openCardEditor(page);
  await chooseNoteSource(modal, 'ETS 2025 Test 03');
  const trigger = modal.getByRole('button', { name: 'Chọn đề', exact: true });
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(trigger).toBeVisible();
    const before = (await trigger.boundingBox())!;
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const search = modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true });
    await expect(search).toBeFocused();
    const after = (await trigger.boundingBox())!;
    expect(after).toEqual(before);
    await expect(modal.getByRole('button', { name: 'Hủy đổi đề', exact: true })).toHaveCount(0);
    const selected = modal.getByRole('option', { name: 'ETS 2025 Test 03', exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected.locator('svg')).toBeVisible();
    const bounds = (await modal.getByRole('listbox', { name: 'Tên đề gợi ý' }).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await search.fill('Canceled source'); await search.press('Escape');
    await expect(trigger).toHaveText('ETS 2025 Test 03'); await expect(trigger).toBeFocused();
    await expect(modal.getByRole('listbox')).toHaveCount(0);
  }
  await trigger.click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).press('Tab');
  expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(modal.getByRole('listbox')).toHaveCount(0);
});

test('adding a source from notes creates no score, and total/part forms reuse one canonical name', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoPage(page, '/so-tay');
  const manual = await openManualForm(page);
  await manual.getByLabel('Đề', { exact: true }).fill('ETS 2025 Test 03');
  await manual.getByLabel('Câu hỏi và các phương án').fill('Part 5:\nReports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been');
  await manual.getByRole('button', { name: 'Mình chọn: A', exact: true }).click();
  await manual.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(manual).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.length)).toBe(0);

  await page.goto('/lich-su');
  await openScoreLogger(page);
  let modal = page.getByRole('dialog');
  await openManualEntry(page, modal);
  const scoreSource = modal.getByRole('combobox', { name: /^Tên (đề|Đề Thi \/ Nguồn)$/ });
  await scoreSource.fill('  ets 2025   test 03  ');
  await expect(page.getByRole('option', { name: 'ETS 2025 Test 03', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Thêm tên đề/ })).toHaveCount(0);
  await scoreSource.press('Enter');
  await expect(scoreSource).toHaveValue('ETS 2025 Test 03');
  await useOfficialScore(modal);
  await modal.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await modal.getByLabel('Tổng điểm /990').fill('750');
  await modal.getByRole('button', { name: 'Lưu kết quả' }).click();
  await closeTestResult(page);

  await openScoreLogger(page);
  modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Bài luyện Part', exact: true }).click();
  const details = modal.getByRole('button', { name: /^Thêm tên bài/ });
  if (!(await modal.getByRole('combobox', { name: 'Tên đề hoặc nguồn' }).isVisible()) && await details.count()) await details.first().click();
  const partSource = modal.getByRole('combobox', { name: 'Tên đề hoặc nguồn' });
  await partSource.click();
  await partSource.fill('ETS 2025');
  await partSource.press('ArrowDown');
  await expect(partSource).toHaveAttribute('aria-expanded', 'true');
  const canonicalPartName = page.getByRole('option', { name: 'ETS 2025 Test 03', exact: true });
  await expect(canonicalPartName).toHaveCount(1);
  await canonicalPartName.click();
  await expect(partSource).toHaveValue('ETS 2025 Test 03');
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(data.sessions).toHaveLength(1); expect(data.sessions[0]).toMatchObject({ testName: 'ETS 2025 Test 03', totalScore: 750 });
  expect(data.mistakes).toHaveLength(1); expect(data.mistakes[0].sourceTestName).toBe('ETS 2025 Test 03');
});
