import { LRPartScore } from '../types';

/**
 * Bảng ma trận quy đổi điểm Raw Score (0 - 100) sang Scaled Score (5 - 495)
 * Dựa theo thang đo chuẩn thống kê của ETS quốc tế.
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
 * Quy đổi số câu đúng Listening sang Scaled Score
 */
export function convertRawToListeningScore(raw: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(raw)));
  return LISTENING_CONVERSION_TABLE[clamped];
}

/**
 * Quy đổi số câu đúng Reading sang Scaled Score
 */
export function convertRawToReadingScore(raw: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(raw)));
  return READING_CONVERSION_TABLE[clamped];
}

/**
 * Tính toán tổng số câu đúng và điểm chuẩn từ chi tiết Part 1 - 7
 */
export function calculateFromPartScores(partScores: LRPartScore) {
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

  const scaledListening = convertRawToListeningScore(rawListening);
  const scaledReading = convertRawToReadingScore(rawReading);
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
