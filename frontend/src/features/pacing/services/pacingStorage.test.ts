import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { emptyBundle, readDataBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { createBackupSnapshot, resetToCleanSlate, updateStudySessions } from '@/shared/data/storage';
import { parseBackup } from '@/shared/data/backup';
import { finishTimer, freshTimer, startTimer } from '@/features/pacing/lib/pacingModel';
import { associatedStudyId, linkedStudyVersion, persistTimer, readTimer, removePacingResult, savePacingResult, timerKey, updatePacingResult } from './pacingStorage';
import type { PacingMode } from '@/features/pacing/lib/pacingModel';

const values = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
beforeEach(() => {
  values.clear(); setItem.mockClear(); setItem.mockImplementation((key, value) => { values.set(key, value); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem, removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('navigator', { onLine: true });
  writeDataBundle(emptyBundle()); setItem.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
const result = (mode: 'PART_5' | 'POMODORO' | 'FULL_READING' = 'PART_5') => {
  const now = Date.now(); return finishTimer(startTimer(freshTimer(null, mode), now - 6500), now);
};

describe('atomic pacing result storage', () => {
  it('saves actual time and paired study in one write, leaves ungraded answers absent and de-duplicates retry', () => {
    const timer = { ...result(), name: '  ETS 2024   Test 04  ' };
    savePacingResult(timer);
    expect(setItem).toHaveBeenCalledTimes(1);
    const bundle = readDataBundle();
    expect(bundle.pacingRuns[0]).toMatchObject({ id: timer.id, testName: 'ETS 2024 Test 04', actualSeconds: 6.5, actualMinutes: 6.5 / 60, finishedNaturally: false });
    expect(bundle.pacingRuns[0]).not.toHaveProperty('correctAnswers');
    expect(bundle.pacingRuns[0]).not.toHaveProperty('accuracyPercent');
    expect(bundle.sessions[0]).toMatchObject({ id: timer.id, testName: 'ETS 2024 Test 04', durationMinutes: 6.5 / 60, sessionType: 'PART_PRACTICE' });
    expect(bundle.sessions[0]).not.toHaveProperty('practiceParts');
    savePacingResult(timer);
    expect(readDataBundle().sessions).toHaveLength(1);
    expect(readDataBundle().pacingRuns).toHaveLength(1);
    expect(parseBackup(JSON.stringify(createBackupSnapshot())).ok).toBe(true);
  });
  it('adds grading later atomically, supports zero correct and removes both paired entries on delete', () => {
    const timer = result(); savePacingResult(timer);
    const original = readDataBundle().pacingRuns[0];
    updatePacingResult(original, null, 'ETS Test 1', '0', linkedStudyVersion(original));
    const updated = readDataBundle();
    expect(updated.pacingRuns[0]).toMatchObject({ correctAnswers: 0, accuracyPercent: 0 });
    expect(updated.sessions[0].practiceParts).toEqual([{ part: 5, correct: 0, total: 30 }]);
    expect(() => updatePacingResult(original, null, 'Stale', '20', linkedStudyVersion(original))).toThrow('nơi khác');
    removePacingResult(timer.id, null);
    expect(readDataBundle().pacingRuns[0].deletedAt).toBeTruthy();
    expect(readDataBundle().sessions[0].deletedAt).toBeTruthy();
    expect(() => savePacingResult(timer)).toThrow('đã bị xóa');
  });
  it('keeps both collections unchanged when the commit fails or the owner changes', () => {
    const before = values.get('toeic_progress_bundle_v3');
    setItem.mockImplementation((key, value) => { if (key === 'toeic_progress_bundle_v3') throw new Error('quota'); values.set(key, value); });
    expect(() => savePacingResult(result())).toThrow('quota');
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
    values.set('toeic_active_account_v1', 'other');
    expect(() => savePacingResult(result())).toThrow('Tài khoản');
    expect(values.has('toeic_progress_account_other_v3')).toBe(false);
  });
  it('does not overwrite a paired study edited elsewhere and removing it from main history removes the measured run too', () => {
    const timer = result(); savePacingResult(timer);
    const run = readDataBundle().pacingRuns[0], expected = linkedStudyVersion(run);
    updateStudySessions(sessions => sessions.map(session => ({ ...session, testName: 'Edited elsewhere' })));
    expect(() => updatePacingResult(run, null, 'Overwrite', '20', expected)).toThrow('Buổi học liên quan');
    expect(readDataBundle().sessions[0].testName).toBe('Edited elsewhere');
    updateStudySessions(() => []);
    expect(readDataBundle().pacingRuns[0].deletedAt).toBeTruthy();
  });
  it('does not count Pomodoro breaks as study or invent full work time for an early finish', () => {
    const early = result('POMODORO'); savePacingResult(early);
    expect(readDataBundle().sessions[0].durationMinutes).toBeCloseTo(6.5 / 60);
    expect(readDataBundle().pacingRuns[0].finishedNaturally).toBe(false);
    const run = readDataBundle().pacingRuns[0];
    updatePacingResult(run, null, 'Ôn từ vựng', '', linkedStudyVersion(run));
    expect(readDataBundle().sessions[0].testName).toBe('Ôn từ vựng');
    expect(readDataBundle().sessions[0].notes).toContain('Kết thúc sớm');
    expect(readDataBundle().pacingRuns[0]).not.toHaveProperty('accuracyPercent');
    const now = Date.now(), rest = finishTimer(startTimer(freshTimer(null, 'POMODORO', undefined, 'SHORT_BREAK'), now - 4000), now);
    savePacingResult(rest);
    expect(readDataBundle().pacingRuns).toHaveLength(2);
    expect(readDataBundle().sessions).toHaveLength(1);
  });
  it('Mẻ tự do keeps the Pomodoro records: a focus run with its study session, breaks as runs only', () => {
    const now = Date.now();
    const focus = finishTimer(startTimer(freshTimer(null, 'POMODORO', { workMinutes: 1, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 }), now - 60000), now);
    savePacingResult(focus);
    expect(readDataBundle().pacingRuns[0]).toMatchObject({ id: focus.id, partType: 'POMODORO', presetId: 'POMODORO_WORK', presetName: 'Pomodoro', plannedMinutes: 1, actualSeconds: 60, finishedNaturally: true });
    expect(readDataBundle().pacingRuns[0]).not.toHaveProperty('totalQuestions');
    expect(readDataBundle().sessions[0]).toMatchObject({ id: focus.id, sessionType: 'PART_PRACTICE', testName: 'Pomodoro: tập trung', durationMinutes: 1 });
    for (const phase of ['SHORT_BREAK', 'LONG_BREAK'] as const) {
      const rest = finishTimer(startTimer(freshTimer(null, 'POMODORO', undefined, phase), now - 3000), now);
      savePacingResult(rest);
      expect(readDataBundle().pacingRuns[0]).toMatchObject({ partType: 'POMODORO', presetId: `POMODORO_${phase}`, presetName: phase === 'SHORT_BREAK' ? 'Nghỉ ngắn' : 'Nghỉ dài' });
    }
    expect(readDataBundle().sessions).toHaveLength(1);
  });
  it('Reading practice with a total score is still Part practice, with no invented per-Part breakdown', () => {
    savePacingResult({ ...result('FULL_READING'), correct: '80' });
    expect(readDataBundle().sessions[0].sessionType).toBe('PART_PRACTICE');
    expect(readDataBundle().sessions[0]).not.toHaveProperty('totalScore');
    expect(readDataBundle().sessions[0]).not.toHaveProperty('practiceParts');
  });
  it('keeps a larger custom drill aggregate without emitting an invalid TOEIC Part breakdown', () => {
    const timer = { ...result(), questions: 60, correct: '50' };
    savePacingResult(timer);
    const run = readDataBundle().pacingRuns[0];
    expect(run).toMatchObject({ totalQuestions: 60, correctAnswers: 50 });
    expect(readDataBundle().sessions[0]).not.toHaveProperty('practiceParts');
    updatePacingResult(run, null, 'Custom Part 5', '0', linkedStudyVersion(run));
    expect(readDataBundle().pacingRuns[0]).toMatchObject({ totalQuestions: 60, correctAnswers: 0 });
    expect(readDataBundle().sessions[0]).not.toHaveProperty('practiceParts');
    expect(parseBackup(JSON.stringify(createBackupSnapshot())).ok).toBe(true);
  });
  it('rejects fractional or out-of-range grades without clamping them into valid results', () => {
    for (const correct of ['2.5', '-1', '31', 'NaN']) expect(() => savePacingResult({ ...result(), correct })).toThrow('Số câu đúng');
    expect(readDataBundle().sessions).toEqual([]);
  });
  it('matches a legacy generated pair only when the identity, source and timing agree uniquely', () => {
    const timer = result(); savePacingResult(timer);
    const stamp = Date.parse(readDataBundle().pacingRuns[0].createdAt);
    const run = { ...readDataBundle().pacingRuns[0], id: `pacing-${stamp}`, testName: 'ETS Test 1' };
    const session = { ...readDataBundle().sessions[0], id: `session-pacing-${stamp + 1}`, testName: '[Tốc độ] ETS Test 1' };
    expect(associatedStudyId(run, [session])).toBe(session.id);
    expect(associatedStudyId(run, [session, { ...session, id: `session-pacing-${stamp + 2}` }])).toBeUndefined();
    expect(associatedStudyId(run, [{ ...session, testName: 'Different source' }])).toBeUndefined();
    expect(associatedStudyId(run, [{ ...session, durationMinutes: 100 }])).toBeUndefined();
  });
  it('reset clears the private draft; account-specific draft reads never return a different owner', () => {
    const timer = result(); persistTimer(timer);
    expect(readTimer(null)?.id).toBe(timer.id);
    expect(readTimer('account')).toBeNull();
    resetToCleanSlate();
    expect(values.has(timerKey(null))).toBe(false);
  });
  it.each([['PART_7_SINGLE', 'Part 7A'], ['PART_7_MULTI', 'Part 7B'], ['PART_7', 'Part 7']] as const)(
    'keeps anonymous legacy %s paired through grading, renaming and deletion', (mode: PacingMode, legacyName: string) => {
      const now = Date.now(), timer = finishTimer(startTimer(freshTimer(null, mode), now - 6500), now);
      savePacingResult(timer);
      const bundle = readDataBundle(), stamp = Date.parse(bundle.pacingRuns[0].createdAt);
      const run = { ...bundle.pacingRuns[0], id: `pacing-${stamp}`, testName: undefined };
      const session = { ...bundle.sessions[0], id: `session-pacing-${stamp + 1}`, testName: `[Luyện tốc độ] ${legacyName}` };
      writeDataBundle({ ...bundle, pacingRuns: [run], sessions: [session] });
      expect(associatedStudyId(run, [session])).toBe(session.id);
      expect(associatedStudyId(run, [{ ...session, testName: 'Unrelated' }])).toBeUndefined();
      updatePacingResult(run, null, '', '0', linkedStudyVersion(run));
      const graded = readDataBundle().pacingRuns[0];
      expect(readDataBundle().sessions[0].practiceParts).toEqual([{ part: 7, correct: 0, total: timer.questions }]);
      expect(associatedStudyId(graded, readDataBundle().sessions)).toBe(session.id);
      updatePacingResult(graded, null, 'Renamed legacy source', '1', linkedStudyVersion(graded));
      const renamed = readDataBundle().pacingRuns[0];
      expect(readDataBundle().sessions[0].testName).toBe('Renamed legacy source');
      expect(associatedStudyId(renamed, readDataBundle().sessions)).toBe(session.id);
      removePacingResult(run.id, null);
      expect(readDataBundle().pacingRuns[0].deletedAt).toBeTruthy();
      expect(readDataBundle().sessions[0].deletedAt).toBeTruthy();
    });
});
