import type { LRPartScore, StudySession } from '@/shared/types';
import { calculateFromPartScores, SCORE_CONVERSION_VERSION } from '@/shared/domain/etsScoring';

export type ScoreSource = NonNullable<StudySession['scoreSource']>;
type ScoreResult = Pick<StudySession, 'rawListening' | 'rawReading' | 'scaledListening' | 'scaledReading' | 'totalScore' | 'scoreSource' | 'scoreConversionVersion' | 'partScores'>;

function checkScore(value: number | undefined, minimum: number, maximum: number, label: string): number {
  if (value === undefined || !Number.isInteger(value) || value < minimum || value > maximum || value % 5 !== 0) {
    throw new Error(`${label} phải từ ${minimum} đến ${maximum}, theo bước 5 điểm.`);
  }
  return value;
}

export function resolveFullTestScore(input: {
  source: ScoreSource; partScores?: LRPartScore; listening?: number; reading?: number; total?: number;
}): ScoreResult {
  const estimated = input.partScores ? calculateFromPartScores(input.partScores) : null;
  const details = estimated ? { partScores: input.partScores, rawListening: estimated.rawListening, rawReading: estimated.rawReading } : {};
  if (input.source === 'ESTIMATED') {
    if (!estimated) throw new Error('Cần số câu đúng từng Part để ước tính điểm.');
    return { ...details, ...estimated, scoreSource: 'ESTIMATED', scoreConversionVersion: SCORE_CONVERSION_VERSION };
  }
  if (input.source === 'MANUAL_SECTIONS') {
    const scaledListening = checkScore(input.listening, 5, 495, 'Listening');
    const scaledReading = checkScore(input.reading, 5, 495, 'Reading');
    return { ...details, scaledListening, scaledReading, totalScore: scaledListening + scaledReading, scoreSource: 'MANUAL_SECTIONS' };
  }
  return { ...details, totalScore: checkScore(input.total, 10, 990, 'Tổng điểm'), scoreSource: 'MANUAL_TOTAL' };
}

/** Preserve explicit or imported scores when editing instead of silently recalculating them. */
export function scoreSourceForEditing(session?: StudySession | null): ScoreSource {
  if (!session || session.sessionType !== 'FULL_TEST') return 'ESTIMATED';
  if (session.scoreSource) return session.scoreSource;
  const estimated = session.partScores ? calculateFromPartScores(session.partScores) : null;
  if (session.scaledListening !== undefined && session.scaledReading !== undefined) {
    if (session.totalScore !== undefined && session.totalScore !== session.scaledListening + session.scaledReading) return 'MANUAL_TOTAL';
    if (!estimated || estimated.scaledListening !== session.scaledListening || estimated.scaledReading !== session.scaledReading) return 'MANUAL_SECTIONS';
  } else if (session.totalScore !== undefined) return 'MANUAL_TOTAL';
  return 'ESTIMATED';
}

export function scoreSourceLabel(session: StudySession): string {
  if (session.scoreSource === 'ESTIMATED') return 'Ước tính tham khảo';
  if (session.scoreSource === 'MANUAL_SECTIONS') return 'Điểm nhập L/R';
  if (session.scoreSource === 'MANUAL_TOTAL') return 'Tổng điểm nhập';
  return 'Nguồn điểm chưa ghi';
}
