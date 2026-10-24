import { describe, expect, it } from 'vitest';
import { confirmedResultTimingSchema, emptyResultTiming, formatElapsed, parseElapsed, resultImageTimingSchema } from './resultTiming';

describe('explicit elapsed timing', () => {
  it('parses clock forms without interpreting remaining time, fractions or unitless guesses', () => {
    expect(parseElapsed('112:43')).toBe(6763);
    expect(parseElapsed('1:52:43')).toBe(6763);
    expect(parseElapsed('0:00')).toBe(0);
    expect(parseElapsed('')).toBeNull();
    for (const raw of ['112', 'còn 20:00', '12:65', '-3:00', '1.5:00', '25:00:00']) expect(parseElapsed(raw)).toBe('invalid');
  });
  it('keeps missing scopes null and does not derive parts or sections from a total', () => {
    const totalOnly = { ...emptyResultTiming(), totalSeconds: 6763 };
    expect(resultImageTimingSchema.parse(totalOnly)).toEqual(totalOnly);
    expect(confirmedResultTimingSchema.parse({ ...totalOnly, source: 'IMAGE_CONFIRMED' })).toMatchObject({ listeningSeconds: null, parts: emptyResultTiming().parts });
    expect(confirmedResultTimingSchema.safeParse({ ...emptyResultTiming(), source: 'IMAGE_CONFIRMED' }).success).toBe(false);
    expect(resultImageTimingSchema.safeParse({ ...totalOnly, totalSeconds: '6763' }).success).toBe(false);
    expect(resultImageTimingSchema.safeParse({ ...totalOnly, totalSeconds: 6763.5 }).success).toBe(false);
  });
  it('formats exact seconds for review rather than rounding them to minutes', () => {
    for (const seconds of [0, 43, 763, 6763, 86400]) expect(parseElapsed(formatElapsed(seconds))).toBe(seconds);
  });
});
