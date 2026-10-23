import type { MistakeEntry, StudySession } from '@/shared/types';
import { getActiveAccountId, live, nextUpdatedAt, replaceCollection, updateDataBundle, type DataBundle } from '@/shared/data/dataBundle';
import { getTodayDateString } from '@/shared/data/storage';
import { actualStudyDates, deriveStreak } from '@/shared/domain/streak';
import { applyDraftSync } from '@/features/mistakes/lib/mistakeDrafts';
import { mergeSessionEdit } from './sessionUpdates';

/** The existing automatic streak shield belongs to the same commit as the result. */
function withAutomaticShield(bundle: DataBundle, today: string): DataBundle {
  const date = new Date(`${today}T00:00:00`);
  const previousDay = () => {
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const yesterday = previousDay(), dayBefore = previousDay();
  const dates = actualStudyDates(bundle, today);
  if (!dates.has(dayBefore) || dates.has(yesterday) || live(bundle.shieldDays).some(day => day.date === yesterday)
    || deriveStreak(bundle, today).streakFreezes <= 0) return bundle;
  return { ...bundle, shieldDays: [
    ...bundle.shieldDays.filter(day => day.id !== `shield:${yesterday}`),
    { id: `shield:${yesterday}`, date: yesterday, updatedAt: nextUpdatedAt(bundle.shieldDays.find(day => day.date === yesterday)?.updatedAt), deletedAt: null }
  ] };
}

/** A result and its notebook handoff must either all persist or all remain a draft. */
export function persistSessionResult(session: StudySession, options: {
  original?: StudySession;
  newMistakes?: MistakeEntry[];
  expectedOwner: string | null;
}) {
  if (getActiveAccountId() !== options.expectedOwner) throw new Error('Tài khoản đã thay đổi. Chưa lưu kết quả đang nhập.');
  const today = getTodayDateString();
  let isRecord = false;
  const committed = updateDataBundle(current => {
    const sessions = live(current.sessions);
    let nextSession = session;
    if (options.original) nextSession = mergeSessionEdit(sessions.find(item => item.id === options.original!.id), options.original, session);
    else {
      if (current.sessions.some(item => item.id === session.id)) throw new Error('Kết quả này đã được lưu hoặc đã bị xóa. Hãy kiểm tra Lịch sử trước khi tiếp tục.');
      isRecord = (session.totalScore || 0) > Math.max(0, ...sessions.map(item => item.totalScore || 0));
    }
    const incoming = options.newMistakes ?? [];
    const ids = new Set(current.mistakes.map(item => item.id));
    for (const mistake of incoming) {
      if (!mistake.id || ids.has(mistake.id)) throw new Error('ID thẻ lỗi sai đã tồn tại. Chưa lưu kết quả hay thẻ nào.');
      ids.add(mistake.id);
    }
    let mistakes = [...incoming, ...live(current.mistakes)];
    if (nextSession.wrongQuestions) mistakes = applyDraftSync(nextSession, mistakes);
    // A prior deletion must not be undone by regenerating a deterministic draft ID.
    const deletedIds = new Set(current.mistakes.filter(item => item.deletedAt).map(item => item.id));
    const next = { ...current,
      sessions: replaceCollection(current.sessions, options.original
        ? sessions.map(item => item.id === nextSession.id ? nextSession : item) : [nextSession, ...sessions]),
      mistakes: replaceCollection(current.mistakes, mistakes.filter(item => !deletedIds.has(item.id)))
    };
    if (getActiveAccountId() !== options.expectedOwner) throw new Error('Tài khoản đã thay đổi. Chưa lưu kết quả đang nhập.');
    return withAutomaticShield(next, today);
  });
  return { sessions: live(committed.sessions), mistakes: live(committed.mistakes),
    profile: { ...committed.profile, ...deriveStreak(committed, today) }, isRecord };
}
