import { describe, expect, it } from 'vitest';
import { captureQuestions } from './captureContext';

describe('questions one Part capture looks for', () => {
  const logged = { questions: [103, 112, 133, 186, 189, 196], logged: true };
  it('uses the logged wrong questions of the chosen Part, or of the chosen passage group', () => {
    expect(captureQuestions(logged, 5)).toEqual([103, 112]);
    expect(captureQuestions(logged, 7)).toEqual([186, 189, 196]);
    expect(captureQuestions(logged, 7, { from: 186, to: 190 })).toEqual([186, 189]);
  });
  it('captures freely without a wrong list (the whole Part, or the whole group)', () => {
    const free = { questions: [], logged: false };
    expect(captureQuestions(free, 5)).toHaveLength(30);
    expect(captureQuestions(free, 6)).toEqual([131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146]);
    expect(captureQuestions(free, 7, { from: 176, to: 180 })).toEqual([176, 177, 178, 179, 180]);
    // A logged test with no wrong question in that Part is captured freely too.
    expect(captureQuestions({ questions: [103], logged: true }, 6)).toHaveLength(16);
  });
});
