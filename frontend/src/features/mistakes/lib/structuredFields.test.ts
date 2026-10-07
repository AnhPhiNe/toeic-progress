import { describe, expect, it } from 'vitest';
import { carryStructured, type StructuredSource } from '@/features/mistakes/lib/structuredFields';

const source: StructuredSource = {
  options: ['(A) prompt', '(B) promptly'],
  trapTip: 'Mẹo 10s: chọn trạng từ.',
  optionNotes: [{ label: 'A', pos: 'adj', meaning: 'nhanh chóng' }, { label: 'B', pos: 'adv', meaning: 'một cách kịp thời' }],
  explanation: { quickTip: 'chọn trạng từ.', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '' }
};

describe('carrying structured AI fields through a manual edit', () => {
  it('keeps everything when options and explanation are unchanged', () => {
    const kept = carryStructured(source, ['(A) prompt', '(B) promptly'], 'Mẹo 10s: chọn trạng từ.');
    expect(kept.optionNotes).toHaveLength(2);
    expect(kept.explanation).toBe(source.explanation);
  });

  it('drops the meaning of an edited option and the explanation once its text is edited', () => {
    const kept = carryStructured(source, ['(A) prompts', '(B) promptly'], 'Giải thích tự viết');
    expect(kept.optionNotes?.map(note => note.label)).toEqual(['B']);
    expect(kept.explanation).toBeUndefined();
  });

  it('has nothing to carry for a card typed by hand', () => {
    expect(carryStructured(null, ['(A) are'], '')).toEqual({ optionNotes: undefined, explanation: undefined });
  });
});
