import type { PacingRun, PracticePartResult, StudySession } from '@/shared/types';
import { getActiveAccountId, live, nextUpdatedAt, readDataBundle, retainedSessionSources, updateDataBundle } from '@/shared/data/dataBundle';
import { normalizeTestName } from '@/shared/domain/testNames';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { DEFAULT_POMODORO, elapsedMs, localDate, parseTimer, PRESETS, type PacingMode, type PomodoroSettings, type TimerSnapshot } from '@/features/pacing/lib/pacingModel';

export const timerKey = (owner: string | null) => `toeic_pacing_draft_v1_${owner ?? 'guest'}`;
const settingsKey = (owner: string | null) => `toeic_pomodoro_settings_v2_${owner ?? 'guest'}`;
export class PacingOwnerChangedError extends Error {}
export function assertPacingOwner(owner: string | null) { if (getActiveAccountId() !== owner) throw new PacingOwnerChangedError('Tài khoản đã đổi. Hãy mở lại phiên luyện của tài khoản hiện tại.'); }
export function readTimer(owner: string | null): TimerSnapshot | null {
  try { return parseTimer(JSON.parse(localStorage.getItem(timerKey(owner)) ?? 'null'), owner); } catch { return null; }
}
export function persistTimer(timer: TimerSnapshot) { assertPacingOwner(timer.owner); localStorage.setItem(timerKey(timer.owner), JSON.stringify(timer)); }
export function clearTimer(owner: string | null, id: string) { assertPacingOwner(owner); if (readTimer(owner)?.id === id) localStorage.removeItem(timerKey(owner)); }
export function readPomodoroSettings(owner: string | null): PomodoroSettings {
  try {
    const value = JSON.parse(localStorage.getItem(settingsKey(owner)) ?? (owner === null ? localStorage.getItem('toeic_pomodoro_settings') : null) ?? 'null');
    if (!value) return DEFAULT_POMODORO;
    const valid = (key: keyof PomodoroSettings, max: number) => Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= max ? value[key] : DEFAULT_POMODORO[key];
    return { workMinutes: valid('workMinutes', 180), shortBreakMinutes: valid('shortBreakMinutes', 60), longBreakMinutes: valid('longBreakMinutes', 90), longBreakInterval: valid('longBreakInterval', 12) };
  } catch { return DEFAULT_POMODORO; }
}
export function savePomodoroSettings(owner: string | null, settings: PomodoroSettings) { assertPacingOwner(owner); localStorage.setItem(settingsKey(owner), JSON.stringify(settings)); }

// Larger custom drills keep their aggregate on the run; a TOEIC Part breakdown has fixed limits.
function practiceBreakdown(part: PracticePartResult['part'] | null | undefined, correct: number | undefined, total: number) {
  if (!part || correct === undefined || total > PART_MAX_QUESTIONS[`part${part}` as keyof typeof PART_MAX_QUESTIONS]) return {};
  return { practiceParts: [{ part, correct, total }] };
}

export function savePacingResult(timer: TimerSnapshot): PacingRun[] {
  assertPacingOwner(timer.owner);
  if (!parseTimer(timer, timer.owner) || timer.status !== 'finished' || timer.endedAt === null || elapsedMs(timer) <= 0) throw new Error('Chưa có thời gian luyện để lưu.');
  const correct = timer.correct.trim() === '' ? undefined : Number(timer.correct);
  if (correct !== undefined && (!Number.isInteger(correct) || correct < 0 || correct > timer.questions)) throw new Error(`Số câu đúng phải là số nguyên từ 0 đến ${timer.questions}.`);
  const seconds = elapsedMs(timer) / 1000, natural = seconds >= timer.plannedSeconds, createdAt = new Date(timer.endedAt).toISOString();
  const config = PRESETS[timer.mode], name = normalizeTestName(timer.name);
  const presetName = timer.mode === 'POMODORO' && timer.phase !== 'WORK' ? timer.phase === 'SHORT_BREAK' ? 'Nghỉ ngắn' : 'Nghỉ dài' : config.name;
  const run: PacingRun = { id: timer.id, presetId: timer.mode === 'POMODORO' ? `POMODORO_${timer.phase}` : timer.mode, presetName,
    partType: timer.mode, testName: name || undefined, date: localDate(timer.endedAt), plannedMinutes: timer.plannedSeconds / 60, actualMinutes: seconds / 60,
    actualSeconds: seconds, finishedNaturally: natural, phases: [], createdAt, ...(timer.questions ? { totalQuestions: timer.questions, speedSecPerQuestion: seconds / timer.questions,
      ...(correct !== undefined ? { correctAnswers: correct, accuracyPercent: correct / timer.questions * 100 } : {}) } : {}) };
  const shouldRecordStudy = timer.mode !== 'POMODORO' || timer.phase === 'WORK';
  // Same reserved ID in both collections is the association; no new DB column or guessed foreign key.
  const session: StudySession = { id: timer.id, skillType: 'LR', sessionType: 'PART_PRACTICE', testName: name || (timer.mode === 'POMODORO' ? 'Pomodoro: tập trung' : `Luyện ${config.name}`),
    date: run.date, durationMinutes: seconds / 60, createdAt,
    ...practiceBreakdown(config.part, correct, timer.questions),
    notes: `${presetName}: ${Math.round(seconds)} giây${timer.questions ? ` · ${correct === undefined ? 'Chưa chấm' : `Đúng ${correct}/${timer.questions}`}` : natural ? ' · Hoàn thành' : ' · Kết thúc sớm'}` };
  return live(updateDataBundle(current => {
    const existing = current.pacingRuns.find(item => item.id === timer.id);
    if (existing?.deletedAt) throw new Error('Lượt này đã bị xóa; không thể lưu lại từ phiên cũ.');
    if (existing) return current; // Double click, another tab, or recovery after an interrupted UI update.
    if (current.sessions.some(item => item.id === timer.id)) throw new Error('ID phiên đã tồn tại. Hãy bắt đầu một phiên mới.');
    const metadata = { updatedAt: nextUpdatedAt(), deletedAt: null };
    return { ...current, pacingRuns: [{ ...run, ...metadata }, ...current.pacingRuns],
      sessions: shouldRecordStudy ? [{ ...session, ...metadata }, ...current.sessions] : current.sessions };
  }).pacingRuns);
}

/** Legacy generated pairs are matched only when ID, timing, type and source agree uniquely. */
export function associatedStudyId(run: PacingRun, sessions: StudySession[]): string | undefined {
  if (run.id.startsWith('pacing-v2-')) return sessions.find(session => !session.deletedAt && session.id === run.id)?.id;
  const stamp = /^pacing(?:-pomodoro)?-(\d+)$/.exec(run.id)?.[1];
  if (!stamp || Math.abs(Date.parse(run.createdAt) - Number(stamp)) > 2000) return undefined;
  const prefix = run.partType === 'POMODORO' ? 'session-pomodoro-' : 'session-pacing-';
  // Stored historical labels must not depend on today's display wording.
  const legacyNames: Partial<Record<PacingMode, string>> = { PART_5: 'Part 5', PART_6: 'Part 6',
    PART_7_SINGLE: 'Part 7A', PART_7_MULTI: 'Part 7B', PART_7: 'Part 7', FULL_READING: 'Full Reading' };
  const config = run.partType && run.partType in PRESETS ? PRESETS[run.partType as PacingMode] : undefined;
  const legacyMode = legacyNames[run.partType as PacingMode] ?? run.presetName;
  const name = run.testName?.trim();
  const expectedNames = new Set((run.partType === 'POMODORO'
    ? ['Pomodoro: Tập trung chuyên sâu', name || 'Pomodoro: tập trung']
    : name ? [`[Tốc độ] ${name}`, name] : [`[Luyện tốc độ] ${legacyMode}`, `Luyện ${config?.name ?? run.presetName}`]).map(normalizeTestName));
  const matches = sessions.filter(session => !session.deletedAt && session.sessionType === 'PART_PRACTICE' && session.id.startsWith(prefix)
    && /^\d+$/.test(session.id.slice(prefix.length)) && Math.abs(Number(session.id.slice(prefix.length)) - Number(stamp)) <= 2000
    && session.date === run.date && expectedNames.has(normalizeTestName(session.testName))
    && Math.abs(session.durationMinutes - run.actualMinutes) < 0.0001
    && Math.abs(Date.parse(session.createdAt) - Date.parse(run.createdAt)) <= 2000);
  return matches.length === 1 ? matches[0].id : undefined;
}
export function removePacingResult(id: string, owner: string | null): PacingRun[] {
  assertPacingOwner(owner);
  return live(updateDataBundle(current => {
    const run = current.pacingRuns.find(item => item.id === id && !item.deletedAt);
    if (!run) return current;
    const linkedId = associatedStudyId(run, current.sessions);
    const deleted = <T extends { id: string; updatedAt?: string }>(item: T): T & { deletedAt: string } => { const updatedAt = nextUpdatedAt(item.updatedAt); return { ...item, updatedAt, deletedAt: updatedAt }; };
    return { ...current, mistakes: retainedSessionSources(current, new Set(linkedId ? [linkedId] : [])), pacingRuns: current.pacingRuns.map(item => item.id === id ? deleted(item) : item),
      sessions: current.sessions.map(item => item.id === linkedId ? deleted(item) : item) };
  }).pacingRuns);
}
export function pacingRunsNow() { return live(readDataBundle().pacingRuns); }
export interface LinkedStudyVersion { id: string; updatedAt?: string }
export function linkedStudyVersion(run: PacingRun): LinkedStudyVersion | null {
  const sessions = readDataBundle().sessions, id = associatedStudyId(run, sessions), session = sessions.find(item => item.id === id && !item.deletedAt);
  return session ? { id: session.id, updatedAt: session.updatedAt } : null;
}

export function updatePacingResult(original: PacingRun, owner: string | null, name: string, correctText: string, expectedStudy: LinkedStudyVersion | null): PacingRun[] {
  assertPacingOwner(owner);
  const clean = normalizeTestName(name), correct = correctText.trim() === '' ? undefined : Number(correctText), total = original.totalQuestions;
  const reading = original.partType !== 'POMODORO';
  if (clean.length > 300 || (reading ? !Number.isInteger(total) || total! <= 0 : correct !== undefined)
    || (correct !== undefined && (!Number.isInteger(correct) || correct < 0 || correct > total!))) throw new Error('Tên đề hoặc số câu đúng chưa hợp lệ.');
  return live(updateDataBundle(current => {
    const run = current.pacingRuns.find(item => item.id === original.id && !item.deletedAt);
    if (!run || run.updatedAt !== original.updatedAt) throw new Error('Lượt luyện đã được sửa/xóa ở nơi khác. Hãy mở lại bản mới nhất.');
    const linkedId = associatedStudyId(run, current.sessions), config = run.partType && run.partType in PRESETS ? PRESETS[run.partType as PacingMode] : null;
    const linked = current.sessions.find(session => session.id === linkedId && !session.deletedAt);
    if ((linked?.id ?? null) !== (expectedStudy?.id ?? null) || linked?.updatedAt !== expectedStudy?.updatedAt) throw new Error('Buổi học liên quan đã được sửa/xóa ở nơi khác. Hãy mở lại bản mới nhất.');
    const prior = linked?.updatedAt && Date.parse(linked.updatedAt) > Date.parse(run.updatedAt ?? '') ? linked.updatedAt : run.updatedAt;
    const updatedAt = nextUpdatedAt(prior);
    const { correctAnswers: _oldCorrect, accuracyPercent: _oldAccuracy, ...base } = run;
    const next = { ...base, testName: clean || undefined, updatedAt, ...(correct === undefined ? {} : { correctAnswers: correct, accuracyPercent: correct / total! * 100 }) };
    return { ...current, pacingRuns: current.pacingRuns.map(item => item.id === run.id ? next : item), sessions: current.sessions.map(session => {
      if (session.id !== linkedId) return session;
      const { practiceParts: _oldParts, ...rest } = session;
      return { ...rest, testName: clean || (reading ? `Luyện ${config?.name ?? run.presetName}` : 'Pomodoro: tập trung'), updatedAt,
        notes: `${config?.name ?? run.presetName}: ${Math.round((run.actualSeconds ?? run.actualMinutes * 60))} giây · ${reading ? correct === undefined ? 'Chưa chấm' : `Đúng ${correct}/${total}` : run.finishedNaturally ? 'Hoàn thành' : 'Kết thúc sớm'}`,
        ...practiceBreakdown(config?.part, correct, total!) };
    }) };
  }).pacingRuns);
}
