const MUTE_KEY = 'toeic_sound_muted_v1';

export type ChimeKind = 'correct' | 'wrong' | 'complete' | 'levelup';

let sharedCtx: AudioContext | null = null;

export function isSoundMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctor();
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

const NOTES: Record<ChimeKind, { freqs: number[]; step: number; dur: number; type: OscillatorType }> = {
  correct: { freqs: [523.25, 659.25], step: 0.07, dur: 0.14, type: 'sine' },
  wrong: { freqs: [246.94], step: 0, dur: 0.14, type: 'triangle' },
  complete: { freqs: [523.25, 659.25, 783.99], step: 0.08, dur: 0.18, type: 'sine' },
  levelup: { freqs: [523.25, 659.25, 783.99, 1046.5], step: 0.075, dur: 0.22, type: 'sine' },
};

/** Play a soft, non-intrusive Web Audio chime if enabled and supported. */
export function playChime(kind: ChimeKind): void {
  if (isSoundMuted() || reducedMotion()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const spec = NOTES[kind];
    const now = ctx.currentTime;
    spec.freqs.forEach((freq, i) => {
      const start = now + i * spec.step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + spec.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + spec.dur + 0.02);
    });
  } catch {
    /* Web Audio may be blocked before user gesture */
  }
}

export function _resetSoundContextForTest(): void {
  sharedCtx = null;
}
