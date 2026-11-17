import type { MistakeEntry, StudySession } from '@/shared/types';
import { sessionDrafts } from '@/features/mistakes/lib/mistakeDrafts';

/** Reading questions still waiting for details across every logged Full Test, for the notebook nav reminder. */
export function unfinishedDetailCount(sessions: StudySession[], mistakes: MistakeEntry[]) {
  return sessions.filter(session => !session.deletedAt && session.skillType === 'LR' && session.sessionType === 'FULL_TEST')
    .reduce((sum, session) => sum + sessionDrafts(session.id, mistakes).length, 0);
}
