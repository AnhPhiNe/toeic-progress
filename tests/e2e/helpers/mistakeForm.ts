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

/** The phone viewport the old note form ("Thêm câu sai", MistakeEntryModal) is reached in. Computers add cards with the camera or "Tự gõ một câu" (ManualQuestionModal). */
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Opens the full note form (MistakeEntryModal, dialog "Thêm câu sai") the way a phone does: bottom nav "Ghi" ->
 * "Chụp câu sai" -> camera screen -> "Tự gõ". On computers this form is only used for editing a card, so tests that
 * type a new note through it run at phone width (`test.use({ viewport: PHONE_VIEWPORT })`).
 */
export async function openNoteForm(page: Page) {
  if (!await isPhoneLayout(page)) throw new Error('openNoteForm is for phone width; computers use openManualForm');
  // The first-time camera tips sheet would cover the camera screen.
  await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
  await openRecordSheet(page, 'mistake');
  await captureMore(page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true }), 'Tự gõ một câu');
  await expect(page.getByRole('dialog', { name: 'Thêm câu sai', exact: true })).toBeVisible();
  return noteModal(page);
}

/** The note form dialog; its title changes (Thêm câu sai / Kiểm tra và lưu / Sửa câu sai), so it is found by its labelling id. */
export const noteModal = (page: Page) => page.locator('[role="dialog"][aria-labelledby="mistake-entry-title"]');

/** Computers: Sổ tay -> "Tự gõ một câu" opens ManualQuestionModal ("Tự gõ một câu sai"). */
export async function openManualForm(page: Page) {
  await page.getByRole('button', { name: /Tự gõ một câu$/i }).first().click();
  const modal = page.getByRole('dialog', { name: 'Tự gõ một câu sai', exact: true });
  await expect(modal).toBeVisible();
  return modal;
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
