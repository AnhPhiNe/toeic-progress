import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetSoundContextForTest, isSoundMuted, playChime, setSoundMuted } from './sound';

describe('sound chimes', () => {
  const store = new Map<string, string>();
  const mockGain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  const mockOsc = { type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const mockCtx = {
    state: 'running',
    currentTime: 0,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => ({ ...mockOsc })),
    createGain: vi.fn(() => ({ ...mockGain, gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
    destination: {},
  };

  beforeEach(() => {
    store.clear();
    _resetSoundContextForTest();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function () { return mockCtx; }),
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists mute preference in localStorage', () => {
    expect(isSoundMuted()).toBe(false);
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it('does not schedule oscillators when muted or reduced-motion is on', () => {
    setSoundMuted(true);
    playChime('correct');
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    setSoundMuted(false);
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function () { return mockCtx; }),
      matchMedia: () => ({ matches: true }),
    });
    playChime('complete');
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });

  it('plays ascending chime notes when enabled and AudioContext exists', () => {
    playChime('complete');
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('handles missing AudioContext safely', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(() => playChime('levelup')).not.toThrow();
  });
});
