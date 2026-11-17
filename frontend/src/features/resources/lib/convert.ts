import { CONCORDANCE_TIERS } from '@/shared/domain/etsScoring';
import type { StudySession } from '@/shared/types';

/** How the learner types a skill: how many answers were right, or how many were wrong. */
export type InputMode = 'correct' | 'wrong';

export const MAX_COUNT = 100;

/** A whole number from 0 to 100; anything else becomes 0. */
export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_COUNT, Math.trunc(value)));
}

/** The number the learner sees for a skill that has `correct` right answers. */
export function toShownCount(correct: number, mode: InputMode): number {
  return mode === 'correct' ? correct : MAX_COUNT - correct;
}

/** The right-answer count behind a number typed in the given mode. */
export function fromShownCount(shown: number, mode: InputMode): number {
  const value = clampCount(shown);
  return mode === 'correct' ? value : MAX_COUNT - value;
}

/** A finished full test that carries both raw counts, ready to fill the converter. */
export interface ConvertTest { id: string; name: string; date: string; dateLabel: string; listening: number; reading: number }

const validCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COUNT;

/** "2026-11-11" -> "11/11". */
export function shortDate(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[2]}/${match[1]}` : iso;
}

/** Full tests with usable raw counts, newest first (ties broken by when they were saved). */
export function convertTests(sessions: readonly StudySession[] | undefined): ConvertTest[] {
  return (sessions ?? [])
    .filter(s => s.sessionType === 'FULL_TEST' && !s.deletedAt && validCount(s.rawListening) && validCount(s.rawReading))
    .sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return diff !== 0 ? diff : (b.createdAt || '').localeCompare(a.createdAt || '');
    })
    .map(s => ({ id: s.id, name: s.testName, date: s.date, dateLabel: shortDate(s.date), listening: s.rawListening as number, reading: s.rawReading as number }));
}

const pad4 = (n: number) => String(Math.max(0, Math.min(9999, Math.round(n)))).padStart(4, '0');

/** Passport-style machine-readable line, decoration only: P<TOEIC<<SOC<<0405<0495<<0900<<B2<<<<... */
export function mrzLine(listening: number, reading: number, total: number, cefr: string | null, width = 44): string {
  const level = cefr && /^[A-C][1-2]$/.test(cefr) ? cefr : 'XX';
  const line = `P<TOEIC<<SOC<<${pad4(listening)}<${pad4(reading)}<<${pad4(total)}<<${level}`;
  return line.length >= width ? line.slice(0, width) : line + '<'.repeat(width - line.length);
}

export type StationState = 'past' | 'now' | 'next' | 'off';
export interface Station {
  cefr: string;
  /** "Trung cấp trên" without the English gloss. */
  name: string;
  /** Lowest TOEIC total for the level; null when TOEIC does not map to it (C2). */
  min: number | null;
  state: StationState;
}
export interface Journey {
  stations: Station[];
  /** Index of the learner's station; -1 while below A1. */
  current: number;
  /** The next station TOEIC can reach, if any. */
  next: Station | null;
}

export function shortLevelName(full: string): string {
  return full.replace(/\s*\(.*\)\s*$/, '').trim();
}

/** The six CEFR stations with where the learner stands; `cefr` is the level the scores earn (null below A1). */
export function buildJourney(cefr: string | null): Journey {
  const current = cefr ? CONCORDANCE_TIERS.findIndex(tier => tier.cefr === cefr) : -1;
  const stations: Station[] = CONCORDANCE_TIERS.map((tier, index) => {
    const min = parseInt(tier.toeicRange, 10);
    const reachable = Number.isFinite(min);
    const state: StationState = index < current ? 'past' : index === current ? 'now' : index === current + 1 && reachable ? 'next' : 'off';
    return { cefr: tier.cefr, name: shortLevelName(tier.cefrLevelName), min: reachable ? min : null, state };
  });
  return { stations, current, next: stations.find(s => s.state === 'next') ?? null };
}
