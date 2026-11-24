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
    vocabLog: [], shieldDays: [{ id: 'shield:2026-09-22', date: '2026-09-22', updatedAt: now, deletedAt: null }]
  };
}

beforeEach(() => {
  values.clear();
  failWrite = false;
  vi.stubGlobal('localStorage', fakeStorage);
});
afterEach(() => vi.unstubAllGlobals());

describe('backup restore', () => {
  it('preserves confirmed exact timing and unknown scopes through backup and refuses malformed timing', () => {
    const data = bundle(); const stamp = data.profile.updatedAt;
    const timing = { source: 'IMAGE_CONFIRMED' as const, totalSeconds: 6763, listeningSeconds: null, readingSeconds: null,
      parts: { part1: null, part2: null, part3: null, part4: null, part5: 795, part6: null, part7: null } };
    data.sessions = [{ id: 'timed', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'QA timing', date: '2026-09-23', durationMinutes: 112.72,
      resultTiming: timing, createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    const parsed = parseBackup(JSON.stringify({ ...data, exportDate: stamp }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) { restoreBackup(parsed.preview); expect(readDataBundle().sessions[0].resultTiming).toEqual(timing); }
    for (const invalid of [{ ...timing, totalSeconds: '6763' }, { ...timing, totalSeconds: 6763.5 }, { ...timing, source: 'AI_GUESSED' }]) {
      expect(parseBackup(JSON.stringify({ ...data, sessions: [{ ...data.sessions[0], resultTiming: invalid }], exportDate: stamp })).ok).toBe(false);
    }
    expect(parseBackup(JSON.stringify({ ...data, sessions: [{ ...data.sessions[0], sessionType: 'PART_PRACTICE' }], exportDate: stamp })).ok).toBe(false);
  });
  it('keeps Sóc\'s coat and name through backup restore and cloud conversion', async () => {
    const { recordsFromBundle, bundleFromRecords } = await import('@/features/account/services/cloud');
    const data = bundle(); const stamp = data.profile.updatedAt;
    data.profile = { ...data.profile, socCoat: 'soco', socName: 'Bắp Rang' };
    const parsed = parseBackup(JSON.stringify({ ...data, exportDate: stamp }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) { restoreBackup(parsed.preview); expect(readDataBundle().profile).toMatchObject({ socCoat: 'soco', socName: 'Bắp Rang' }); }
    expect(bundleFromRecords(recordsFromBundle(data)).profile).toMatchObject({ socCoat: 'soco', socName: 'Bắp Rang' });
    // A coat this version does not know still restores (it is drawn as Nâu cam).
    expect(parseBackup(JSON.stringify({ ...data, profile: { ...data.profile, socCoat: 'cau-vong' }, exportDate: stamp })).ok).toBe(true);
    expect(parseBackup(JSON.stringify({ ...data, profile: { ...data.profile, socCoat: 7 }, exportDate: stamp })).ok).toBe(false);
  });
  it('keeps private image references through export/restore and cloud conversion without image bytes or URLs', async () => {
    const { recordsFromBundle, bundleFromRecords } = await import('@/features/account/services/cloud');
    const data = bundle(); const stamp = data.profile.updatedAt;
    data.mistakes = [{ id: 'image-note', part: 7, questionContext: 'What is the delivery time?', question: 'What is the delivery time?', context: '',
      sourceImageIds: ['a'.repeat(64), 'b'.repeat(64)], userMistake: '', correctAnswer: '(B) Three days.',
      category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    const text = JSON.stringify({ ...data, exportDate: stamp });
    expect(text).not.toContain('data:image'); expect(text).not.toContain('token=');
    const parsed = parseBackup(text); expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackup(parsed.preview);
    expect(readDataBundle().mistakes[0].sourceImageIds).toEqual(data.mistakes[0].sourceImageIds);
    expect(bundleFromRecords(recordsFromBundle(data)).mistakes[0].sourceImageIds).toEqual(data.mistakes[0].sourceImageIds);
    data.mistakes[0].sourceImageIds = ['https://other.example/image.jpg'];
    expect(parseBackup(JSON.stringify({ ...data, exportDate: stamp })).ok).toBe(false);
  });
  it.each([
    [{ part: 5, correct: 1.5, total: 30 }], [{ part: 5, correct: 0, total: 0 }],
    [{ part: 5, correct: 31, total: 30 }], [{ part: 6, correct: 1, total: 17 }],
    [{ part: 5, correct: 1, total: 30 }, { part: 5, correct: 2, total: 30 }]
  ].map(parts => ({ parts })))('rejects practice counts that would fail account sync: %j', ({ parts }) => {
    const data = bundle();
    const record = { id: 'practice', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Practice',
      date: '2026-09-23', durationMinutes: 1, createdAt: data.profile.updatedAt, practiceParts: parts };
    expect(parseBackup(JSON.stringify({ profile: defaultProfile(), sessions: [record], mistakes: [] })).ok).toBe(false);
    expect(values.size).toBe(0);
  });

  it.each([
    { totalQuestions: 30, correctAnswers: 31 }, { correctAnswers: 1 }, { totalQuestions: 0 },
    { totalQuestions: 101 }, { totalQuestions: 1.5 }, { totalQuestions: 30, correctAnswers: 1.5 },
    { actualSeconds: -2 }, { actualSeconds: '60' }, { actualSeconds: null }, { partType: 'INVALID' },
    { accuracyPercent: 101 }, { speedSecPerQuestion: -1 }
  ])('rejects malformed pacing fields before restore: %j', fields => {
    const data = bundle();
    const pacingRuns = [{ ...data.pacingRuns[0], ...fields }];
    expect(parseBackup(JSON.stringify({ ...data, pacingRuns, exportDate: data.profile.updatedAt })).ok).toBe(false);
    expect(values.size).toBe(0);
  });

  it('retains legacy runs without new fields and custom question counts', () => {
    const data = bundle();
    data.pacingRuns.push({ ...data.pacingRuns[0], id: 'custom', partType: 'CUSTOM', totalQuestions: 60,
      correctAnswers: 0, actualSeconds: 60, accuracyPercent: 0 });
    const parsed = parseBackup(JSON.stringify({ ...data, exportDate: data.profile.updatedAt }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    restoreBackup(parsed.preview);
    expect(readDataBundle().pacingRuns[0]).not.toHaveProperty('totalQuestions');
    expect(readDataBundle().pacingRuns[1]).toMatchObject({ partType: 'CUSTOM', totalQuestions: 60, correctAnswers: 0 });
  });

  it('round-trips an actual review and preserves learner fields through legacy date normalization', async () => {
    const { gradeReview } = await import('@/features/mistakes/lib/review');
    const { recordsFromBundle, bundleFromRecords } = await import('@/features/account/services/cloud');
    const now = new Date().toISOString();
    const data = bundle();
    data.mistakes = [{ id: 'reviewed', part: 5, questionContext: 'Reports ____ submitted.', userMistake: 'Bỏ trống',
      question: 'Reports ____ submitted.', context: 'The office is closed today.',
      userChoiceState: 'BLANK', userReason: 'Không kịp đọc\nTôi chưa biết đáp án.', correctAnswer: '(B) be',
      sourceTestName: 'ETS 2024 Test 03',
      answerSource: 'AI_PROPOSED', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: now, updatedAt: now, deletedAt: null }];
    data.mistakes[0] = { ...data.mistakes[0], ...gradeReview(data.mistakes[0], false) };
    let result = parseBackup(JSON.stringify({ ...data, exportDate: now }));
    expect(result.ok).toBe(true);
    const cloud = bundleFromRecords(recordsFromBundle(data));
    expect(cloud.mistakes[0]).toMatchObject({ question: data.mistakes[0].question, context: data.mistakes[0].context,
      userChoiceState: 'BLANK', userReason: data.mistakes[0].userReason, sourceTestName: 'ETS 2024 Test 03' });
    data.mistakes[0].lastReviewedAt = '2026-10-07';
    result = parseBackup(JSON.stringify({ ...data, exportDate: now }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.corrections.some(message => message.includes('lastReviewedAt'))).toBe(true);
    restoreBackup(result.preview);
    expect(readDataBundle().mistakes[0].lastReviewedAt).toBe('2026-10-07T00:00:00.000Z');
    expect(readDataBundle().mistakes[0].userReason).toBe(data.mistakes[0].userReason);
    expect(readDataBundle().mistakes[0].sourceTestName).toBe('ETS 2024 Test 03');
    expect(readDataBundle().mistakes[0].question).toBe(data.mistakes[0].question);
    expect(readDataBundle().mistakes[0].context).toBe(data.mistakes[0].context);
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
    expect(readDataBundle().shieldDays).toHaveLength(1);
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

  it('keeps wrong-question lists and draft cards, and rejects numbers that do not match their Part', () => {
    const now = '2026-10-19T00:00:00.000Z';
    const session = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS Test 4', date: '2026-10-19', durationMinutes: 120,
      createdAt: now, updatedAt: now, deletedAt: null, wrongQuestions: [3, 104], partScores: { part1: 5, part2: 25, part3: 39, part4: 30, part5: 29, part6: 16, part7: 54 } };
    const draft = { id: 'draft:s1:104', sessionId: 's1', part: 5, questionNumber: 104, questionContext: '', question: '', userMistake: '', correctAnswer: '',
      answerSource: 'MISSING', userChoiceState: 'UNKNOWN', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null };
    const valid = parseBackup(JSON.stringify({ ...bundle(), exportDate: now, sessions: [session], mistakes: [draft] }));
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.preview.data.sessions[0].wrongQuestions).toEqual([3, 104]);
      expect(valid.preview.data.mistakes[0].questionNumber).toBe(104);
    }
    for (const broken of [
      { sessions: [{ ...session, wrongQuestions: [104, 3] }], mistakes: [] },
      { sessions: [{ ...session, partScores: { ...session.partScores, part5: 30 } }], mistakes: [] },
      { sessions: [], mistakes: [{ ...draft, part: 6 }] }
    ]) expect(parseBackup(JSON.stringify({ ...bundle(), exportDate: now, ...broken })).ok).toBe(false);
  });

  it('rejects a backup from a newer app version', () => {
    const result = parseBackup(JSON.stringify({ schemaVersion: 5 }));
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

describe('backup import limits (S-24)', () => {
  const now = '2026-11-20T00:00:00.000Z';
  const file = (extra: Record<string, unknown> = {}) => ({ ...bundle(), schemaVersion: 4, exportDate: now, ...extra });
  const errors = (input: unknown) => {
    const result = parseBackup(typeof input === 'string' ? input : JSON.stringify(input));
    return result.ok ? [] : result.errors;
  };

  it('drops fields the app does not know instead of restoring them', () => {
    const input = file({ checklist: [{ id: 'x' }], profile: { ...bundle().profile, secretFlag: true, habits: [{ id: 'h1', title: 'Nghe', doneDates: ['2026-11-19'], junk: 1 }] } });
    input.pacingRuns[0] = { ...input.pacingRuns[0], injected: 'x'.repeat(100) } as typeof input.pacingRuns[0];
    const result = parseBackup(JSON.stringify(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.preview.data as unknown as Record<string, Record<string, unknown> & { pacingRuns: Record<string, unknown>[] }>;
    expect(data.profile).not.toHaveProperty('secretFlag');
    expect((data.profile.habits as Record<string, unknown>[])[0]).toEqual({ id: 'h1', title: 'Nghe', doneDates: ['2026-11-19'] });
    expect((result.preview.data as unknown as { pacingRuns: Record<string, unknown>[] }).pacingRuns[0]).not.toHaveProperty('injected');
    expect(result.preview.data).not.toHaveProperty('checklist');
  });

  it('keeps every field the app writes', () => {
    const profile = { ...bundle().profile, weeklyGoalDays: 4, goalChosen: true, suggestOff: ['FULL_TEST'], socGear: ['khan'], socCoat: 'xam', socName: 'Hạt Dẻ',
      habits: [{ id: 'h1', title: 'Nghe', doneDates: ['2026-11-19'] }],
      suggestedTasks: [{ id: 'a:7:timer', kind: 'timer', title: 'Bấm giờ Part 7', minutes: 20, part: 7, testName: 'ETS', testDate: '2026-11-18', addedDate: '2026-11-19' }] };
    const session = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date: '2026-11-19', durationMinutes: 120,
      createdAt: now, updatedAt: now, deletedAt: null, partDurations: { part5: 10, part6: 8, part7: 50 } };
    const result = parseBackup(JSON.stringify(file({ profile, sessions: [session] })));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.data.profile).toMatchObject(profile);
      expect(result.preview.data.sessions[0]).toMatchObject(session);
    }
  });

  it('ignores prototype keys from the file', () => {
    const json = JSON.stringify(file()).replace('"profile":{', '"profile":{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},');
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) expect(Object.getPrototypeOf(result.preview.data.profile)).toBe(Object.prototype);
  });

  it('refuses oversized files, too many records and records the server would refuse, in Vietnamese', () => {
    expect(errors('x'.repeat(10 * 1024 * 1024 + 1))[0]).toContain('quá lớn');
    const many = Array.from({ length: 10001 }, (_, n) => ({ id: `shield:${n}`, date: '2026-11-19', updatedAt: now, deletedAt: null }));
    expect(errors(file({ shieldDays: many }))[0]).toContain('vượt giới hạn 10000 bản ghi');
    expect(errors(file({ vocabLog: [{ id: 'v1', date: '2026-11-19', count: 1, sourceName: 'x'.repeat(40000), updatedAt: now, deletedAt: null }] }))[0]).toContain('quá lớn');
    const profile = (patch: Record<string, unknown>) => file({ profile: { ...bundle().profile, ...patch } });
    expect(errors(profile({ name: 'x'.repeat(101) }))[0]).toContain('profile.name');
    expect(errors(profile({ name: 'a\u0000b' }))[0]).toContain('không hợp lệ');
    expect(errors(profile({ currentStreak: 2 ** 31 })).length).toBeGreaterThan(0);
    expect(errors(profile({ examDate: '9999-12-31' }))[0]).toContain('1970–2100');
    const run = (patch: Record<string, unknown>) => file({ pacingRuns: [{ ...bundle().pacingRuns[0], ...patch }] });
    expect(errors(run({ presetId: 'x'.repeat(101) }))[0]).toContain('pacingRuns.0.presetId');
    expect(errors(run({ plannedMinutes: 1e308 })).length).toBeGreaterThan(0);
    expect(errors(run({ updatedAt: '0001-01-01T00:00:00.000Z' }))[0]).toContain('1970–2100');
  });

  it('allows up to 64 KiB for mistakes, enforces UTF-8 bytes on profile, blocks NUL in AI fields and checks sourceImageIds', () => {
    const richMistake = {
      id: 'm-big', part: 7, category: 'VOCABULARY_TRAP', status: 'NEEDS_REVIEW',
      questionContext: 'Q' + 'x'.repeat(15000), question: 'What? ' + 'q'.repeat(12000),
      context: 'Đoạn 1 — Email\n' + 'Nội dung tiếng Việt dài. '.repeat(350),
      userMistake: '(A) Sai', correctAnswer: '(B) Đúng', tags: ['part7'],
      createdAt: now, updatedAt: now, deletedAt: null,
      explanation: { quickTip: 'Tip', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '', evidences: [], words: [{ word: 'refund', meaning: 'hoàn tiền' }] },
      savedWords: ['refund'],
    };
    expect(parseBackup(JSON.stringify(file({ mistakes: [richMistake] }))).ok).toBe(true);
    // NUL byte inside explanation is rejected
    expect(parseBackup(JSON.stringify(file({ mistakes: [{ ...richMistake, explanation: { ...richMistake.explanation, quickTip: 'a\u0000b' } }] }))).ok).toBe(false);
    // Duplicate or wrong-part sourceImageIds are rejected
    const imgId = 'a'.repeat(64);
    expect(parseBackup(JSON.stringify(file({ mistakes: [{ ...richMistake, part: 5, sourceImageIds: [imgId] }] }))).ok).toBe(false);
    expect(parseBackup(JSON.stringify(file({ mistakes: [{ ...richMistake, part: 7, sourceImageIds: [imgId, imgId] }] }))).ok).toBe(false);
    // Oversized profile (> 32 KiB) is rejected
    expect(errors(file({ profile: { ...bundle().profile, extraBlob: 'x'.repeat(35000) } }))[0]).toContain('profile');
  });
});
