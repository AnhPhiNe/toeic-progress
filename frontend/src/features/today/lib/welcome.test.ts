import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSeenWelcome, isFreshLearner, markWelcomeSeen, shouldGreet } from './welcome';

describe('welcome flag', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  it('is unset until marked, per owner', () => {
    expect(hasSeenWelcome('a')).toBe(false);
    markWelcomeSeen('a');
    expect(hasSeenWelcome('a')).toBe(true);
    expect(hasSeenWelcome('b')).toBe(false);
    expect(hasSeenWelcome(null)).toBe(false);
    markWelcomeSeen(null);
    expect(localStorage.getItem('rd_welcome_seen_v1:guest')).toBe('1');
  });
});

describe('welcome conditions', () => {
  it('a fresh learner has no tests and no chosen goal', () => {
    expect(isFreshLearner({ hasTests: false, chosen: false })).toBe(true);
    expect(isFreshLearner({ hasTests: true, chosen: false })).toBe(false);
    expect(isFreshLearner({ hasTests: false, chosen: true })).toBe(false);
  });
  it('greets only fresh learners who have not seen it', () => {
    expect(shouldGreet({ hasTests: false, chosen: false, seen: false })).toBe(true);
    expect(shouldGreet({ hasTests: false, chosen: false, seen: true })).toBe(false);
    expect(shouldGreet({ hasTests: true, chosen: false, seen: false })).toBe(false);
    expect(shouldGreet({ hasTests: false, chosen: true, seen: false })).toBe(false);
  });
});
