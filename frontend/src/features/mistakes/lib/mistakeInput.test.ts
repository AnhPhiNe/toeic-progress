import { describe, expect, it } from 'vitest';
import { parsePastedQuestion, learnerMistake, PART1_QUESTION } from './mistakeInput';

const question = 'The latest ____ of decorations in stock indicates adequate preparation.';
describe('pasted single question', () => {
  it('accepts copied website headings, a separate question number, Markdown and HTML spaces', () => {
    const stem = 'What is suggested about the students in a creative writing class?';
    const parsed = parsePastedQuestion(`**Câu hỏi**\n**178**\n**${stem}**\n(A) They have read Rome: Mystery in a Minor Key.&#x20;\n(B) They are beginning writers.&#x20;\n(C) They are planning to travel to Rome.&#x20;\n(D) They are enrolled in an evening class.\u00a0`, 7);
    expect(parsed.error).toBe(''); expect(parsed.part).toBe(7); expect(parsed.question).toBe(stem);
    expect(parsed.options).toEqual(['(A) They have read Rome: Mystery in a Minor Key.', '(B) They are beginning writers.',
      '(C) They are planning to travel to Rome.', '(D) They are enrolled in an evening class.']);
  });
  it('keeps wrapped question/option wording and source numbers inside a passage', () => {
    const stem = 'What does the price of\n100 dollars include?';
    const parsed = parsePastedQuestion(`## Question 178\n${stem}\n**(A)** Food &amp; drinks.\n**(B)** Admission to\ntwo events.\n**(C)** Bus tickets.\n**(D)** Hotel stays.`, 7);
    expect(parsed.error).toBe(''); expect(parsed.question).toBe(stem);
    expect(parsed.options).toEqual(['(A) Food & drinks.', '(B) Admission to\ntwo events.', '(C) Bus tickets.', '(D) Hotel stays.']);
    const context = 'Shipping table\n178\nPrice in dollars\nWhat is the price?';
    expect(parsePastedQuestion(`${context}\n(A) $10\n(B) $20\n(C) $30\n(D) $40`, 7).question).toBe(context);
  });
  it('rejects multiple copied questions even when their numbers are on separate lines', () => {
    expect(parsePastedQuestion('Câu hỏi\n178\nFirst question?\n179\nSecond question?\n(A) One\n(B) Two\n(C) Three\n(D) Four', 7).error).toContain('một câu');
    expect(parsePastedQuestion('Câu hỏi\n178\n(A) One\n(B) Two\n(C) Three\n(D) Four', 7).error).toContain('trống');
  });
  it('Part 1 accepts four spoken descriptions without inventing a written stem', () => {
    for (const text of ['(A) A man is seated.\n(B) A man is walking.\n(C) A car is parked.\n(D) A door is closed.',
      'A man is seated.\nA man is walking.\nA car is parked.\nA door is closed.']) {
      const value = parsePastedQuestion(text, 1);
      expect(value.error).toBe(''); expect(value.question).toBe(PART1_QUESTION); expect(value.options).toHaveLength(4);
    }
    expect(parsePastedQuestion('(A) First.\n(B) Second.\n(C) Third.', 1).error).not.toBe('');
  });
  it.each(['(A) proposal (B) inventory (C) consideration (D) commitment',
    'A. proposal\nB. inventory\nC. consideration\nD. commitment',
    'A) proposal\nB) inventory\nC) consideration\nD) commitment',
    'a: proposal\nb: inventory\nc: consideration\nd: commitment',
    '• (A) proposal\n• (B) inventory\n• (C) consideration\n• (D) commitment',
    '- A. proposal\n- B. inventory\n- C. consideration\n- D. commitment',
    'A proposal\nB inventory\nC consideration\nD commitment',
    'proposal\ninventory\nconsideration\ncommitment'])('preserves option contents for %s', options => {
    const parsed = parsePastedQuestion(`Câu 108 Part 5:\n${question}\n${options}`);
    expect(parsed.error).toBe('');
    expect(parsed.question).toBe(question);
    expect(parsed.options).toEqual(['(A) proposal', '(B) inventory', '(C) consideration', '(D) commitment']);
    expect(parsed.part).toBe(5);
  });
  it('keeps Part 2 at three choices without assigning a fourth option', () => {
    const value = parsePastedQuestion('Part 2:\nWhen does the meeting start?\nAt noon\nIn the office\nMr. Tran');
    expect(value.part).toBe(2); expect(value.options).toHaveLength(3); expect(value.error).toBe('');
  });
  it('preserves English articles in unlabeled sentence options', () => {
    const value = parsePastedQuestion('Part 7:\nWhat is mentioned?\nA detailed inventory\nA shipping schedule\nA staff meeting\nA holiday event');
    expect(value.error).toBe(''); expect(value.options[0]).toBe('(A) A detailed inventory');
  });
  it('rejects multiple questions, repeated labels and missing option text', () => {
    expect(parsePastedQuestion('Câu 131:\nQ1\n(A) first\n(B) next\nCâu 132:\nQ2\n(A) last\n(B) other').error).toContain('một câu');
    expect(parsePastedQuestion(`${question}\n(A) first\n(A) second`).error).toContain('trùng');
    expect(parsePastedQuestion(`${question}\n(A)\n(B) second`).error).toContain('trống');
  });
  it('never guesses the learner reason or choice from narration', () => {
    expect(learnerMistake({ options: ['(A) proposal', '(B) inventory'], userChoice: '', userChoiceState: 'UNKNOWN', userReason: '' })).toBe('Không nhớ');
    expect(learnerMistake({ options: [], userChoice: '', userChoiceState: 'BLANK', userReason: 'Không kịp đọc\nĐáp án chuẩn: A' })).toBe('Bỏ trống - Không kịp đọc\nĐáp án chuẩn: A');
  });
});
