import type { MistakeEntry, StudySession } from '@/shared/types';
import { sessionDrafts } from '@/features/mistakes/lib/mistakeDrafts';

/** Resume the newest real attempt with unfinished Reading cards, never another attempt of the same named test. */
export function resumeDetails(sessions: StudySession[], mistakes: MistakeEntry[]) {
  const candidates = sessions.filter(session => !session.deletedAt && session.skillType === 'LR' && session.sessionType === 'FULL_TEST')
    .map(session => ({ session, remaining: sessionDrafts(session.id, mistakes).length }))
    .filter(item => item.remaining > 0)
    .sort((a, b) => b.session.date.localeCompare(a.session.date)
      || b.session.createdAt.localeCompare(a.session.createdAt) || b.session.id.localeCompare(a.session.id));
  return candidates[0] ?? null;
}
