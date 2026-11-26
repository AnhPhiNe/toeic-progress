import type { Page } from '@playwright/test';

/**
 * Entry points of the redesigned app (2026-11 redesign).
 * Desktop/tablet: the left sidebar has a green "Ghi điểm" button.
 * Phones: the bottom nav has a raised "Ghi" button that opens the "Ghi lại gì?" sheet
 * (Điểm đề, Buổi luyện, Chụp câu sai, Thêm từ vựng).
 */
const phoneNav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

export async function isPhoneLayout(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

type RecordKind = 'score' | 'practice' | 'mistake';
const SHEET_BUTTON: Record<RecordKind, RegExp> = {
  score: /^Điểm đề/, practice: /^Buổi luyện/, mistake: /^Chụp câu sai/
};

/** Phones: open the "+ Ghi" sheet and pick one entry. */
export async function openRecordSheet(page: Page, kind: RecordKind) {
  await phoneNav(page).getByRole('button', { name: 'Ghi', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại gì?' }).getByRole('button', { name: SHEET_BUTTON[kind] }).click();
}

/** Opens the score logger (full test) from wherever the app is. */
export async function openScoreLogger(page: Page) {
  if (await isPhoneLayout(page)) { await openRecordSheet(page, 'score'); return; }
  await page.getByRole('button', { name: 'Ghi điểm', exact: true }).first().click();
}

/** Loads a page by its route and waits for the app shell. Routes: / (Hôm nay), /lich-su (Hành trình), /luyen-toc-do (Luyện tập), /so-tay, /thanh-tich, /quy-doi, /tu-vung, /ke-hoach. */
export async function gotoPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}
