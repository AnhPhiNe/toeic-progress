import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MistakeEntry, MistakeExplanation } from '@/shared/types';
import { cardEvidences, looseFind, markPassage, optionRows, quotedParts, signalLine, type MarkedBlock } from './cardDetail';
import { reviewFocus, splitFocus } from './passageFocus';
import { isWordSaved, savedVocabulary, toggleSavedWord, withoutSavedWord, withSavedWords } from './savedWords';
import { EvidencePassage } from '@/features/mistakes/components/CardParts';

const TRIPLE = [
  'Đoạn 1 — Email',
  'Dear Harbor Hotel team,',
  'I am writing to ask about a refund for my stay. The air conditioning did not work.',
  '',
  'Đoạn 2 — Bảng hoàn tiền',
  '| Thời điểm huỷ | Hoàn tiền |',
  '|---|---|',
  '| Trước 7 ngày | 100% |',
  '| Dưới 3 ngày | Không hoàn |',
  '',
  'Đoạn 3 — Thư trả lời',
  'Thank you for writing. Guests who report a problem during their stay may receive a partial refund after review.'
].join('\n');

const base = (explanation: Partial<MistakeExplanation>): MistakeExplanation => ({
  quickTip: '', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '', ...explanation
});
const card = (fields: Partial<MistakeEntry>): MistakeEntry => ({
  id: 'c1', part: 7, questionContext: 'Q', question: 'Q', userMistake: '', correctAnswer: '(B) A partial refund', category: 'OTHER',
  tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-20T00:00:00.000Z', ...fields
});
const marks = (blocks: MarkedBlock[]) => blocks.flatMap(block => block.kind === 'text'
  ? block.segments.flatMap(segment => segment.kind === 'mark' ? [[segment.order, segment.text, segment.translation]] : [])
  : block.kind === 'table' ? block.rows.flatMap(row => row.order !== undefined ? [[row.order, row.cells.join(' | '), row.translation]] : []) : []);

describe('evidence across passages', () => {
  const evidences = [
    { passageLabel: 'Đoạn 3 — Thư trả lời', text: 'Guests who report a problem during their stay may receive a partial refund after review.', translation: 'Khách báo sự cố có thể được hoàn một phần.' },
    { passageLabel: 'Đoạn 1 — Email', text: '“I am writing to ask about a refund for my stay.”', translation: 'Tôi viết để hỏi về hoàn tiền.' }
  ];

  it('marks every evidence in its own passage, numbered in reading order, each with its translation', () => {
    const { blocks, count } = markPassage(TRIPLE, evidences);
    expect(count).toBe(2);
    expect(marks(blocks)).toEqual([
      [0, 'I am writing to ask about a refund for my stay.', 'Tôi viết để hỏi về hoàn tiền.'],
      [1, 'Guests who report a problem during their stay may receive a partial refund after review.', 'Khách báo sự cố có thể được hoàn một phần.']
    ]);
    const labels = blocks.filter(block => block.kind === 'label').map(block => block.kind === 'label' && block.text);
    expect(labels).toEqual(['Đoạn 1 — Email', 'Đoạn 2 — Bảng hoàn tiền', 'Đoạn 3 — Thư trả lời']);
  });

  it('marks a table row quoted as evidence and keeps the rest of the paragraph around a mark', () => {
    const { blocks, count } = markPassage(TRIPLE, [{ text: '| Dưới 3 ngày | Không hoàn |', translation: 'Huỷ dưới 3 ngày không được hoàn.' }, evidences[0]]);
    expect(count).toBe(2);
    expect(marks(blocks)).toEqual([
      [0, 'Dưới 3 ngày | Không hoàn', 'Huỷ dưới 3 ngày không được hoàn.'],
      [1, 'Guests who report a problem during their stay may receive a partial refund after review.', 'Khách báo sự cố có thể được hoàn một phần.']
    ]);
    const last = blocks[blocks.length - 1];
    expect(last.kind === 'text' && last.segments[0]).toEqual({ kind: 'text', text: 'Thank you for writing. ' });
  });

  it('renders both highlights with the translation right under each sentence, no separate evidence box', () => {
    const html = renderToStaticMarkup(createElement(EvidencePassage, { context: TRIPLE, evidences, at: 1 }));
    expect(html.match(/<mark/g)).toHaveLength(2);
    expect(html).toContain('<mark class="cd-ev" data-ev="0">I am writing to ask about a refund for my stay.</mark><span class="cd-ev-vi" lang="vi">Tôi viết để hỏi về hoàn tiền.</span>');
    expect(html).toContain('class="cd-ev is-at" data-ev="1"');
    expect(html).not.toContain('Câu bằng chứng');
  });

  it('ignores spacing, case, dashes, table pipes and quote style but never a sentence that is not in the passage', () => {
    expect(looseFind('He said “hello there” loudly.', '"Hello   there"')).toEqual({ start: 9, end: 20 });
    expect(looseFind('Standard – Deluxe package is $50.', 'Standard - Deluxe package')).not.toBeNull();
    expect(looseFind('| Dưới 3 ngày | Không hoàn |', 'Dưới 3 ngày|Không hoàn')).not.toBeNull();
    expect(looseFind(TRIPLE, 'All guests receive a full refund.')).toBeNull();
    expect(looseFind(TRIPLE, 'stay')).toBeNull();
  });

  it('honors passageLabel when duplicate sentences appear in different passages and marks table headers', () => {
    const dup = [
      'Đoạn 1 — Email',
      'All orders must be confirmed by Friday.',
      '',
      'Đoạn 2 — Policy',
      '| Fee Category | Standard Rate |',
      '|---|---|',
      '| Late Cancel | $25 |',
      '',
      'Đoạn 3 — Reply',
      'All orders must be confirmed by Friday.'
    ].join('\n');
    const { blocks, count } = markPassage(dup, [
      { passageLabel: 'Đoạn 3 — Reply', text: 'All orders must be confirmed by Friday.', translation: 'Mọi đơn cần xác nhận trước thứ Sáu.' },
      { passageLabel: 'Đoạn 2 — Policy', text: 'Fee Category | Standard Rate', translation: 'Mục phí và mức chuẩn.' }
    ]);
    expect(count).toBe(2);
    // Block 1 (Đoạn 1 text) must remain unmarked; Block 3 (Đoạn 2 table header) gets order 0; Block 5 (Đoạn 3 text) gets order 1.
    const textBlocks = blocks.filter(b => b.kind === 'text');
    expect(textBlocks[0].kind === 'text' && textBlocks[0].segments.some(s => s.kind === 'mark')).toBe(false);
    expect(textBlocks[1].kind === 'text' && textBlocks[1].segments.some(s => s.kind === 'mark' && s.order === 1)).toBe(true);
    const tableBlock = blocks.find(b => b.kind === 'table');
    expect(tableBlock?.kind === 'table' && tableBlock.headerOrder).toBe(0);
  });

  it('cardEvidences keeps found AI evidences, else the Part 6 blank sentence or the old single evidence', () => {
    const withList = card({ context: TRIPLE, explanation: base({ evidences: [...evidences, { text: 'Not in the passage at all.', translation: 'x' }] }) });
    expect(cardEvidences(withList).map(item => item.passageLabel)).toEqual(['Đoạn 3 — Thư trả lời', 'Đoạn 1 — Email']);
    const old = card({ context: TRIPLE, explanation: base({ evidence: '“…ask about a refund for my stay”' }) });
    expect(cardEvidences(old)).toEqual([{ text: 'ask about a refund for my stay' }]);
    const part6 = card({ part: 6, questionNumber: 135, context: 'We are glad. All rooms 135 ____ with a view of the lake. Thank you.', explanation: base({ translation: 'Mọi phòng đều có view hồ.' }) });
    expect(cardEvidences(part6)).toEqual([{ text: 'All rooms 135 ____ with a view of the lake.', translation: 'Mọi phòng đều có view hồ.' }]);
    expect(cardEvidences(card({ explanation: base({ evidences }) }))).toEqual([]);
  });

  it('review never marks the evidence before the answer, then uses the first evidence sentence', () => {
    const reviewCard = card({ context: TRIPLE, explanation: base({ evidences }) });
    expect(reviewFocus(TRIPLE, reviewCard, false)).toBeNull();
    expect(splitFocus(TRIPLE, reviewFocus(TRIPLE, reviewCard, true)).focus).toBe(evidences[0].text);
  });
});

describe('options, signal and words', () => {
  it('option rows carry meaning, reason and who chose what', () => {
    const rows = optionRows(card({ part: 5, options: ['(A) Opposite', '(B) Without', '(D) Despite'], correctAnswer: '(D) Despite', userChoice: 'A', userChoiceState: 'CHOSEN',
      optionNotes: [{ label: 'A', pos: 'prep', meaning: 'trái với', reason: 'không tạo được cụm nhượng bộ.' }, { label: 'D', pos: 'prep', meaning: 'mặc dù' }] }));
    expect(rows.map(row => [row.letter, row.text, row.role, row.meaning, row.reason])).toEqual([
      ['A', 'Opposite', 'pick', 'trái với', 'không tạo được cụm nhượng bộ.'], ['B', 'Without', '', '', ''], ['D', 'Despite', 'ans', 'mặc dù', '']
    ]);
  });

  it('reads the "Dấu hiệu" line and shows quoted words highlighted', () => {
    const line = signalLine("Dấu hiệu: 'still' ở vế sau: hai ý đối lập nhau.\nD — Despite: mặc dù.");
    expect(line).toBe("'still' ở vế sau: hai ý đối lập nhau.");
    expect(quotedParts(line)).toEqual([{ text: 'still', quoted: true }, { text: ' ở vế sau: hai ý đối lập nhau.', quoted: false }]);
    expect(quotedParts("don't stop")).toEqual([{ text: "don't stop", quoted: false }]);
    expect(signalLine('Không có dòng này.')).toBe('');
  });

  it('saved words stay on the card once each, can be toggled off, and are listed across cards', () => {
    const first = card({ explanation: base({ words: [{ word: 'Rely on', meaning: 'dựa vào' }] }) });
    const saved = withSavedWords(first, ['Rely  on', 'rely on']);
    expect(saved.savedWords).toEqual(['rely on']);
    expect(isWordSaved(saved, 'RELY ON')).toBe(true);
    expect(withSavedWords(saved, ['rely on'])).toBe(saved);
    const toggledOff = toggleSavedWord(saved, 'Rely on');
    expect(isWordSaved(toggledOff, 'rely on')).toBe(false);
    expect(toggledOff.savedWords).toBeUndefined();
    expect(withoutSavedWord(saved, 'missing')).toBe(saved);
    const other = withSavedWords(card({ id: 'c2', part: 5, questionNumber: 112, createdAt: '2026-11-21T00:00:00.000Z' }), ['refund']);
    expect(savedVocabulary([saved, other, { ...other, id: 'gone', deletedAt: '2026-11-22T00:00:00.000Z', savedWords: ['gone'] }]))
      .toEqual([
        { word: 'refund', meaning: '', cardId: 'c2', part: 5, questionNumber: 112 },
        { word: 'Rely on', meaning: 'dựa vào', cardId: 'c1', part: 7, questionNumber: undefined }
      ]);
  });
});
