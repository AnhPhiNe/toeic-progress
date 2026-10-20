import type { MistakeEntry, StudySession } from '@/shared/types';
import { computeSessionAttemptMap } from '@/shared/data/storage';

export interface DetailGroup { id: string; title: string; attempt: string; cards: MistakeEntry[]; sessionId?: string }

/** Question numbers are unique within a test attempt, never across retakes or unrelated manual notes. */
export function groupDetailAttempts(cards: MistakeEntry[], sessions: StudySession[]): DetailGroup[] {
  const active = sessions.filter(session => !session.deletedAt);
  const attempts = computeSessionAttemptMap(active.filter(session => session.skillType === 'LR' && session.sessionType === 'FULL_TEST'));
  const bySession = new Map(active.map(session => [session.id, session]));
  const groups = new Map<string, DetailGroup>();
  for (const card of cards) {
    const sessionId = card.sessionId && card.questionNumber !== undefined ? card.sessionId : undefined;
    const id = sessionId ? `session:${sessionId}` : `manual:${card.id}`;
    const session = sessionId ? bySession.get(sessionId) : undefined;
    const title = card.sourceTestName || session?.testName || 'Chưa ghi đề';
    const date = (session?.date || card.createdAt.slice(0, 10)).split('-').reverse().join('/');
    const attempt = sessionId ? `${attempts[sessionId] ? `Lần ${attempts[sessionId].attemptNumber}` : 'Lượt làm'} · ${date}` : 'Thẻ nhập riêng';
    const group = groups.get(id) ?? { id, title, attempt, cards: [], sessionId };
    group.cards.push(card); groups.set(id, group);
  }
  return [...groups.values()];
}
