import { expect, test, type Page } from '@playwright/test';
import { gotoPage } from './helpers/nav';

/** Card detail v2 (design/previews/card-v2): desktop columns, phone tabs, evidences across passages, + Ôn words. */
const SHOTS = process.env.CARD_V2_SHOTS ?? '';

const P5_Q = '____ the widespread use of online reviews, many shoppers still rely on fact-checked information.';
const P7_Q = 'What will Ms. Ortiz most likely receive?';
const EV1 = 'I am writing to ask about a refund for my stay.';
const EV2 = 'Guests who report a problem during their stay may receive a partial refund after review.';
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Our team reviews every request in the order it arrives, and note ${i + 1} explains the usual steps for guests.`).join(' ');
const PASSAGE = [
  'Đoạn 1 — Email', 'From: Lena Ortiz', 'To: Harbor Hotel', 'Subject: My stay in May', '',
  `Dear Harbor Hotel team, ${EV1} I stayed in Room 412 from May 12 to May 14, and the air conditioning did not work during my visit.`, '',
  'Đoạn 2 — Bảng hoàn tiền', '| Thời điểm huỷ | Hoàn tiền |', '|---|---|', '| Trước 7 ngày | 100% |', '| 3 đến 7 ngày | 50% |', '| Dưới 3 ngày | Không hoàn |', '',
  'Đoạn 3 — Thư trả lời', `Dear Ms. Ortiz, thank you for your message. ${filler(6)}`, '', `${EV2} We will contact you within five business days.`
].join('\n');

const explanation = (extra: Record<string, unknown>) => ({ quickTip: '', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '', ...extra });

async function seed(page: Page) {
  await gotoPage(page, '/so-tay');
  await page.evaluate(({ P5_Q, P7_Q, PASSAGE, p5x, p7x }) => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    const base = { category: 'VOCABULARY_TRAP', status: 'NEEDS_REVIEW', tags: [], answerSource: 'PROVIDED', userChoice: 'A', userChoiceState: 'CHOSEN',
      sourceTestName: 'ETS 2024 Test 03', createdAt: now, updatedAt: now, deletedAt: null };
    data.mistakes = [
      { ...base, id: 'p5', part: 5, questionNumber: 128, question: P5_Q, questionContext: P5_Q, context: '', userMistake: '(A) Opposite',
        options: ['(A) Opposite', '(B) Without', '(C) Unlike', '(D) Despite'], correctAnswer: '(D) Despite',
        optionNotes: [{ label: 'A', pos: 'prep', meaning: 'trái với', reason: 'không tạo được cụm nhượng bộ.' },
          { label: 'B', pos: 'prep', meaning: 'không có', reason: 'nghĩa không hợp với vế sau.' },
          { label: 'C', pos: 'prep', meaning: 'không giống', reason: 'so sánh, không phải nhượng bộ.' },
          { label: 'D', pos: 'prep', meaning: 'mặc dù', reason: 'mở đầu cụm nhượng bộ, hợp với “still” ở vế sau.' }],
        explanation: p5x },
      { ...base, id: 'p7', part: 7, questionNumber: 149, question: P7_Q, questionContext: P7_Q, context: PASSAGE, userMistake: '(A) A free night',
        options: ['(A) A free night', '(B) A partial refund', '(C) A new booking', '(D) A voucher'], correctAnswer: '(B) A partial refund',
        optionNotes: [{ label: 'A', pos: '', meaning: 'một đêm miễn phí', reason: 'thư không hứa đêm miễn phí nào.' },
          { label: 'B', pos: '', meaning: 'hoàn tiền một phần', reason: 'báo sự cố trong kỳ ở được hoàn một phần.' },
          { label: 'C', pos: '', meaning: 'đặt phòng mới', reason: '' }, { label: 'D', pos: '', meaning: 'phiếu giảm giá', reason: '' }],
        explanation: p7x }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, {
    P5_Q, P7_Q, PASSAGE,
    p5x: explanation({ quickTip: 'Thấy “still” ở vế sau thì vế trước cần từ nhượng bộ như despite hay although.',
      analysis: "Dấu hiệu: 'still' ở vế sau: hai ý đối lập nhau.\nD — Despite: mặc dù.",
      words: [{ word: 'widespread', meaning: 'phổ biến' }, { word: 'rely on', meaning: 'dựa vào' }, { word: 'fact-checked information', meaning: 'thông tin đã kiểm chứng' }] }),
    p7x: explanation({ quickTip: 'Ghép thư hỏi hoàn tiền với chính sách trong thư trả lời.', analysis: "Dấu hiệu: 'partial refund' trong thư trả lời.",
      evidences: [{ passageLabel: 'Đoạn 1 — Email', text: EV1, translation: 'Tôi viết thư này để hỏi về việc hoàn tiền cho kỳ lưu trú.' },
        { passageLabel: 'Đoạn 3 — Thư trả lời', text: EV2, translation: 'Khách báo sự cố trong kỳ lưu trú có thể được hoàn một phần sau khi xem xét.' }],
      words: [{ word: 'refund', meaning: 'hoàn tiền' }, { word: 'stay', meaning: 'kỳ lưu trú' }] })
  });
  await page.reload();
}

const open = (page: Page, row: string, text: RegExp) => page.locator(row).filter({ hasText: text }).first().click();
const stored = (page: Page, id: string) => page.evaluate(id => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.find((m: { id: string }) => m.id === id), id);
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** The mark's top inside its scroll box: visible means between the box's top and bottom. */
const inView = (page: Page, box: string, index: number) => page.evaluate(([box, index]) => {
  const container = document.querySelector(box)!.getBoundingClientRect();
  const mark = document.querySelector(`${box} [data-ev="${index}"]`)!.getBoundingClientRect();
  return mark.top >= container.top - 1 && mark.top < container.bottom;
}, [box, index] as const);

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Part 5: reasons on the chosen and correct rows, "Vì sao" for the rest, sticky panel, + Ôn saves a word, no page scroll', async ({ page }) => {
    await seed(page);
    await open(page, '.nb-row', /widespread/);
    const card = page.locator('.cd');
    await expect(card.getByRole('heading', { name: 'Câu 128, Part 5' })).toBeVisible();
    await expect(card.locator('.cd-opt.is-pick .cd-why')).toHaveText('trái với — không tạo được cụm nhượng bộ.');
    await expect(card.locator('.cd-opt.is-ans .cd-why')).toHaveText('mặc dù — mở đầu cụm nhượng bộ, hợp với “still” ở vế sau.');
    await expect(card.getByText('nghĩa không hợp với vế sau.')).toHaveCount(0);
    await card.getByRole('button', { name: 'Vì sao B', exact: true }).click();
    await expect(card.getByText('không có — nghĩa không hợp với vế sau.')).toBeVisible();
    await card.getByRole('button', { name: 'Vì sao B', exact: true }).click();
    // The old long explanation and per-option meaning block are gone.
    await expect(page.getByRole('button', { name: /Xem giải thích/ })).toHaveCount(0);
    await expect(card.getByText('Mẹo nhanh:')).toBeVisible();
    await expect(card.locator('.cd-sign b')).toHaveText('still');
    await expect(card.getByRole('button', { name: 'Ôn câu này', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Đã thuộc', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await shot(page, 'desktop-part5');

    await card.getByRole('button', { name: 'Ôn từ widespread', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Đã lưu widespread', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page, 'p5')).savedWords).toEqual(['widespread']);
    await page.reload();
    await open(page, '.nb-row', /widespread/);
    await expect(page.getByRole('button', { name: 'Đã lưu widespread', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ôn từ rely on', exact: true })).toBeEnabled();
    // Clicking again toggles the saved word off cleanly.
    await page.getByRole('button', { name: 'Đã lưu widespread', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ôn từ widespread', exact: true })).toBeVisible();
    expect((await stored(page, 'p5')).savedWords ?? []).toEqual([]);
  });

  test('triple-passage Part 7: both evidences highlighted with translations underneath, opened at the first, jumper goes to the second', async ({ page }) => {
    await seed(page);
    await open(page, '.nb-row', /Ortiz/);
    const passage = page.locator('.cd-pscroll');
    await expect(passage.getByText('Đoạn 1 — Email')).toBeVisible();
    await expect(passage.locator('.psg-table')).toBeVisible();
    await expect(passage.locator('mark.cd-ev')).toHaveText([EV1, EV2]);
    await expect(passage.locator('mark.cd-ev + .cd-ev-vi')).toHaveText([
      'Tôi viết thư này để hỏi về việc hoàn tiền cho kỳ lưu trú.', 'Khách báo sự cố trong kỳ lưu trú có thể được hoàn một phần sau khi xem xét.']);
    await expect(page.getByText('Câu bằng chứng', { exact: true })).toHaveCount(0);
    expect(await inView(page, '.cd-pscroll', 0)).toBe(true);
    expect(await inView(page, '.cd-pscroll', 1)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    // Right side: question, options with reasons (reading cards show the reason alone), words, actions.
    await expect(page.locator('.cd-panel .cd-q')).toHaveText(P7_Q);
    await expect(page.locator('.cd-opt.is-ans .cd-why')).toHaveText('báo sự cố trong kỳ ở được hoàn một phần.');
    await shot(page, 'desktop-part7');

    const jump = page.getByRole('button', { name: /^Bằng chứng 1 trên 2/ });
    await jump.click();
    await expect(page.getByRole('button', { name: /^Bằng chứng 2 trên 2/ })).toBeVisible();
    await expect(passage.locator('mark.cd-ev.is-at')).toHaveText(EV2);
    expect(await inView(page, '.cd-pscroll', 1)).toBe(true);
    await page.getByRole('button', { name: /^Bằng chứng 2 trên 2/ }).click();
    expect(await inView(page, '.cd-pscroll', 0)).toBe(true);
  });

  test('review keeps the evidence hidden until the question is answered', async ({ page }) => {
    await seed(page);
    await open(page, '.nb-row', /Ortiz/);
    await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
    await expect(review).toBeVisible();
    await expect(review.locator('mark')).toHaveCount(0);
    await expect(review.getByText('Tôi viết thư này để hỏi về việc hoàn tiền cho kỳ lưu trú.')).toHaveCount(0);
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Part 5: Câu hỏi & Mẹo | Từ vựng tabs, thumb-zone bar over the tab bar, ⋯ menu, + Ôn cả', async ({ page }) => {
    await seed(page);
    await open(page, '.pn-row', /widespread/);
    const tabs = page.getByRole('tablist', { name: 'Phần của thẻ' }).getByRole('tab');
    await expect(tabs).toHaveText(['Câu hỏi & Mẹo', 'Từ vựng']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cd-opt.is-ans .cd-why')).toContainText('mặc dù');
    // The bottom bar covers the app's tab bar on this screen.
    const covered = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 10)?.closest('.cdp') !== null);
    expect(covered).toBe(true);
    const review = page.getByRole('button', { name: 'Ôn câu này', exact: true });
    const box = (await review.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(700);
    for (const target of await page.locator('.cdp button:visible').all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText('Mẹo nhanh:')).toBeVisible();
    await expect(page.locator('.cd-sign b')).toHaveText('still');
    await shot(page, 'phone-part5-cau-hoi');

    await page.getByRole('tab', { name: 'Từ vựng' }).click();
    await page.getByRole('button', { name: 'Ôn từ rely on', exact: true }).click();
    await page.getByRole('button', { name: '+ Ôn cả 2 từ', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Đã lưu/ })).toHaveCount(3);
    expect((await stored(page, 'p5')).savedWords).toEqual(['rely on', 'widespread', 'fact-checked information']);
    await shot(page, 'phone-part5-tu-vung');

    await page.getByRole('button', { name: 'Thêm thao tác', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Sửa câu này' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Xoá câu này' })).toBeVisible();
    await shot(page, 'phone-part5-menu');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('triple-passage Part 7: Đoạn văn first, at the evidence, with the question chip and the 1/2 jumper', async ({ page }) => {
    await seed(page);
    await open(page, '.pn-row', /Ortiz/);
    const tabs = page.getByRole('tablist', { name: 'Phần của thẻ' }).getByRole('tab');
    await expect(tabs).toHaveText(['Đoạn văn', 'Câu hỏi & Mẹo', 'Từ vựng']);
    await expect(page.locator('.cdp-qchip')).toContainText(P7_Q);
    const passage = page.locator('.cdp-pcard');
    await expect(passage.locator('mark.cd-ev')).toHaveCount(2);
    await expect(passage.locator('.cd-ev-vi').first()).toHaveText('Tôi viết thư này để hỏi về việc hoàn tiền cho kỳ lưu trú.');
    expect(await inView(page, '.cdp-pcard', 0)).toBe(true);
    await shot(page, 'phone-part7-doan-van');
    await page.getByRole('button', { name: /^Bằng chứng 1 trên 2/ }).click();
    expect(await inView(page, '.cdp-pcard', 1)).toBe(true);
    await expect(passage.locator('mark.cd-ev.is-at')).toHaveText(EV2);
    await shot(page, 'phone-part7-doan-van-2');

    await page.getByRole('tab', { name: 'Câu hỏi & Mẹo' }).click();
    await expect(page.locator('.cd-opt.is-pick .cd-why')).toHaveText('thư không hứa đêm miễn phí nào.');
    await expect(page.locator('.cd-sign b')).toHaveText('partial refund');
    await shot(page, 'phone-part7-cau-hoi');
  });
});
