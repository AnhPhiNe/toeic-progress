import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { normalizeQuestionList } from '@/shared/domain/questionNumbers';
import { suggestGroups, type CustomRangeMap } from './wrongDetail';
import { openDoubt, type CardForm } from './detailForm';
import { optionLetter } from './userChoice';

/**
 * Capture v2 (design/previews/capture-v2): the "Cần chụp" shot list is derived from the wrong list alone, so it is the
 * same on every device and needs no AI. Part 5 wrong numbers close together share one screenshot ("Tấm"); Part 6/7
 * use their passage groups. Items tick themselves when Sóc's results contain their numbers.
 */
export type ShotPart = 5 | 6 | 7;
export interface ShotItem {
  key: string; part: ShotPart; kind: 'shot' | 'group';
  /** The question span the learner frames: a Tấm's first–last wrong number, or the passage group's range. */
  from: number; to: number;
  wrong: number[];
  /** Part 7 passages in the group (1–3); 1 elsewhere. */
  passages: number;
  /** Tấm 1, 2, … in Part 5. */
  index: number;
}

/** One screenshot of Part 5 holds about ten questions; wrong numbers inside such a span share a Tấm. */
export const PART5_SHOT_SPAN = 10;

/** Part 5: consecutive wrong numbers within `span` questions of the Tấm's first number go together. */
export function part5Shots(wrong: Iterable<number>, span = PART5_SHOT_SPAN): ShotItem[] {
  const numbers = normalizeQuestionList(wrong).filter(number => number >= 101 && number <= 130);
  const shots: ShotItem[] = [];
  for (const number of numbers) {
    const last = shots[shots.length - 1];
    if (last && number - last.from < span) { last.wrong.push(number); last.to = number; continue; }
    shots.push({ key: `s5-${number}`, part: 5, kind: 'shot', from: number, to: number, wrong: [number], passages: 1, index: shots.length + 1 });
  }
  return shots;
}

/** The whole "Cần chụp" list of a test's Reading wrong numbers, in test order. */
export function buildShotList(wrong: Iterable<number>, customPart7Ranges?: CustomRangeMap): ShotItem[] {
  const numbers = normalizeQuestionList(wrong);
  const groups = (part: 6 | 7) => suggestGroups(part, numbers.filter(number => part === 6 ? number >= 131 && number <= 146 : number >= 147),
    part === 7 ? customPart7Ranges : undefined)
    .map((group, index): ShotItem => ({ key: `g${group.from}`, part, kind: 'group', from: group.from, to: group.to, wrong: group.wrong, passages: group.passages, index: index + 1 }));
  return [...part5Shots(numbers), ...groups(6), ...groups(7)];
}

export const shotTitle = (item: ShotItem) => item.kind === 'shot'
  ? `Tấm ${item.index} · câu ${item.from === item.to ? item.from : `${item.from}–${item.to}`}`
  : `Nhóm ${item.from}–${item.to}`;
export const shotRange = (item: ShotItem) => item.from === item.to ? `${item.from}` : `${item.from}–${item.to}`;
/** The small line under a list item: what was wrong, and how much a Part 7 group holds. */
export function shotSub(item: ShotItem): string {
  if (item.kind === 'shot') return item.wrong.length > 1 ? `sai ${item.wrong.join(', ')}` : '';
  const passages = item.passages > 1 ? ` · ${item.passages} đoạn + câu hỏi` : '';
  return `câu ${item.wrong.join(', ')}${passages}`;
}

/** An item is ticked once each of its wrong numbers is recorded or came back from Sóc in this sitting. */
export const shotDone = (item: ShotItem, covered: (number: number) => boolean) => item.wrong.every(covered);

/** The numbers Sóc was asked for and did not find, still not covered: the "Còn thiếu" banner. */
export const shotMissing = (item: ShotItem, askedMissing: ReadonlySet<number>, covered: (number: number) => boolean) =>
  item.wrong.filter(number => askedMissing.has(number) && !covered(number));

/** The next item after `currentKey` that is still open; null on the last one. */
export function nextOpenShot(items: readonly ShotItem[], currentKey: string | null, open: (item: ShotItem) => boolean): ShotItem | null {
  const index = items.findIndex(item => item.key === currentKey);
  return items.slice(index + 1).find(open) ?? null;
}

/** The first open item, or the first item when every one is done. */
export const firstOpenShot = (items: readonly ShotItem[], open: (item: ShotItem) => boolean) => items.find(open) ?? items[0] ?? null;

/* ---------- Listening: one reason for several numbers ---------- */

/** Listening reasons, in the learner's words; each maps to a stored error category. */
export const LISTENING_REASONS: ReadonlyArray<readonly [ErrorCategory, string, string]> = [
  ['LISTENING_SPEED', 'Không kịp tốc độ', 'tốc độ'],
  ['VOCABULARY_TRAP', 'Không biết từ', 'từ vựng'],
  ['TIME_PRESSURE', 'Chưa đọc trước câu hỏi', 'đọc trước'],
  ['CARELESS_DISTRACTION', 'Mất tập trung', 'tập trung'],
  ['OTHER', 'Lý do khác', 'khác']
];
export const listeningReasonShort = (category: ErrorCategory) => LISTENING_REASONS.find(([value]) => value === category)?.[2] ?? 'khác';

/** "Sóc gợi ý": the learner's most used Listening reason so far, else not keeping up with the speed. No AI. */
export function suggestListeningReason(cards: readonly Pick<MistakeEntry, 'part' | 'category' | 'deletedAt'>[]): ErrorCategory {
  const counts = new Map<ErrorCategory, number>();
  for (const card of cards) {
    if (card.deletedAt || card.part > 4 || card.category === 'OTHER') continue;
    if (!LISTENING_REASONS.some(([value]) => value === card.category)) continue;
    counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
  }
  const order = LISTENING_REASONS.map(([value]) => value);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]?.[0] ?? 'LISTENING_SPEED';
}

/* ---------- Soát: which rows Sóc is unsure about ---------- */

export type DoubtKind = 'number' | 'rejected' | 'answer' | 'key' | 'missingAnswer' | 'context';
export interface Doubt { kind: DoubtKind; detail?: string }
export interface DoubtInput {
  form: CardForm;
  part: number;
  /** The reading said it guessed the question number (backend `numberSource: 'inferred'`, when sent). */
  inferredNumber?: boolean;
  /** The answer key already on the card before this reading (a partly saved card). */
  knownAnswer?: string;
  /** Sóc's reasons for not trusting this number's reading. */
  rejection?: string;
  /** Sóc is solving the missing answer right now: not a doubt yet. */
  explaining?: boolean;
}

/**
 * A read row is doubtful only on evidence already in the data: a guessed number, a rejection, Sóc's answer differing
 * from the page or from a known key, no answer, or a Part 6/7 question without its passage. Everything else is
 * confident and folds into the compact list.
 */
export function classifyDoubt({ form, part, inferredNumber, knownAnswer, rejection, explaining }: DoubtInput): Doubt | null {
  if (!form.ai) return null;
  if (inferredNumber) return { kind: 'number' };
  if (rejection) return { kind: 'rejected', detail: rejection };
  if (openDoubt(form)) return { kind: 'answer' };
  const known = optionLetter(knownAnswer ?? '');
  if (known && form.answer && known !== form.answer) return { kind: 'key', detail: known };
  if (!form.answer && !explaining) return { kind: 'missingAnswer' };
  if (part >= 6 && !form.ai.context?.trim()) return { kind: 'context' };
  return null;
}

/** The number chips under "Sóc đoán là câu N": the guess and the nearest still-open wrong numbers, in order. */
export function numberChoices(guess: number, open: Iterable<number>, count = 3): number[] {
  const others = normalizeQuestionList(open).filter(number => number !== guess)
    .sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess) || a - b).slice(0, Math.max(0, count - 1));
  return [...others, guess].sort((a, b) => a - b);
}

/* ---------- remembered choices, per account ---------- */

export interface CapturePrefs { photoMode: boolean; part7Zone: 'passage' | 'questions' }
const DEFAULT_PREFS: CapturePrefs = { photoMode: false, part7Zone: 'questions' };
/** Ends with `:{account}` so signing out scrubs it with the account's other copies. */
const prefsKey = (owner: string | null) => `toeic_capture_prefs_v1:${owner ?? 'guest'}`;
export function readCapturePrefs(owner: string | null): CapturePrefs {
  try {
    const value = JSON.parse(localStorage.getItem(prefsKey(owner)) ?? '{}') as Partial<CapturePrefs>;
    return { photoMode: value.photoMode === true, part7Zone: value.part7Zone === 'passage' ? 'passage' : 'questions' };
  } catch { return { ...DEFAULT_PREFS }; }
}
export function writeCapturePrefs(owner: string | null, patch: Partial<CapturePrefs>) {
  try { localStorage.setItem(prefsKey(owner), JSON.stringify({ ...readCapturePrefs(owner), ...patch })); } catch { /* the choice lasts this sitting */ }
}
