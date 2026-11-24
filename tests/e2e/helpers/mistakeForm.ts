import { expect, type Locator, type Page } from '@playwright/test';
import { captureMore } from './wrongDetail';
import { isPhoneLayout, openRecordSheet } from './nav';

/** Phones pick the Part with seven buttons; larger screens keep the select. */
export async function choosePart(modal: Locator, part: string) {
  const select = modal.getByRole('combobox', { name: 'Part', exact: true });
  if (await select.count()) await select.selectOption(part);
  else await modal.getByRole('button', { name: `Part ${part}`, exact: true }).click();
}

export async function expectPart(modal: Locator, part: string) {
  const select = modal.getByRole('combobox', { name: 'Part', exact: true });
  if (await select.count()) { await expect(select).toHaveValue(part); return; }
  const group = modal.getByRole('group', { name: 'Part', exact: true });
  if (part) await expect(group.getByRole('button', { name: `Part ${part}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  else await expect(group.locator('[aria-pressed="true"]')).toHaveCount(0);
}

/** Phones fold the answer key into the "Đáp án, loại lỗi" row; larger screens use their own disclosure. */
export async function openAnswerKey(modal: Locator) {
  // Idempotent: the disclosure keeps its state when the form resets for the next card.
  const summary = modal.locator('summary').filter({ hasText: /Đáp án, loại lỗi|Đáp án (đúng )?từ đề/ }).first();
  const isOpen = () => summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open);
  if (!await isOpen()) await summary.click();
}

/** Standard phone viewport for mobile E2E tests. */
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

/** The note editor dialog (MistakeEntryModal, used for editing saved cards); found by its labelling id. */
export const noteModal = (page: Page) => page.locator('[role="dialog"][aria-labelledby="mistake-entry-title"]');

/** Opens "Tự gõ một câu" (ManualQuestionModal) on both desktop and phone. */
export async function openManualForm(page: Page) {
  if (await isPhoneLayout(page)) {
    const direct = page.getByRole('button', { name: /Tự gõ một câu$/i }).first();
    if (await direct.isVisible()) {
      await direct.click();
    } else {
      await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
      await openRecordSheet(page, 'mistake');
      await captureMore(page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true }), 'Tự gõ một câu');
    }
  } else {
    await page.getByRole('button', { name: /Tự gõ một câu$/i }).first().click();
  }
  const modal = page.getByRole('dialog', { name: 'Tự gõ một câu sai', exact: true });
  await expect(modal).toBeVisible();
  return modal;
}

/** Sets the test name inside ManualQuestionModal's TestSelect (works whether it renders <input> or <select>). */
export async function setManualSource(modal: Locator, name: string) {
  const select = modal.locator('select[aria-label="Đề"]');
  if (await select.count()) {
    const existing = await select.locator('option').evaluateAll((opts, target) =>
      opts.map(o => (o as HTMLOptionElement).value).find(v => v.trim().toLowerCase().replace(/\s+/g, ' ') === target.trim().toLowerCase().replace(/\s+/g, ' ')) ?? '',
    name);
    if (existing) { await select.selectOption(existing); return; }
    await select.selectOption('__new__');
  }
  await modal.locator('input[aria-label="Đề"]').fill(name);
}

/**
 * Opens a card from the Sổ tay list. Computers show the question text in the row; phone rows only say "Câu N"/"Tự ghi"
 * (their `aria-label`), so phones pick by position (`index`, 0 = first row of the tab that is showing).
 */
export async function openCard(page: Page, text?: string | RegExp, index = 0) {
  if (await isPhoneLayout(page)) { await page.locator('.pn-row').nth(index).click(); return; }
  const rows = page.locator('.nb-row');
  await (text ? rows.filter({ hasText: text }).nth(index) : rows.nth(index)).click();
}

/** Opens a card, then the old note form through the card's "Sửa" link. */
export async function openCardEditor(page: Page, text?: string | RegExp, index = 0) {
  await openCard(page, text, index);
  // Phones keep Sửa/Xoá in the card's ⋯ menu.
  if (await isPhoneLayout(page)) {
    await page.getByRole('button', { name: 'Thêm thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sửa câu này', exact: true }).click();
  } else await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await expect(noteModal(page)).toBeVisible();
  return noteModal(page);
}
