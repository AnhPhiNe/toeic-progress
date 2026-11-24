import { z } from 'zod';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { learnerMistake, type MistakeInput } from './mistakeInput';
import { optionLetter } from './userChoice';
import { fitsSyncPayload } from './explanationMerge';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import { explanationSchema, optionNoteSchema } from '@/shared/data/mistakeFields';

export interface BatchExtractedItem {
  id: string;
  number: number;
  part: MistakeEntry['part'];
  draft: AIMistakeParseResult;
  category: ErrorCategory;
  ticket?: string | null;
}

const cardFields = z.object({
  id: z.string().min(1), sourceTestName: z.string().min(1).max(300),
  part: z.number().int().min(1).max(7), questionNumber: z.number().int().min(1).max(200),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']),
  status: z.enum(['NEEDS_REVIEW', 'MASTERED']), answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']).optional(),
  userChoice: z.enum(['A', 'B', 'C', 'D']).optional(), userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(),
  questionContext: z.string().min(1).max(16000), question: z.string().max(16000).optional(), context: z.string().max(16000).optional(),
  userMistake: z.string().max(4000), correctAnswer: z.string().max(1000), trapTip: z.string().max(4000).optional(),
  options: z.array(z.string().max(1000)).max(4).optional(), tags: z.array(z.string().max(50)).max(5),
  userReason: z.string().max(2000).optional(), optionNotes: z.array(optionNoteSchema).max(4).optional(), explanation: explanationSchema.optional(),
  answerDoubt: z.enum(['A', 'B', 'C', 'D']).optional()
});

/** Preflight every card before the single storage mutation. IDs belong to the draft and survive failed saves. */
export function buildBatchEntries(items: BatchExtractedItem[], sourceTestName: string, sessionId?: string): MistakeEntry[] {
  const ids = new Set<string>();
  const numbers = new Set<number>();
  return items.map(item => {
    if (ids.has(item.id) || numbers.has(item.number) || item.number < 1 || item.number > 200 || partOfQuestion(item.number) !== item.part) {
      throw new Error(`Câu ${item.number}: số câu hoặc ID không hợp lệ. Chưa lưu câu nào.`);
    }
    ids.add(item.id); numbers.add(item.number);
    const draft = item.draft;
    const choice = draft.userChoice || '';
    const userChoiceState = draft.userChoiceState ?? (choice ? 'CHOSEN' : 'UNKNOWN');
    if ((userChoiceState === 'CHOSEN') !== Boolean(choice)) throw new Error(`Câu ${item.number}: lựa chọn chưa hợp lệ. Chưa lưu câu nào.`);
    const input: MistakeInput = {
      question: draft.question ?? '', context: draft.context ?? '', options: draft.options ?? [], part: item.part,
      userChoice: choice, userChoiceState, userReason: draft.userReason ?? '',
      sourceAnswer: draft.answerSource === 'PROVIDED' ? optionLetter(draft.correctAnswer) : ''
    };
    const entry: MistakeEntry = {
      id: item.id, createdAt: new Date().toISOString(), status: 'NEEDS_REVIEW', sourceTestName, sessionId,
      questionNumber: item.number, part: item.part, question: draft.question ?? undefined, context: draft.context ?? undefined,
      questionContext: draft.questionContext, options: draft.options?.length ? draft.options : undefined,
      userChoice: choice || undefined, userChoiceState, userReason: draft.userReason || undefined,
      userMistake: draft.userMistake || learnerMistake(input), correctAnswer: draft.correctAnswer,
      answerSource: draft.correctAnswer ? draft.answerSource : 'MISSING', category: item.category, tags: draft.tags ?? [],
      trapTip: draft.trapTip || undefined, optionNotes: draft.optionNotes?.length ? draft.optionNotes : undefined,
      explanation: draft.explanation ?? undefined, answerDoubt: draft.answerDoubt || undefined
    };
    if (!cardFields.safeParse(entry).success) throw new Error(`Câu ${item.number}: nội dung vượt giới hạn hoặc chưa hợp lệ. Chưa lưu câu nào; bản nháp vẫn được giữ.`);
    if (!fitsSyncPayload(entry)) throw new Error(`Câu ${item.number}: nội dung vượt 64 KiB, chưa thể đồng bộ. Rút gọn ngữ cảnh trước khi lưu; chưa lưu câu nào.`);
    return entry;
  });
}


/** The persistence boundary repeats preflight so another caller cannot bypass form validation. */
export function assertBatchEntries(entries: MistakeEntry[]): void {
  if (!entries.length) throw new Error('Không có câu nào để lưu.');
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const entry of entries) {
    if (!cardFields.safeParse(entry).success || partOfQuestion(entry.questionNumber!) !== entry.part
      || ids.has(entry.id) || numbers.has(entry.questionNumber!)
      || entry.userChoiceState === 'CHOSEN' && !entry.userChoice
      || entry.userChoiceState !== 'CHOSEN' && Boolean(entry.userChoice)) {
      throw new Error(`Câu ${entry.questionNumber ?? '?'}: nội dung hoặc ID chưa hợp lệ. Chưa lưu câu nào.`);
    }
    if (!fitsSyncPayload(entry)) throw new Error(`Câu ${entry.questionNumber}: nội dung vượt 64 KiB. Chưa lưu câu nào; bản nháp vẫn được giữ.`);
    ids.add(entry.id); numbers.add(entry.questionNumber!);
  }
}
