import type { Journey } from './convert';

/** The thin "B2 · 785 → C1 · 945" bar of the phone converter. */
export interface BandBar {
  /** Left end label, e.g. "B2 · 785"; "Bắt đầu · 0" while below A1. */
  from: string;
  /** Right end label, e.g. "C1 · 945"; "990" at the top of what TOEIC maps. */
  to: string;
  /** Gold middle text: points to go, a skill hint, or the top-level message. */
  mid: string;
  /** Knob position 0..1. */
  ratio: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Where the total sits between the learner's CEFR band and the next one.
 * `journey` comes from buildJourney(cefr). When the total already passes the next
 * band's minimum but a skill misses its own threshold, the mid text says so
 * and the knob stops just short of the end.
 */
export function buildBandBar(total: number, journey: Journey, maxScore = 990): BandBar {
  const here = journey.current >= 0 ? journey.stations[journey.current] : null;
  const next = journey.next;
  const lo = here?.min ?? 0;
  const from = here ? `${here.cefr} · ${here.min}` : 'Bắt đầu · 0';

  if (!next || next.min === null) {
    return { from, to: String(maxScore), mid: 'cao nhất TOEIC đối chiếu', ratio: clamp01((total - lo) / Math.max(1, maxScore - lo)) };
  }
  const to = `${next.cefr} · ${next.min}`;
  const span = Math.max(1, next.min - lo);
  if (total >= next.min) {
    return { from, to, mid: 'cần đủ ngưỡng Nghe & Đọc', ratio: Math.min(0.96, clamp01((total - lo) / span)) };
  }
  return { from, to, mid: `còn ${next.min - total} điểm`, ratio: clamp01((total - lo) / span) };
}
