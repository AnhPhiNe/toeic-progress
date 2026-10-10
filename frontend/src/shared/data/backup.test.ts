import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackup } from '@/shared/data/backup';
import { defaultProfile, readDataBundle, writeDataBundle, type DataBundle } from '@/shared/data/dataBundle';
import { restoreBackup } from '@/shared/data/storage';

const values = new Map<string, string>();
let failWrite = false;
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) {
    if (failWrite) throw new Error('quota exceeded');
    values.set(key, value);
  },
  removeItem(key: string) { values.delete(key); }
};

function bundle(): DataBundle {
  const now = '2026-09-23T00:00:00.000Z';
  return {
    schemaVersion: 3,
    profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
    sessions: [], mistakes: [],
    pacingRuns: [{
      id: 'p1', presetId: 'FULL_TEST', presetName: 'Full Test', date: '2026-09-23',
      plannedMinutes: 120, actualMinutes: 120, finishedNaturally: true, phases: [],
      createdAt: now, updatedAt: now, deletedAt: null
    }],
    checklist: [{ id: 'id_original', checked: true, updatedAt: now, deletedAt: null }],
    vocabLog: [], shieldDays: [], weeklyPlans: []
  };
}

beforeEach(() => {
  values.clear();
  failWrite = false;
  vi.stubGlobal('localStorage', fakeStorage);
});
afterEach(() => vi.unstubAllGlobals());

describe('backup restore', () => {
  it('round-trips an actual review and preserves learner fields through legacy date normalization', async () => {
    const { gradeReview } = await import('@/features/mistakes/lib/review');
    const { recordsFromBundle, bundleFromRecords } = await import('@/features/account/services/cloud');
    const now = new Date().toISOString();
    const data = bundle();
    data.mistakes = [{ id: 'reviewed', part: 5, questionContext: 'Reports ____ submitted.', userMistake: 'Bỏ trống',
      userChoiceState: 'BLANK', userReason: 'Không kịp đọc\nTôi chưa biết đáp án.', correctAnswer: '(B) be',
      sourceTestName: 'ETS 2024 Test 03',
      answerSource: 'AI_PROPOSED', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: now, updatedAt: now, deletedAt: null }];
    data.mistakes[0] = { ...data.mistakes[0], ...gradeReview(data.mistakes[0], false) };
    let result = parseBackup(JSON.stringify({ ...data, exportDate: now }));
    expect(result.ok).toBe(true);
    const cloud = bundleFromRecords(recordsFromBundle(data));
    expect(cloud.mistakes[0]).toMatchObject({ userChoiceState: 'BLANK', userReason: data.mistakes[0].userReason, sourceTestName: 'ETS 2024 Test 03' });
    data.mistakes[0].lastReviewedAt = '2026-10-07';
    result = parseBackup(JSON.stringify({ ...data, exportDate: now }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.corrections.some(message => message.includes('lastReviewedAt'))).toBe(true);
    restoreBackup(result.preview);
    expect(readDataBundle().mistakes[0].lastReviewedAt).toBe('2026-10-07T00:00:00.000Z');
    expect(readDataBundle().mistakes[0].userReason).toBe(data.mistakes[0].userReason);
    expect(readDataBundle().mistakes[0].sourceTestName).toBe('ETS 2024 Test 03');
  });
  it('retains AI answer provenance when exporting/importing a saved note', () => {
    const data = bundle();
    data.mistakes.push({
      id: 'ai-note', part: 5, category: 'ADVANCED_GRAMMAR', status: 'NEEDS_REVIEW',
      questionContext: 'Reports ____ submitted.', userMistake: '(A) are', correctAnswer: '(B) be',
      answerSource: 'AI_PROPOSED', trapTip: 'Dịch ngữ cảnh: Báo cáo được nộp.\n\nMẹo 10s: be + V3.',
      options: ['(A) are', '(B) be'], tags: ['grammar'], createdAt: '2026-10-07T00:00:00Z',
      updatedAt: '2026-10-07T00:00:00Z', deletedAt: null,
    });
    const result = parseBackup(JSON.stringify({ ...data, exportDate: '2026-10-07T00:00:00Z' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    restoreBackup(result.preview);
    expect(readDataBundle().mistakes[0].answerSource).toBe('AI_PROPOSED');
    expect(readDataBundle().mistakes[0].correctAnswer).toBe('(B) be');
  });
  it('preserves categories absent from a v1 backup', () => {
    writeDataBundle(bundle());
    const result = parseBackup(JSON.stringify({ profile: defaultProfile(), sessions: [], mistakes: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.preserved).toContain('Lượt Phòng Thi');
    restoreBackup(result.preview);
    expect(readDataBundle().pacingRuns).toHaveLength(1);
    expect(readDataBundle().checklist).toHaveLength(1);
  });

  it('rejects the whole file and identifies invalid record positions', () => {
    const input = { profile: defaultProfile(), sessions: [], mistakes: [{ id: 'm1', part: 9 }] };
    const result = parseBackup(JSON.stringify(input));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeLessThanOrEqual(10);
    expect(result.errors.some(error => error.includes('mistakes.0.part'))).toBe(true);
    expect(values.size).toBe(0);
  });

  it('rejects a backup from a newer app version', () => {
    const result = parseBackup(JSON.stringify({ schemaVersion: 4 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('cập nhật ứng dụng');
  });

  it('only normalizes an unknown mistake category and absent optional fields', () => {
    const input = {
      profile: defaultProfile(), sessions: [],
      mistakes: [{
        id: 'm1', part: 5, questionContext: 'Câu 101', userMistake: 'A',
        correctAnswer: 'B', category: 'NEW_CATEGORY', status: 'NEEDS_REVIEW',
        createdAt: '2026-09-23T00:00:00.000Z'
      }]
    };
    const result = parseBackup(JSON.stringify(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.data.mistakes[0].category).toBe('OTHER');
    expect(result.preview.corrections.some(item => item.includes('nhóm lỗi không rõ'))).toBe(true);
    expect(result.preview.corrections.some(item => item.includes('.tags'))).toBe(true);
  });

  it('keeps the previous bundle if the single commit write fails', () => {
    const original = bundle();
    writeDataBundle(original);
    failWrite = true;
    expect(() => writeDataBundle({ ...original, sessions: [] })).toThrow();
    failWrite = false;
    expect(readDataBundle()).toEqual(original);
  });
  it('stamps a restore as a new edit and retains omitted records as tombstones', () => {
    const current = bundle();
    current.vocabLog = [{ id: 'v1', date: '2026-09-23', count: 3, updatedAt: current.profile.updatedAt, deletedAt: null }];
    writeDataBundle(current);
    const saved = { ...bundle(), exportDate: current.profile.updatedAt };
    const parsed = parseBackup(JSON.stringify(saved));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackup(parsed.preview);
    const restored = readDataBundle();
    expect(restored.vocabLog[0].deletedAt).toBeTruthy();
    expect(Date.parse(restored.profile.updatedAt)).toBeGreaterThan(Date.parse(current.profile.updatedAt));
  });
  it('rejects impossible calendar dates before restore', () => {
    const input = { ...bundle(), exportDate: bundle().profile.updatedAt };
    input.pacingRuns[0].date = '2026-02-30';
    expect(parseBackup(JSON.stringify(input)).ok).toBe(false);
  });

  it('round-trips score provenance, manual overrides and total-only scores', () => {
    const base = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'Score', date: '2026-10-06', durationMinutes: 120, createdAt: bundle().profile.updatedAt };
    const sessions = [
      { ...base, scoreSource: 'MANUAL_TOTAL', totalScore: 800 },
      { ...base, id: 's2', scoreSource: 'MANUAL_SECTIONS', scaledListening: 445, scaledReading: 350, totalScore: 795 },
      { ...base, id: 's3', totalScore: 801 },
      { ...base, id: 's4', scoreSource: 'ESTIMATED', rawListening: 100, rawReading: 100,
        scaledListening: 495, scaledReading: 495, totalScore: 990, scoreConversionVersion: 'iibc-mock-2023-perfect-v2',
        partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 30, part6: 16, part7: 54 } }
    ];
    const parsed = parseBackup(JSON.stringify({ profile: defaultProfile(), sessions, mistakes: [] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.data.sessions).toMatchObject(sessions);
    restoreBackup(parsed.preview);
    expect(readDataBundle().sessions).toMatchObject(sessions);
    expect(readDataBundle().sessions[0]).not.toHaveProperty('scaledListening');
    expect(readDataBundle().sessions[0]).not.toHaveProperty('partScores');
  });

  it.each([
    { scoreSource: 'MANUAL_TOTAL', totalScore: 800, scaledListening: 400 },
    { scoreSource: 'MANUAL_TOTAL', totalScore: 801 },
    { scoreSource: 'MANUAL_SECTIONS', scaledListening: 445, scaledReading: 350, totalScore: 855 }
  ])('rejects inconsistent new scores in a backup', scores => {
    const record = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'Score', date: '2026-10-06', durationMinutes: 120, createdAt: bundle().profile.updatedAt, ...scores };
    expect(parseBackup(JSON.stringify({ profile: defaultProfile(), sessions: [record], mistakes: [] })).ok).toBe(false);
  });
});
