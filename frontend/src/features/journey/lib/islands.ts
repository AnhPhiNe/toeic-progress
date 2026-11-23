/**
 * Pure logic for "Hành trình điểm › Từng Part" (sketch: design/previews/mock-journey-parts4.html): how an island is
 * dressed, which Parts get a treasure chest and when a chest counts as emptied.
 */
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { partSize } from './journeyData';

export type IslandState = 'strong' | 'ok' | 'weak';

export const ISLAND_STATE_LABEL: Record<IslandState, string> = { strong: 'Vững', ok: 'Ổn', weak: 'Cần ôn' };

/** Whole-number accuracy of one Part, e.g. 6 questions with 3 wrong is 50. */
export function partAccuracy(size: number, wrong: number): number {
  if (!(size > 0)) return 0;
  return Math.round(Math.max(0, Math.min(size, size - wrong)) / size * 100);
}

/** Accuracy from which a Part counts as "Vững" (green) and as "Ổn" (amber); below that it is "Cần ôn" (pink). */
export const STRONG_FROM = 85;
export const OK_FROM = 75;

/** 85% and up is lush ("Vững"), 75-84% is "Ổn", below 75% is dry and stormy ("Cần ôn"). */
export function islandState(accuracy: number): IslandState {
  return accuracy >= STRONG_FROM ? 'strong' : accuracy >= OK_FROM ? 'ok' : 'weak';
}

/** Island radius in sketch pixels: bigger Parts (more questions) get bigger islands. */
export function islandRadius(questions: number): number {
  return Math.round(24 + Math.sqrt(Math.max(0, questions)) * 11.5);
}

export type Trend = 'down' | 'up' | 'flat';

/** Direction of the wrong-answer counts over the last tests (oldest first); null with fewer than two tests. */
export function wrongTrend(counts: number[]): Trend | null {
  if (counts.length < 2) return null;
  const delta = counts[counts.length - 1] - counts[0];
  return delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat';
}

/** A notebook card belongs to a test by its session id, or (older cards) by the test name. */
export const cardBelongsToTest = (card: MistakeEntry, session: StudySession) =>
  !card.deletedAt && (card.sessionId === session.id || (!card.sessionId && !!card.sourceTestName && card.sourceTestName === session.testName));

/**
 * A card has been looked at again in the review flow, marked as known, or—for Listening Parts 1–4
 * where cards are logged by mistake reason without a text quiz—recorded with a mistake reason.
 */
export const cardReviewed = (card: MistakeEntry) =>
  card.status === 'MASTERED'
  || (card.reviewCount ?? 0) > 0
  || (card.part <= 4 && ((Boolean(card.category) && card.category !== 'OTHER') || Boolean(card.userReason?.trim())));

export interface PartChest {
  part: PartNumber;
  wrong: number;
  /** Wrong answers of this Part in this test whose notebook card has been reviewed. */
  reviewed: number;
  /** Wrong answers still to win back ("12 câu gỡ lại được"). */
  remaining: number;
  /** Every wrong answer of this Part has been reviewed: the chest is shown open and empty. */
  open: boolean;
}

/**
 * Chest state of every Part in one test.
 *
 * Open-chest rule: a wrong question counts as "gỡ lại" when its notebook card (same test, same question number)
 * has been reviewed at least once or is marked Đã thuộc. When the test has the wrong-question list, every wrong
 * question of the Part needs such a card; without the list (Part scores only) the Part needs at least as many
 * reviewed cards as it has wrong answers. A wrong question without a card is never counted as reviewed.
 */
export function partChests(session: StudySession, wrongByPart: Record<PartNumber, number>, cards: MistakeEntry[]): Record<PartNumber, PartChest> {
  const mine = cards.filter(card => cardBelongsToTest(card, session));
  const wrongNumbers = session.wrongQuestions ? wrongQuestionsByPart(session.wrongQuestions) : null;
  const out = {} as Record<PartNumber, PartChest>;
  for (const part of PART_NUMBERS) {
    const wrong = wrongByPart[part] ?? 0;
    const reviewedCards = mine.filter(card => card.part === part && cardReviewed(card));
    let reviewed: number;
    if (wrongNumbers) {
      const done = new Set(reviewedCards.map(card => card.questionNumber));
      reviewed = wrongNumbers[part].filter(n => done.has(n)).length;
    } else {
      reviewed = Math.min(wrong, reviewedCards.length);
    }
    out[part] = { part, wrong, reviewed, remaining: Math.max(0, wrong - reviewed), open: wrong > 0 && reviewed >= wrong };
  }
  return out;
}

export interface ChestPlan {
  /** Parts with a numbered chest, first = ①. At most two. */
  numbered: PartNumber[];
  /** Parts whose chest is already empty. */
  opened: PartNumber[];
}

/**
 * Parts with wrong answers ranked by how many are wrong (ties: lower accuracy, then the later Part). The first two
 * that are not emptied get chests ① and ②; emptied Parts show an open chest, so the next Part moves up to ①.
 */
export function chestPlan(chests: Record<PartNumber, PartChest>): ChestPlan {
  const ranked = PART_NUMBERS.filter(p => chests[p].wrong > 0).sort((a, b) => {
    const ca = chests[a], cb = chests[b];
    return cb.wrong - ca.wrong
      || partAccuracy(partSize(a), ca.wrong) - partAccuracy(partSize(b), cb.wrong)
      || b - a;
  });
  return { numbered: ranked.filter(p => !chests[p].open).slice(0, 2), opened: ranked.filter(p => chests[p].open) };
}
