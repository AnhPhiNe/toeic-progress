import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
import {
  ADVICE_CACHE_MAX, adviceAction, adviceCacheKey, adviceFingerprint, adviceRequestBody, adviceSnapshot, classifyAdviceError,
  hasAdviceConsent, headline, isStale, nextMonthStart, parseReport, praiseLine, readAdvice, rememberAdviceConsent, saveAdvice,
  type AdviceReport
} from './attemptAdvice';

const test = (id: string, date: string, total: number, l: number, r: number, extra: Partial<StudySession> = {}): StudySession => ({
  id, skillType: 'LR', sessionType: 'FULL_TEST', testName: `ETS ${id}`, date, totalScore: total, scaledListening: l, scaledReading: r,
  createdAt: `${date}T10:00:00.000Z`, ...extra
} as StudySession);
const note = (id: string, sessionId: string, part: number, extra: Partial<MistakeEntry> = {}): MistakeEntry => ({
  id, sessionId, part, questionContext: '', userMistake: '', correctAnswer: '', trapTip: '', category: 'OTHER', tags: [],
  status: 'NEEDS_REVIEW', createdAt: '2026-11-11T10:00:00.000Z', ...extra
} as MistakeEntry);

const report = (evidenceIds: string[] = [], part: number | null = 7): AdviceReport => ({
  version: 2, model: 'gpt-6-luna', signature: 'a'.repeat(64),
  priorities: [{ title: 'Part 7 đang kéo điểm nhiều nhất', observation: 'Part 7 sai 16/54 câu, nhiều nhất đề này.',
    practice: 'Bấm giờ một đoạn kép, đọc câu hỏi trước.', part, evidenceIds, minutes: 20 }],
  parts: [{ part: 7, correct: 38, total: 54, wrong: 16 }], linkedNotes: 2, sampledNotes: 2
});

describe('praise line', () => {
  it('names the biggest gain over the previous full test', () => {
    const a = test('a', '2026-11-01', 700, 360, 340), b = test('b', '2026-11-11', 730, 365, 365);
    expect(praiseLine(b, [a, b])).toBe('Tổng tăng 30 so với đề trước');
    const c = test('c', '2026-11-11', 720, 350, 370);
    expect(praiseLine(c, [a, c])).toBe('Đọc tăng 30 so với đề trước');
  });
  it('falls back to the strongest Part by share when nothing rose', () => {
    const a = test('a', '2026-11-01', 800, 400, 400);
    const b = test('b', '2026-11-11', 760, 390, 370, { partScores: { part1: 3, part2: 15, part3: 25, part4: 20, part5: 27, part6: 10, part7: 40 } });
    expect(praiseLine(b, [a, b])).toBe('Part 5 đúng 27/30, chắc tay rồi');
  });
  it('is omitted with no previous test and no Part data, or when no Part is strong', () => {
    const only = test('a', '2026-11-01', 500, 250, 250);
    expect(praiseLine(only, [only])).toBeNull();
    const weak = test('w', '2026-11-01', 300, 150, 150, { partScores: { part1: 2, part2: 10, part3: 15, part4: 10, part5: 10, part6: 5, part7: 20 } });
    expect(praiseLine(weak, [weak])).toBeNull();
  });
});

describe('snapshot, fingerprint and stale', () => {
  const s = test('s', '2026-11-11', 700, 350, 350, { updatedAt: '2026-11-11T11:00:00.000Z' });
  const notes = [note('n2', 's', 5, { updatedAt: '2026-11-11T12:00:00.000Z' }), note('n1', 's', 7), note('x', 'other', 7), note('d', 's', 7, { deletedAt: '2026-11-11T13:00:00.000Z' })];

  it('sends only this attempt\'s live notes, blank drafts included, and no extra keys', () => {
    const snap = adviceSnapshot(s, notes);
    expect(snap).toEqual({ attemptId: 's', sessionVersion: '2026-11-11T11:00:00.000Z',
      noteVersions: { n1: '2026-11-11T10:00:00.000Z', n2: '2026-11-11T12:00:00.000Z' } });
    expect(Object.keys(adviceRequestBody(snap, 'rid')).sort()).toEqual(['attemptId', 'consent', 'noteVersions', 'provider', 'request_id', 'sessionVersion']);
    expect(adviceRequestBody(snap, 'rid')).toMatchObject({ consent: true, provider: 'openai' });
  });
  it('changes when the test or any note changes, not with note order', () => {
    const base = adviceFingerprint(adviceSnapshot(s, notes));
    expect(adviceFingerprint(adviceSnapshot(s, [...notes].reverse()))).toBe(base);
    expect(adviceFingerprint(adviceSnapshot({ ...s, updatedAt: '2026-11-12T00:00:00.000Z' }, notes))).not.toBe(base);
    expect(adviceFingerprint(adviceSnapshot(s, [...notes, note('n3', 's', 3)]))).not.toBe(base);
    const cached = { attemptId: 's', fingerprint: base, generatedAt: '2026-11-11T12:00:00.000Z', report: report() };
    expect(isStale(cached, adviceSnapshot(s, notes))).toBe(false);
    expect(isStale(cached, adviceSnapshot(s, notes.slice(1)))).toBe(true);
  });
});

describe('evidence validation', () => {
  const s = test('s', '2026-11-11', 700, 350, 350);
  it('keeps a report whose evidence is this attempt\'s notes and drops one that points elsewhere', () => {
    const notes = [note('n1', 's', 7), note('x', 'other', 7)];
    expect(parseReport(report(['n1']), s, notes)).not.toBeNull();
    expect(parseReport(report(['x']), s, notes)).toBeNull();
    expect(parseReport({ ...report(), version: 1 }, s, notes)).toBeNull();
    expect(parseReport({ ...report(), extra: 1 }, s, notes)).toBeNull();
  });
});

describe('cache', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear() });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the newest 8 attempts per owner under the v2 key', () => {
    for (let i = 0; i < 10; i++) saveAdvice('alice', { attemptId: `t${i}`, fingerprint: 'f', generatedAt: '2026-11-11T00:00:00.000Z', report: report() });
    const rows = JSON.parse(localStorage.getItem(adviceCacheKey('alice'))!);
    expect(adviceCacheKey('alice')).toBe('toeic_attempt_advice_alice_v2');
    expect(rows).toHaveLength(ADVICE_CACHE_MAX);
    expect(rows[0].attemptId).toBe('t9');
    expect(readAdvice('alice', test('t9', '2026-11-11', 1, 1, 1))?.report.priorities[0].minutes).toBe(20);
    expect(readAdvice('alice', test('t0', '2026-11-11', 1, 1, 1))).toBeNull();
    expect(readAdvice('bob', test('t9', '2026-11-11', 1, 1, 1))).toBeNull();
  });
  it('survives broken storage and remembers consent per owner', () => {
    localStorage.setItem(adviceCacheKey('alice'), '{not json');
    expect(readAdvice('alice', test('t', '2026-11-11', 1, 1, 1))).toBeNull();
    expect(saveAdvice('alice', { attemptId: 't', fingerprint: 'f', generatedAt: 'x', report: report() })).toBe(true);
    expect(hasAdviceConsent('alice')).toBe(false);
    rememberAdviceConsent('alice');
    expect(hasAdviceConsent('alice')).toBe(true);
    expect(hasAdviceConsent('bob')).toBe(false);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(saveAdvice('alice', { attemptId: 't', fingerprint: 'f', generatedAt: 'x', report: report() })).toBe(false);
    expect(readAdvice('alice', test('t', '2026-11-11', 1, 1, 1))).toBeNull();
    expect(hasAdviceConsent('alice')).toBe(false);
  });
});

describe('actions, headline and errors', () => {
  const s = test('s', '2026-11-11', 700, 350, 350);
  it('turns Part 5–7 into a timer and other Parts into Sổ tay', () => {
    expect(adviceAction(report()[`priorities`][0], s, [])).toMatchObject({ kind: 'timer', part: 7, label: 'Bấm giờ Part 7', minutes: 20 });
    const p3 = { ...report().priorities[0], part: 3 };
    expect(adviceAction(p3, s, [note('a', 's', 3), note('b', 's', 3), note('c', 's', 7)]).label).toBe('Ôn 2 câu trong Sổ tay');
    expect(adviceAction(p3, s, []).label).toBe('Ôn câu sai Part 3 trong Sổ tay');
    expect(headline(report().priorities[0])).toBe('Part 7 đang kéo điểm nhiều nhất.');
  });
  it('tells a used turn from one refused before the quota', () => {
    expect(classifyAdviceError({ status: 409, code: 'ANALYSIS_WAIT_SYNC', message: 'm' })).toEqual({ kind: 'refused', message: 'm', kept: true });
    expect(classifyAdviceError({ status: 422, message: 'm' })).toMatchObject({ kind: 'refused', kept: true });
    expect(classifyAdviceError({ status: 504, code: 'ANALYSIS_PROVIDER_TIMEOUT', message: 'm' }).kind).toBe('failed');
    expect(classifyAdviceError({ status: 502, code: 'ANALYSIS_INVALID_OUTPUT', message: 'm' }).kind).toBe('failed');
    expect(classifyAdviceError({ status: 429, code: 'ANALYSIS_PROVIDER_RATE', message: 'm' }).kind).toBe('failed');
    expect(classifyAdviceError({ status: 429, message: 'hết lượt' }).kind).toBe('quota');
    expect(classifyAdviceError({ status: 429, retryAfter: 30, message: 'nhanh' })).toMatchObject({ kind: 'refused', kept: true });
    expect(classifyAdviceError({ status: 403, code: 'AI_LOGIN_REQUIRED', message: 'x' }).kind).toBe('guest');
    expect(classifyAdviceError({ status: 403, message: 'Tài khoản đang chờ được duyệt' })).toEqual({ kind: 'access', message: 'Tài khoản đang chờ được duyệt' });
    expect(classifyAdviceError(new Error('Chưa kết nối'))).toMatchObject({ kind: 'refused', kept: false });
    expect(nextMonthStart('2026-11-17')).toBe('1/12');
    expect(nextMonthStart('2026-12-02')).toBe('1/1');
  });
});
