import React, { useState, useMemo } from 'react';
import {
  convertRawToListeningScore,
  convertRawToReadingScore,
  getConcordanceByToeic,
  getPracticeScoreRange
} from '@/shared/domain/etsScoring';
import { StudySession } from '@/shared/types';
import { PhoneResources } from './PhoneResources';
import { convertTests } from '../lib/convert';

interface ResourcesViewProps {
  /** Toàn bộ buổi học, dùng để lấy số câu đúng của bài Full Test gần nhất làm điểm khởi tạo */
  sessions?: StudySession[];
  /** Mục tiêu điểm của người học; mặc định 990 nếu chưa đặt (SPEC mục 2.1) */
  targetScore?: number;
}

/** Quy đổi điểm on phones. Computers use ConvertPage (the passport book). */
export const ResourcesView: React.FC<ResourcesViewProps> = ({ sessions, targetScore }) => {
  const goal = Math.max(10, Math.min(990, targetScore || 990));

  // Bài Full Test gần nhất có đủ số câu đúng - dùng làm giá trị khởi tạo cho bộ quy đổi
  const latestFullTest = useMemo(() => convertTests(sessions)[0] ?? null, [sessions]);

  // Converter state: khởi tạo từ bài thi thật, vẫn cho phép chỉnh tay để thử nghiệm
  const [simulation, setSimulation] = useState<{ listening: number; reading: number } | null>(null);
  const rawListening = simulation?.listening ?? latestFullTest?.listening ?? 85;
  const rawReading = simulation?.reading ?? latestFullTest?.reading ?? 80;
  const setRawListening = (listening: number) => setSimulation({ listening, reading: rawReading });
  const setRawReading = (reading: number) => setSimulation({ listening: rawListening, reading });

  // Người dùng đã tự chỉnh số câu hay vẫn đang xem đúng kết quả bài thi gần nhất
  const isShowingRealResult = latestFullTest !== null && rawListening === latestFullTest.listening && rawReading === latestFullTest.reading;

  const scaledListening = convertRawToListeningScore(rawListening);
  const scaledReading = convertRawToReadingScore(rawReading);
  const concordance = getConcordanceByToeic(scaledListening, scaledReading);
  const listeningRange = getPracticeScoreRange('listening', rawListening);
  const readingRange = getPracticeScoreRange('reading', rawReading);

  return <PhoneResources rawListening={rawListening} rawReading={rawReading} onListening={setRawListening} onReading={setRawReading}
    scaledListening={scaledListening} scaledReading={scaledReading} total={scaledListening + scaledReading} rangeMax={listeningRange.max + readingRange.max}
    cefr={concordance?.cefr ?? 'Dưới A1'} goal={goal} onRestore={() => setSimulation(null)}
    restore={latestFullTest && !isShowingRealResult ? { listening: latestFullTest.listening, reading: latestFullTest.reading } : null} />;
};
