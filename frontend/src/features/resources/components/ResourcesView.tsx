import React, { useState, useMemo, useRef } from 'react';
import { 
  Calculator, 
  RotateCcw, 
  Award, 
  TableProperties, 
  ArrowRight,
  Target
} from 'lucide-react';
import { 
  convertRawToListeningScore, 
  convertRawToReadingScore,
  getConcordanceByToeic,
  CONCORDANCE_TIERS,
  getToeicSectionReference,
  getPracticeScoreRange,
  PRACTICE_SCORE_SOURCE,
  SCORE_REFERENCE_SOURCES
} from '@/shared/domain/etsScoring';
import { StudySession } from '@/shared/types';
import { ScoreSkillControl } from './ScoreSkillControl';
import { PhoneResources } from './PhoneResources';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';

interface ResourcesViewProps {
  /** Toàn bộ buổi học, dùng để lấy số câu đúng của bài Full Test gần nhất làm điểm khởi tạo */
  sessions?: StudySession[];
  /** Mục tiêu điểm của người học; mặc định 990 nếu chưa đặt (SPEC mục 2.1) */
  targetScore?: number;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({ sessions, targetScore }) => {
  const goal = Math.max(10, Math.min(990, targetScore || 990));
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [activeTab, setActiveTab] = useState<'calc' | 'matrix'>('calc');
  const matrixTabRef = useRef<HTMLButtonElement>(null);

  // Bài Full Test gần nhất có đủ số câu đúng - dùng làm giá trị khởi tạo cho bộ quy đổi
  const latestFullTest = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const candidates = sessions
      .filter(s => s.sessionType === 'FULL_TEST' && !s.deletedAt &&
        Number.isInteger(s.rawListening) && s.rawListening! >= 0 && s.rawListening! <= 100 &&
        Number.isInteger(s.rawReading) && s.rawReading! >= 0 && s.rawReading! <= 100)
      .sort((a, b) => {
        const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    return candidates[0] || null;
  }, [sessions]);

  // Converter state: khởi tạo từ bài thi thật, vẫn cho phép chỉnh tay để thử nghiệm
  const [simulation, setSimulation] = useState<{ listening: number; reading: number } | null>(null);
  const rawListening = simulation?.listening ?? latestFullTest?.rawListening ?? 85;
  const rawReading = simulation?.reading ?? latestFullTest?.rawReading ?? 80;
  const setRawListening = (listening: number) => setSimulation({ listening, reading: rawReading });
  const setRawReading = (reading: number) => setSimulation({ listening: rawListening, reading });

  // Người dùng đã tự chỉnh số câu hay vẫn đang xem đúng kết quả bài thi gần nhất
  const isShowingRealResult =
    latestFullTest !== null &&
    rawListening === latestFullTest.rawListening &&
    rawReading === latestFullTest.rawReading;

  const scaledListening = convertRawToListeningScore(rawListening);
  const scaledReading = convertRawToReadingScore(rawReading);
  const totalEstimated = scaledListening + scaledReading;
  const concordance = getConcordanceByToeic(scaledListening, scaledReading);
  const goalPercent = Math.min(100, Math.round((totalEstimated / goal) * 100));

  const resetToLatestTest = () => {
    if (latestFullTest && latestFullTest.rawListening !== undefined && latestFullTest.rawReading !== undefined) {
      setSimulation(null);
    }
  };

  const listeningRange = getPracticeScoreRange('listening', rawListening);
  const readingRange = getPracticeScoreRange('reading', rawReading);
  const listeningLevel = getToeicSectionReference('listening', scaledListening)?.cefr ?? 'Dưới A1';
  const readingLevel = getToeicSectionReference('reading', scaledReading)?.cefr ?? 'Dưới A1';

  if (isPhone) return <PhoneResources rawListening={rawListening} rawReading={rawReading} onListening={setRawListening} onReading={setRawReading}
    scaledListening={scaledListening} scaledReading={scaledReading} total={totalEstimated} rangeMax={listeningRange.max + readingRange.max}
    cefr={concordance?.cefr ?? 'Dưới A1'} goal={goal} onRestore={resetToLatestTest}
    restore={latestFullTest && !isShowingRealResult ? { listening: latestFullTest.rawListening!, reading: latestFullTest.rawReading! } : null} />;

  return (
    <div className="space-y-3.5 max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 pb-2">
      {/* 1. Thanh Tab Switcher & Thao Tác Tinh Gọn */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-1.5 bg-white dark:bg-[#121A2B] rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2.5px_2.5px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_#cbd5e1] shrink-0">
        
        {/* 2 Tab Chính: Máy tính & Bảng đối chiếu */}
        <div className="flex items-center flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-300 dark:border-slate-800">
          <button
            type="button"
            aria-pressed={activeTab === 'calc'}
            onClick={() => setActiveTab('calc')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-black text-xs transition cursor-pointer border-2 ${
              activeTab === 'calc'
                ? 'border-slate-900 bg-yellow-300 dark:bg-yellow-400 text-slate-950 shadow-[1.5px_1.5px_0px_#0f172a]'
                : 'border-transparent text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <Calculator className="w-4 h-4 stroke-[2.5]" />
            <span>Máy Tính Điểm Dự Phóng</span>
          </button>

          <button
            type="button"
            ref={matrixTabRef}
            aria-pressed={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-black text-xs transition cursor-pointer border-2 ${
              activeTab === 'matrix'
                ? 'border-slate-900 bg-yellow-300 dark:bg-yellow-400 text-slate-950 shadow-[1.5px_1.5px_0px_#0f172a]'
                : 'border-transparent text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <TableProperties className="w-4 h-4 stroke-[2.5]" />
            <span>Bảng Đối Chiếu Thang Điểm</span>
          </button>
        </div>

        {/* Nút khôi phục điểm từ bài thi gần nhất */}
        {latestFullTest && (
          <button
            type="button"
            onClick={resetToLatestTest}
            disabled={isShowingRealResult}
            className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 border-slate-900 dark:border-slate-700 transition flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none self-start sm:self-auto ${
              isShowingRealResult
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 opacity-90 cursor-default'
                : 'bg-emerald-200 dark:bg-emerald-500 hover:bg-emerald-300 text-slate-950 cursor-pointer'
            }`}
            title="Lấy số câu từ bài Full Test gần nhất"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Lấy từ bài thi:</span>
            <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold tabular-nums text-[11px] border border-slate-900">
              L: {latestFullTest.rawListening} • R: {latestFullTest.rawReading}
            </span>
          </button>
        )}
      </div>

      {/* ==================== TAB 1: MÁY TÍNH ĐIỂM DỰ PHÓNG ==================== */}
      {activeTab === 'calc' && <>
        <p className="text-xs text-slate-500 dark:text-slate-400">Ước tính thận trọng theo <a className="underline underline-offset-2" href={PRACTICE_SCORE_SOURCE} target="_blank" rel="noopener noreferrer">IIBC 2023</a>; 100/100 quy ước 495đ mỗi kỹ năng. Điểm ETS phụ thuộc từng đề.</p>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] p-4 sm:p-5 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">Số câu đúng dự phóng</h2>
            <ScoreSkillControl skill="listening" raw={rawListening} onChange={setRawListening} />
            <ScoreSkillControl skill="reading" raw={rawReading} onChange={setRawReading} />
          </div>
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] p-4 sm:p-5 flex flex-col gap-3">
            <section aria-label="Tổng điểm dự kiến" className="rounded-2xl border-2 border-slate-900 dark:border-slate-600 bg-amber-100/70 dark:bg-amber-950/30 p-3 text-center">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <h2>Tổng điểm dự kiến</h2>
                <span className="px-2 py-1 rounded-lg border border-slate-900 bg-teal-200 dark:bg-teal-400 text-slate-950">CEFR tham khảo: {concordance?.cefr ?? 'Dưới A1'}</span>
              </div>
              <p className="text-5xl sm:text-6xl font-black tabular-nums text-slate-950 dark:text-white my-3" data-testid="estimated-total">{totalEstimated}</p>
              <div className="flex justify-center items-center flex-wrap gap-2 text-xs font-extrabold tabular-nums">
                <span className="border border-slate-900 dark:border-slate-500 rounded-lg px-3 py-1.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200">Listening {scaledListening}</span>
                <span className="text-slate-500">+</span>
                <span className="border border-slate-900 dark:border-slate-500 rounded-lg px-3 py-1.5 bg-teal-100 dark:bg-teal-950 text-teal-950 dark:text-teal-200">Reading {scaledReading}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{rawListening === 100 && rawReading === 100 ? 'Đúng toàn bộ 200 câu' : <>Khoảng tham khảo: {totalEstimated}–{listeningRange.max + readingRange.max}đ</>}</p>
            </section>
            <section aria-label="Tiến độ mục tiêu" className="rounded-2xl border-2 border-slate-900 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-extrabold text-slate-900 dark:text-slate-100">
                <h2 className="flex items-center gap-2"><Target className="w-4 h-4 text-rose-500" aria-hidden="true" />Tiến độ mục tiêu</h2>
                <span className="tabular-nums"><strong className="text-amber-600 dark:text-amber-400">{totalEstimated}</strong> / {goal}đ ({goalPercent}%)</span>
              </div>
              <div role="progressbar" aria-label="Tiến độ theo điểm dự kiến" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPercent} className="h-3 rounded-full border-2 border-slate-900 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-400 motion-safe:transition-[width] motion-safe:duration-200" style={{ width: Math.min(100, totalEstimated / goal * 100) + '%' }} />
              </div>
              <div className="flex justify-between flex-wrap gap-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{totalEstimated >= goal ? 'Đã đạt mục tiêu dự kiến.' : <>Còn thiếu <strong className="text-slate-950 dark:text-white">{goal - totalEstimated} điểm</strong> tới mục tiêu.</>}</span>
                <span>Mục tiêu: {goal}đ</span>
              </div>
            </section>
            <section aria-label="Đối chiếu hai kỹ năng" className="space-y-2">
              <h2 className="text-xs font-extrabold text-slate-950 dark:text-white">Đối chiếu hai kỹ năng</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-600 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 text-center text-indigo-600 dark:text-indigo-300">
                  <h3 className="text-xs font-bold">Listening</h3>
                  <p className="mt-1 text-xl font-extrabold">{listeningLevel}</p>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-600 bg-teal-50 dark:bg-teal-950/40 p-2.5 text-center text-teal-700 dark:text-teal-300">
                  <h3 className="text-xs font-bold">Reading</h3>
                  <p className="mt-1 text-xl font-extrabold">{readingLevel}</p>
                </div>
              </div>
            </section>
            <button type="button" onClick={() => { setActiveTab('matrix'); matrixTabRef.current?.focus(); }} className="mt-auto w-full rounded-xl border border-slate-900 dark:border-slate-500 bg-white dark:bg-slate-900 py-2.5 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-300 flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"><span>Xem đối chiếu CEFR</span><ArrowRight className="w-4 h-4" aria-hidden="true" /></button>
          </div>
        </div>
      </>}

      {/* ==================== TAB 2: BẢNG ĐỐI CHIẾU THANG ĐIỂM ==================== */}
      {activeTab === 'matrix' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] space-y-4 flex-1 lg:h-[calc(100vh-205px)] lg:min-h-[480px] lg:max-h-[660px] flex flex-col justify-between min-h-0">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <div>
              <h3 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-[2.5]" />
                <span>Bảng Đối Chiếu Thang Điểm TOEIC Sang Khung Chuẩn Quốc Tế</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                Chỉ tham khảo, không quy đổi điểm chính thức hay xác nhận điều kiện đầu vào/đầu ra. Mốc tổng TOEIC cần đạt ngưỡng riêng của cả Listening và Reading; TOEIC L&R không đối chiếu C2.
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                Nguồn: <a href={SCORE_REFERENCE_SOURCES.toeic} target="_blank" rel="noopener noreferrer">ETS TOEIC</a> · <a href={SCORE_REFERENCE_SOURCES.ielts} target="_blank" rel="noopener noreferrer">British Council IELTS</a> · <a href={SCORE_REFERENCE_SOURCES.vstep} target="_blank" rel="noopener noreferrer">ULIS–VNU VSTEP</a> · <a href={SCORE_REFERENCE_SOURCES.toefl} target="_blank" rel="noopener noreferrer">ETS TOEFL</a>.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-amber-200 dark:bg-amber-950 text-amber-950 dark:text-amber-200 font-black text-xs border-2 border-slate-900 dark:border-slate-700 self-start sm:self-auto">
              👉 Điểm dự kiến: {totalEstimated}đ ({concordance?.cefr ?? 'Dưới A1'} tham khảo)
            </span>
          </div>

          <div className="overflow-x-auto flex-1 flex flex-col justify-center">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-black">
                  <th className="py-3 px-3.5">Mốc TOEIC tham khảo</th>
                  <th className="py-3 px-3.5">Khung CEFR</th>
                  <th className="py-3 px-3.5">IELTS Tham Khảo</th>
                  <th className="py-3 px-3.5">VSTEP.3–5</th>
                  <th className="py-3 px-3.5">TOEFL iBT (1–6)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold">
                {CONCORDANCE_TIERS.map((tier, idx) => {
                  const isCurrentTier = concordance !== null && tier.cefr === concordance.cefr;
                  return (
                    <tr 
                      key={idx}
                      className={`transition-colors duration-150 ${
                        isCurrentTier 
                          ? 'bg-amber-100/90 dark:bg-amber-950/60 font-black border-2 border-slate-900 dark:border-amber-400' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <td className="py-3 px-3.5 font-bold tabular-nums text-sm whitespace-nowrap text-slate-950 dark:text-white" title={tier.minListening !== null && tier.minReading !== null ? `Listening từ ${tier.minListening}đ và Reading từ ${tier.minReading}đ.` : 'TOEIC Listening & Reading không đối chiếu đến C2.'}>
                        <div className="flex items-center gap-2">
                          <span>{tier.toeicRange}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border border-slate-900 ${tier.badgeBg} ${tier.badgeText}`}>
                          {tier.cefr}
                        </span>{' '}
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 ml-1.5">
                          {tier.cefrLevelName}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-bold tabular-nums text-rose-700 dark:text-rose-400 whitespace-nowrap" title="Các khoảng gần đúng theo CEFR; có vùng giao thoa quanh band 5, 6.5 và 8.">
                        {tier.ielts}
                      </td>
                      <td className="py-3 px-3.5 font-black text-emerald-800 dark:text-emerald-400 whitespace-nowrap" title="VSTEP.3–5 chỉ đánh giá bậc 3/B1, bậc 4/B2, bậc 5/C1; dấu — là ngoài phạm vi bài thi.">
                        {tier.vstep}
                      </td>
                      <td className="py-3 px-3.5 font-bold tabular-nums text-blue-700 dark:text-blue-400 whitespace-nowrap" title={`Thang 1–6 từ 21/01/2026; tham khảo thang 0–120: ${tier.toeflLegacy}. Không dự đoán điểm TOEFL từ TOEIC.`}>
                        {tier.toeflIbt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ghi chú các mốc mục tiêu thực tế thường gặp - Viền đen 2px rõ nét, không đổ bóng */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 shrink-0">
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700">
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🎓</span>
                <span>Yêu Cầu Tốt Nghiệp ĐH</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Do từng trường quy định; không có mốc TOEIC chung.
              </div>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700">
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>💼</span>
                <span>Doanh Nghiệp Quốc Tế</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Theo vị trí tuyển dụng và yêu cầu của từng đơn vị.
              </div>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700">
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🌟</span>
                <span>Du Học & Giảng Dạy</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Theo chương trình; kiểm tra cả yêu cầu 4 kỹ năng.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
