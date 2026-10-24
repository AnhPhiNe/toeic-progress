import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
const mocks = vi.hoisted(() => ({ owner: 'alice', getSession: vi.fn(), backendRequest: vi.fn() }));
vi.mock('@/shared/data/dataBundle', () => ({ getActiveAccountId: () => mocks.owner }));
vi.mock('@/shared/api/api', () => ({ backendRequest: mocks.backendRequest }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession: mocks.getSession } } }));
import { analyzeAttempt, analysisFingerprint, attemptAnalysisInput, readAnalysisCache, saveAnalysisCache, clearAnalysisCache } from './attemptAnalysis';
import type { AttemptAnalysisReport } from './attemptAnalysis';

const stamp = '2026-10-23T00:00:00Z';
const attempt: StudySession = { id: 'attempt-a', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS A', date: '2026-10-23', createdAt: stamp, updatedAt: stamp, durationMinutes: 120 };
const note: MistakeEntry = { id: 'note-a', sessionId: 'attempt-a', part: 5, category: 'OTHER', questionContext: 'Reports must be ____.',
  userMistake: 'A', correctAnswer: '(B) submitted', status: 'NEEDS_REVIEW', tags: [], createdAt: stamp, updatedAt: stamp };
const report: AttemptAnalysisReport = { version: 1, model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', signature: 'a'.repeat(64),
  priorities: [{ title: 'Ôn cấu trúc bị động', observation: 'Đối chiếu cấu trúc ở câu đã lưu.', practice: 'Làm lại câu đã lưu và nêu căn cứ để loại từng phương án.', part: 5, evidenceIds: ['note-a'], minutes: 15 }],
  parts: [{ part: 5, correct: 29, total: 30, wrong: 1 }], linkedNotes: 1, sampledNotes: 1 };
beforeEach(() => {
  vi.resetAllMocks(); mocks.owner = 'alice';
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'alice', is_anonymous: false } } } });
  mocks.backendRequest.mockResolvedValue({ report });
});

describe('selected attempt learning advice', () => {
  it('never attributes source-only, another-attempt or deleted notes to the selected attempt', () => {
    const input = attemptAnalysisInput(attempt, [note, { ...note, id: 'old', sessionId: 'attempt-b' },
      { ...note, id: 'source-only', sessionId: undefined, sourceTestName: 'ETS A' }, { ...note, id: 'gone', deletedAt: stamp }]);
    expect(input.notes.map(row => row.id)).toEqual(['note-a']);
    expect(input.noteVersions).toEqual({ 'note-a': stamp });
  });
  it('sends only attempt identity and version checks, with verified account and stale guard', async () => {
    await expect(analyzeAttempt(attempt, [note], 'alice', () => true)).resolves.toEqual(report);
    const [path, method, body, owner, guard] = mocks.backendRequest.mock.calls[0];
    expect([path, method, owner]).toEqual(['/api/v1/ai/analyze-attempt', 'POST', 'alice']);
    expect(body).toMatchObject({ attemptId: 'attempt-a', sessionVersion: stamp, noteVersions: { 'note-a': stamp }, consent: true });
    expect(body).not.toHaveProperty('question'); expect(guard()).toBe(true);
  });
  it('blocks owner changes and a closed view before sending a paid request', async () => {
    await expect(analyzeAttempt(attempt, [note], 'bob', () => true)).rejects.toThrow('thay đổi');
    await expect(analyzeAttempt(attempt, [note], 'alice', () => false)).rejects.toThrow('thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('rechecks account and current selection after session lookup', async () => {
    mocks.getSession.mockImplementation(async () => { mocks.owner = 'bob'; return { data: { session: { user: { id: 'alice' } } } }; });
    await expect(analyzeAttempt(attempt, [note], 'alice', () => true)).rejects.toThrow('thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not apply an answer arriving after an account/attempt switch', async () => {
    let current = true;
    mocks.backendRequest.mockImplementation(async () => { current = false; return { report }; });
    await expect(analyzeAttempt(attempt, [note], 'alice', () => current)).rejects.toThrow('thay đổi');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
  it('rejects non-account sessions without triggering a request', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'alice', is_anonymous: true } } } });
    await expect(analyzeAttempt(attempt, [note], 'alice', () => true)).rejects.toThrow('Đăng nhập');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('rejects foreign evidence IDs without retry', async () => {
    mocks.backendRequest.mockResolvedValue({ report: { ...report, priorities: [{ ...report.priorities[0], evidenceIds: ['foreign'] }] } });
    await expect(analyzeAttempt(attempt, [note], 'alice', () => true)).rejects.toThrow('ngoài lần làm');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
  it('changes fingerprint after selected data changes but ignores another attempt', async () => {
    const first = await analysisFingerprint(attempt, [note]);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await analysisFingerprint(attempt, [note, { ...note, id: 'other', sessionId: 'other' }])).toBe(first);
    expect(await analysisFingerprint(attempt, [{ ...note, userMistake: 'B' }])).not.toBe(first);
  });
  it('isolates cached advice by account and preserves another user on reset', () => {
    const row = { attemptId: attempt.id, fingerprint: 'b'.repeat(64), generatedAt: stamp, report };
    expect(saveAnalysisCache('alice', row)).toBe(true);
    expect(readAnalysisCache('alice', attempt.id)?.report).toEqual(report);
    expect(readAnalysisCache('bob', attempt.id)).toBeNull();
    expect(saveAnalysisCache('bob', row)).toBe(false);
    mocks.owner = 'bob'; expect(saveAnalysisCache('bob', row)).toBe(true);
    clearAnalysisCache('alice'); expect(readAnalysisCache('alice', attempt.id)).toBeNull();
    expect(readAnalysisCache('bob', attempt.id)?.report).toEqual(report);
  });
  it('returns an in-memory report even if browser cache is full', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(saveAnalysisCache('alice', { attemptId: attempt.id, fingerprint: 'b'.repeat(64), generatedAt: stamp, report })).toBe(false);
  });
  it('rejects malformed cached reports and caps the cache to eight attempts', () => {
    localStorage.setItem('toeic_attempt_advice_alice_v1', JSON.stringify([{ attemptId: attempt.id, fingerprint: 'b'.repeat(64), generatedAt: stamp, report: {} }]));
    expect(readAnalysisCache('alice', attempt.id)).toBeNull();
    for (let index = 0; index < 12; index++) saveAnalysisCache('alice', { attemptId: `attempt-${index}`, fingerprint: 'b'.repeat(64), generatedAt: stamp, report });
    expect(JSON.parse(localStorage.getItem('toeic_attempt_advice_alice_v1')!)).toHaveLength(8);
  });
});
