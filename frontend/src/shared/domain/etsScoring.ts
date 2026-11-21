import { LRPartScore, PracticePartResult } from '@/shared/types';

/**
 * Legacy tables are retained only to recognize/preserve existing estimates.
 * New estimates interpolate smoothly (rounded to 5) within the published IIBC March 2023
 * 5-question bands—anchored at each band's lower endpoint and capped within [min, max]—so
 * single-question changes near 96–100 never create a sudden +35 cliff.
 * Published ranges are still surfaced alongside the estimate; these are practice references,
 * not an official ETS score conversion claim.
 */

// Bảng Listening: Index đại diện cho số câu đúng (0 -> 100)
const LISTENING_CONVERSION_TABLE: number[] = [
  5,   5,   5,   5,   5,   10,  15,  20,  25,  30, // 0-9
  35,  40,  45,  50,  55,  60,  65,  70,  75,  80, // 10-19
  85,  90,  95,  100, 110, 115, 120, 125, 130, 135, // 20-29
  140, 145, 150, 160, 165, 170, 175, 180, 185, 190, // 30-39
  195, 200, 210, 215, 220, 230, 240, 245, 250, 255, // 40-49
  260, 270, 275, 280, 290, 295, 300, 310, 315, 320, // 50-59
  325, 330, 340, 345, 350, 360, 365, 370, 380, 385, // 60-69
  390, 395, 400, 405, 410, 420, 425, 430, 440, 445, // 70-79
  450, 455, 465, 470, 475, 480, 485, 490, 495, 495, // 80-89
  495, 495, 495, 495, 495, 495, 495, 495, 495, 495, // 90-99
  495                                                // 100
];

// Bảng Reading: Index đại diện cho số câu đúng (0 -> 100)
const READING_CONVERSION_TABLE: number[] = [
  5,   5,   5,   5,   5,   5,   10,  15,  20,  25, // 0-9
  30,  35,  40,  45,  50,  55,  60,  65,  70,  75, // 10-19
  80,  85,  90,  95,  100, 110, 115, 120, 125, 130, // 20-29
  135, 140, 145, 150, 155, 160, 165, 170, 175, 180, // 30-39
  190, 195, 200, 210, 215, 220, 225, 230, 235, 240, // 40-49
  250, 255, 260, 265, 270, 280, 285, 290, 295, 300, // 50-59
  310, 315, 320, 325, 330, 335, 340, 350, 355, 360, // 60-69
  365, 370, 375, 380, 385, 390, 395, 400, 405, 410, // 70-79
  415, 420, 425, 430, 435, 440, 450, 455, 460, 465, // 80-89
  470, 475, 480, 485, 490, 495, 495, 495, 495, 495, // 90-99
  495                                                // 100
];

/**
 * Quy đổi số câu đúng Listening sang Scaled Score ước tính (mượt trong khung IIBC 2023)
 */
export function convertRawToListeningScore(raw: number): number {
  return estimatePracticeScore('listening', raw);
}

/**
 * Quy đổi số câu đúng Reading sang Scaled Score ước tính (mượt trong khung IIBC 2023)
 */
export function convertRawToReadingScore(raw: number): number {
  return estimatePracticeScore('reading', raw);
}

export const SCORE_CONVERSION_VERSION = 'iibc-mock-2023-smooth-v3';
export const PRACTICE_SCORE_SOURCE = 'https://www.iibc-global.org/hubfs/library/default/toeic/special/job/u-trial202303/pdf/utrial_score.pdf?hsLang=ja';

// Each tuple is [minimum raw count, lower score, upper score], transcribed from page 3 of the source.
const PRACTICE_SCORE_RANGES: Record<'listening' | 'reading', readonly (readonly [number, number, number])[]> = {
  listening: [[0,5,35],[1,5,50],[6,5,60],[11,5,70],[16,30,90],[21,60,115],[26,85,145],[31,105,175],[36,130,205],[41,160,230],[46,190,255],[51,215,280],[56,240,310],[61,265,335],[66,290,360],[71,320,390],[76,345,420],[81,370,450],[86,405,470],[91,435,495],[96,475,495]],
  reading: [[0,5,15],[1,5,30],[6,10,40],[11,30,55],[16,45,75],[21,60,95],[26,75,120],[31,95,150],[36,115,180],[41,140,215],[46,170,245],[51,200,275],[56,230,310],[61,255,340],[66,285,370],[71,310,390],[76,340,415],[81,375,440],[86,400,465],[91,425,490],[96,460,495]],
};

function estimatePracticeScore(skill: 'listening' | 'reading', raw: number): number {
  assertRawScore(raw);
  if (raw === 0) return PRACTICE_SCORE_RANGES[skill][0][1];
  if (raw === 100) return 495;
  const bands = PRACTICE_SCORE_RANGES[skill];
  for (let index = bands.length - 1; index >= 0; index--) {
    const [start, min, max] = bands[index];
    if (raw >= start) {
      const next = bands[index + 1];
      const end = next ? next[0] : 100;
      const target = next ? next[1] : 495;
      const ratio = (raw - start) / Math.max(1, end - start);
      const smooth = Math.round((min + ratio * (target - min)) / 5) * 5;
      return Math.max(min, Math.min(max, smooth));
    }
  }
  throw new Error('Không tìm được điểm ước tính tham khảo.');
}

export function getPracticeScoreRange(skill: 'listening' | 'reading', raw: number): { min: number; max: number } {
  const published = getPublishedMockScoreRange(skill, raw);
  // The grouped 96–100 range has no perfect-score endpoint; the app supplies
  // one, while retaining the original lookup for v1 record handling.
  return raw === 100 ? { min: 495, max: 495 } : published;
}

function getPublishedMockScoreRange(skill: 'listening' | 'reading', raw: number): { min: number; max: number } {
  assertRawScore(raw);
  const bands = PRACTICE_SCORE_RANGES[skill];
  for (let index = bands.length - 1; index >= 0; index--) {
    const [minimumRaw, min, max] = bands[index];
    if (raw >= minimumRaw) return { min, max };
  }
  throw new Error('Không tìm được khoảng điểm tham khảo.');
}
function assertRawScore(raw: number): void {
  if (!Number.isInteger(raw) || raw < 0 || raw > 100) throw new Error('Số câu đúng phải là số nguyên từ 0 đến 100.');
}

/**
 * Cộng số câu đúng và ước tính điểm tham khảo từ chi tiết Part 1 - 7.
 */
export function calculateFromPartScores(partScores: LRPartScore, version = SCORE_CONVERSION_VERSION) {
  for (const [part, max] of Object.entries(PART_MAX_QUESTIONS)) {
    const count = partScores[part as keyof LRPartScore];
    if (!Number.isInteger(count) || count < 0 || count > max) throw new Error(`${part}: số câu đúng phải là số nguyên từ 0 đến ${max}.`);
  }
  const rawListening = Math.min(
    100,
    (partScores.part1 || 0) +
    (partScores.part2 || 0) +
    (partScores.part3 || 0) +
    (partScores.part4 || 0)
  );

  const rawReading = Math.min(
    100,
    (partScores.part5 || 0) +
    (partScores.part6 || 0) +
    (partScores.part7 || 0)
  );

  if (![SCORE_CONVERSION_VERSION, 'iibc-mock-2023-perfect-v2', 'iibc-mock-2023-lower-v1', 'legacy-reference-v1'].includes(version)) throw new Error('Bảng quy đổi không được hỗ trợ.');
  const scaledListening = version === 'legacy-reference-v1'
    ? LISTENING_CONVERSION_TABLE[rawListening]
    : version === 'iibc-mock-2023-lower-v1'
      ? getPublishedMockScoreRange('listening', rawListening).min
      : version === 'iibc-mock-2023-perfect-v2'
        ? getPracticeScoreRange('listening', rawListening).min
        : convertRawToListeningScore(rawListening);
  const scaledReading = version === 'legacy-reference-v1'
    ? READING_CONVERSION_TABLE[rawReading]
    : version === 'iibc-mock-2023-lower-v1'
      ? getPublishedMockScoreRange('reading', rawReading).min
      : version === 'iibc-mock-2023-perfect-v2'
        ? getPracticeScoreRange('reading', rawReading).min
        : convertRawToReadingScore(rawReading);
  const totalScore = scaledListening + scaledReading;

  return {
    rawListening,
    rawReading,
    scaledListening,
    scaledReading,
    totalScore
  };
}

// Giới hạn tối đa số câu hỏi mỗi Part
export const PART_MAX_QUESTIONS = {
  part1: 6,
  part2: 25,
  part3: 39,
  part4: 30,
  part5: 30,
  part6: 16,
  part7: 54
};

export const PART_NAMES = {
  part1: 'Part 1: Mô tả tranh (Photographs)',
  part2: 'Part 2: Hỏi & Đáp (Question-Response)',
  part3: 'Part 3: Hội thoại ngắn (Conversations)',
  part4: 'Part 4: Bài nói ngắn (Short Talks)',
  part5: 'Part 5: Điền câu (Incomplete Sentences)',
  part6: 'Part 6: Điền đoạn văn (Text Completion)',
  part7: 'Part 7: Đọc hiểu văn bản (Reading Comprehension)'
};

/**
 * Tính tỷ lệ chính xác (%) của từng Part
 */
export function calculatePartAccuracy(partScores: LRPartScore): Record<keyof LRPartScore, number> {
  return {
    part1: Math.round(((partScores.part1 || 0) / PART_MAX_QUESTIONS.part1) * 100),
    part2: Math.round(((partScores.part2 || 0) / PART_MAX_QUESTIONS.part2) * 100),
    part3: Math.round(((partScores.part3 || 0) / PART_MAX_QUESTIONS.part3) * 100),
    part4: Math.round(((partScores.part4 || 0) / PART_MAX_QUESTIONS.part4) * 100),
    part5: Math.round(((partScores.part5 || 0) / PART_MAX_QUESTIONS.part5) * 100),
    part6: Math.round(((partScores.part6 || 0) / PART_MAX_QUESTIONS.part6) * 100),
    part7: Math.round(((partScores.part7 || 0) / PART_MAX_QUESTIONS.part7) * 100)
  };
}

/**
 * Independent references through CEFR; these are not direct test-score conversions.
 * TOEIC cut scores apply separately to Listening and Reading, never to a total alone.
 */
export const SCORE_REFERENCE_SOURCES = {
  toeic: 'https://www.ets.org/pdfs/toeic/toeic-mapping-cefr-reference.pdf',
  ielts: 'https://www.britishcouncil.org.tr/exam/ielts/blog/know-your-english-level',
  ieltsLimits: 'https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr',
  toefl: 'https://www.ets.org/toefl/institutions/ibt/score-scale-update.html',
  vstep: 'https://vstep.vnu.edu.vn/the-administration-plan-for-vietnamese-standardized-test-of-english-proficiency-vstep-3-5-exam-date-on-14-december-2025/'
};
export interface InternationalConcordanceTier {
  minListening: number | null;
  minReading: number | null;
  toeicRange: string;
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  cefrLevelName: string;
  ielts: string;
  vstep: string;
  toeflIbt: string;
  toeflLegacy: string;
  badgeBg: string;
  badgeText: string;
}
export const CONCORDANCE_TIERS: InternationalConcordanceTier[] = [
  { minListening: 60, minReading: 60, toeicRange: '120đ', cefr: 'A1', cefrLevelName: 'Căn bản (Breakthrough)', ielts: '3.0', vstep: '—', toeflIbt: '1–1.5', toeflLegacy: '0–23', badgeBg: 'bg-slate-100 dark:bg-slate-800', badgeText: 'text-slate-600 dark:text-slate-400' },
  { minListening: 110, minReading: 115, toeicRange: '225đ', cefr: 'A2', cefrLevelName: 'Sơ cấp (Waystage)', ielts: '3.5', vstep: '—', toeflIbt: '2–2.5', toeflLegacy: '24–43', badgeBg: 'bg-amber-50 dark:bg-amber-950/40', badgeText: 'text-amber-700 dark:text-amber-400' },
  { minListening: 275, minReading: 275, toeicRange: '550đ', cefr: 'B1', cefrLevelName: 'Trung cấp (Threshold)', ielts: '4.0–5.0', vstep: 'Bậc 3', toeflIbt: '3–3.5', toeflLegacy: '44–71', badgeBg: 'bg-blue-50 dark:bg-blue-950/40', badgeText: 'text-blue-700 dark:text-blue-400' },
  { minListening: 400, minReading: 385, toeicRange: '785đ', cefr: 'B2', cefrLevelName: 'Trung cấp trên (Vantage)', ielts: '5.5–6.5', vstep: 'Bậc 4', toeflIbt: '4–4.5', toeflLegacy: '72–94', badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40', badgeText: 'text-indigo-700 dark:text-indigo-400' },
  { minListening: 490, minReading: 455, toeicRange: '945đ', cefr: 'C1', cefrLevelName: 'Cao cấp (Effective Operational)', ielts: '7.0–8.0', vstep: 'Bậc 5', toeflIbt: '5–5.5', toeflLegacy: '95–113', badgeBg: 'bg-purple-50 dark:bg-purple-950/40', badgeText: 'text-purple-700 dark:text-purple-400' },
  { minListening: null, minReading: null, toeicRange: '—', cefr: 'C2', cefrLevelName: 'Thành thạo (Mastery)', ielts: '8.5–9.0', vstep: '—', toeflIbt: '6', toeflLegacy: '114–120', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400' }
];
const validScaledScore = (score: number) => Number.isInteger(score) && score >= 5 && score <= 495;
export function getToeicSectionReference(skill: 'listening' | 'reading', score: number): InternationalConcordanceTier | null {
  if (!validScaledScore(score)) return null;
  const eligible = CONCORDANCE_TIERS.filter(tier => {
    const minimum = skill === 'listening' ? tier.minListening : tier.minReading;
    return minimum !== null && score >= minimum;
  });
  return eligible[eligible.length - 1] ?? null;
}
/** Conservative shared reference: both receptive skills must meet the row's thresholds. */
export function getConcordanceByToeic(listening: number, reading: number): InternationalConcordanceTier | null {
  if (!validScaledScore(listening) || !validScaledScore(reading)) return null;
  const eligible = CONCORDANCE_TIERS.filter(tier => tier.minListening !== null && tier.minReading !== null
    && listening >= tier.minListening && reading >= tier.minReading);
  return eligible[eligible.length - 1] ?? null;
}

/**
 * Lấy kết quả luyện từng Part của một buổi học.
 *
 * Các buổi ghi TRƯỚC khi có trường `practiceParts` lưu dữ liệu dưới dạng
 * chuỗi trong `notes`, ví dụ "(Part 5: Đúng 28/30 câu)". Hàm này đọc ngược
 * chuỗi đó để dữ liệu cũ vẫn vào được biểu đồ.
 *
 * Cố ý KHÔNG ghi đè dữ liệu gốc: đọc tới đâu suy ra tới đó, nên nếu chuỗi
 * cũ không khớp mẫu thì chỉ đơn giản là không có kết quả, không hỏng gì.
 */
export function getPracticeParts(session: {
  practiceParts?: PracticePartResult[];
  notes?: string;
}): PracticePartResult[] {
  if (session.practiceParts && session.practiceParts.length > 0) {
    return session.practiceParts;
  }

  if (!session.notes) return [];

  const legacyPattern = /Part\s*([1-7])\s*:\s*Đúng\s*(\d+)\s*\/\s*(\d+)/gi;
  const recovered: PracticePartResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = legacyPattern.exec(session.notes)) !== null) {
    const part = Number(match[1]) as PracticePartResult['part'];
    const correct = Number(match[2]);
    const total = Number(match[3]);
    if (total > 0 && correct >= 0 && correct <= total) {
      recovered.push({ part, correct, total });
    }
  }

  return recovered;
}

/** Tỷ lệ chính xác (%) của một buổi luyện Part lẻ, gộp mọi Part đã luyện */
export function getPracticeAccuracy(parts: PracticePartResult[]): number | null {
  if (parts.length === 0) return null;
  const correct = parts.reduce((acc, p) => acc + p.correct, 0);
  const total = parts.reduce((acc, p) => acc + p.total, 0);
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}
