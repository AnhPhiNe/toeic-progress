import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  RotateCcw, 
  Award, 
  TableProperties, 
  ArrowRight,
  Headphones,
  BookOpen,
  Minus,
  Plus,
  Sparkles
} from 'lucide-react';
import { 
  convertRawToListeningScore, 
  convertRawToReadingScore,
  getConcordanceByToeic,
  CONCORDANCE_TIERS
} from '@/shared/domain/etsScoring';
import { StudySession } from '@/shared/types';

const LISTENING_MILESTONES = [30,50,70,85,100].map(raw => ({ raw, score:convertRawToListeningScore(raw), label:`${raw} câu` }));
const READING_MILESTONES = [30,50,70,80,100].map(raw => ({ raw, score:convertRawToReadingScore(raw), label:`${raw} câu` }));

function getListeningDiagnostic(raw: number) {
  if (raw >= 90) return { level: 'C1 – C2 (Xuất sắc)', badge: 'bg-emerald-300 dark:bg-emerald-400 text-slate-950', desc: 'Nắm bắt trọn vẹn ngữ điệu, thành ngữ & suy luận ngụ ý khó Part 3–4.' };
  if (raw >= 75) return { level: 'B2 (Khá tốt)', badge: 'bg-indigo-200 dark:bg-indigo-300 text-slate-950', desc: 'Phản xạ Part 1–2 nhạy bén, hiểu ý chính tốt, cần tránh bẫy paraphrase.' };
  if (raw >= 50) return { level: 'B1 (Trung cấp)', badge: 'bg-amber-200 dark:bg-amber-300 text-slate-950', desc: 'Hiểu tình huống quen thuộc, dễ mất dấu khi bài nghe nói nhanh hoặc nối âm.' };
  return { level: 'A1 – A2 (Căn bản)', badge: 'bg-rose-200 dark:bg-rose-300 text-slate-950', desc: 'Cần bổ sung phát âm chuẩn IPA và rèn phản xạ câu hỏi ngắn Part 2.' };
}

function getReadingDiagnostic(raw: number) {
  if (raw >= 90) return { level: 'C1 – C2 (Xuất sắc)', badge: 'bg-emerald-300 dark:bg-emerald-400 text-slate-950', desc: 'Tốc độ đọc quét cao, xử lý chính xác bài đọc 3 đoạn (Triple Passages).' };
  if (raw >= 75) return { level: 'B2 (Khá tốt)', badge: 'bg-teal-200 dark:bg-teal-300 text-slate-950', desc: 'Vững ngữ pháp Part 5–6, cần phân bổ thời gian đều để không đuối ở Part 7.' };
  if (raw >= 50) return { level: 'B1 (Trung cấp)', badge: 'bg-amber-200 dark:bg-amber-300 text-slate-950', desc: 'Làm tốt câu ngữ pháp cơ bản, vốn từ đọc hiểu bài dài Part 7 cần trau dồi.' };
  return { level: 'A1 – A2 (Căn bản)', badge: 'bg-rose-200 dark:bg-rose-300 text-slate-950', desc: 'Cần củng cố từ loại, thì động từ và từ vựng cốt lõi thường gặp.' };
}

interface ResourcesViewProps {
  /** Toàn bộ buổi học, dùng để lấy số câu đúng của bài Full Test gần nhất làm điểm khởi tạo */
  sessions?: StudySession[];
  /** Mục tiêu điểm của người học; mặc định 990 nếu chưa đặt (SPEC mục 2.1) */
  targetScore?: number;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({ sessions, targetScore }) => {
  const goal = Math.max(10, Math.min(990, targetScore || 990));
  const [activeTab, setActiveTab] = useState<'calc' | 'matrix'>('calc');

  // Bài Full Test gần nhất có đủ số câu đúng - dùng làm giá trị khởi tạo cho bộ quy đổi
  const latestFullTest = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const candidates = sessions
      .filter(s => s.sessionType === 'FULL_TEST' && s.rawListening !== undefined && s.rawReading !== undefined)
      .sort((a, b) => {
        const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    return candidates[0] || null;
  }, [sessions]);

  // Converter state: khởi tạo từ bài thi thật, vẫn cho phép chỉnh tay để thử nghiệm
  const [rawListening, setRawListening] = useState<number>(latestFullTest?.rawListening ?? 85);
  const [rawReading, setRawReading] = useState<number>(latestFullTest?.rawReading ?? 80);

  // Người dùng đã tự chỉnh số câu hay vẫn đang xem đúng kết quả bài thi gần nhất
  const isShowingRealResult =
    latestFullTest !== null &&
    rawListening === latestFullTest.rawListening &&
    rawReading === latestFullTest.rawReading;

  const scaledListening = convertRawToListeningScore(rawListening);
  const scaledReading = convertRawToReadingScore(rawReading);
  const totalEstimated = scaledListening + scaledReading;
  const concordance = getConcordanceByToeic(totalEstimated);
  const goalPercent = Math.min(100, Math.round((totalEstimated / goal) * 100));

  const resetToLatestTest = () => {
    if (latestFullTest && latestFullTest.rawListening !== undefined && latestFullTest.rawReading !== undefined) {
      setRawListening(latestFullTest.rawListening);
      setRawReading(latestFullTest.rawReading);
    }
  };

  const listeningDiag = getListeningDiagnostic(rawListening);
  const readingDiag = getReadingDiagnostic(rawReading);

  return (
    <div className="space-y-3.5 max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 pb-2">
      {/* 1. Thanh Tab Switcher & Thao Tác Tinh Gọn */}
      <div className="flex items-center justify-between gap-3 p-1.5 bg-white dark:bg-[#121A2B] rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2.5px_2.5px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_#cbd5e1] shrink-0">
        
        {/* 2 Tab Chính: Máy tính & Bảng đối chiếu */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-300 dark:border-slate-800">
          <button
            type="button"
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
      {activeTab === 'calc' && <p className="text-xs text-slate-500 dark:text-slate-400">Điểm dưới đây chỉ là ước tính theo bảng tham khảo của app, chưa được hiệu chuẩn cho từng đề. Ưu tiên bảng điểm hoặc kết quả từ nguồn đề; không phải điểm chính thức do ETS chấm.</p>}
      {activeTab === 'calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 lg:h-[calc(100vh-205px)] lg:min-h-[480px] lg:max-h-[660px] min-h-0">
          
          {/* Cột Trái (7 cols): Gọn gàng, tinh giản chữ thừa, tập trung vào thao tác */}
          <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] flex flex-col justify-between h-full min-h-0 space-y-3.5">
            
            {/* Header: Tinh gọn, không chữ thừa, không nhãn lặp */}
            <div className="flex items-center justify-between shrink-0">
              <span className="text-sm font-black uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Số Câu Đúng Dự Phóng</span>
              </span>
            </div>

            {/* Listening Block: Viền đen 2px rõ nét, KHÔNG đổ bóng, chữ tinh gọn */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 space-y-3">
              
              {/* Header: Tên kỹ năng + Cấp độ + Bộ tăng giảm câu + Huy hiệu điểm */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center border-2 border-slate-900 dark:border-slate-700 shrink-0">
                    <Headphones className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-950 dark:text-white">Listening</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">(Part 1–4)</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border border-slate-900 ${listeningDiag.badge}`}>
                      {listeningDiag.level}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Stepper Buttons: Viền đen 2px rõ nét, không đổ bóng, font đồng bộ */}
                  <div className="flex items-center border-2 border-slate-900 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setRawListening(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 flex items-center justify-center text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 font-black cursor-pointer active:bg-slate-200 transition"
                      title="Giảm 1 câu"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rawListening}
                      onChange={e => setRawListening(Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))))}
                      className="w-10 text-center font-extrabold tabular-nums text-sm text-indigo-700 dark:text-indigo-300 bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setRawListening(prev => Math.min(100, prev + 1))}
                      className="w-7 h-7 flex items-center justify-center text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 font-black cursor-pointer active:bg-slate-200 transition"
                      title="Tăng 1 câu"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-indigo-200 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200 font-extrabold tabular-nums text-sm border-2 border-slate-900 dark:border-slate-700">
                    {scaledListening}đ
                  </span>
                </div>
              </div>

              {/* Slider tương tác */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={rawListening}
                  onChange={e => setRawListening(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 border border-slate-900"
                />
              </div>

              {/* Hàng nút bấm chọn nhanh các mốc điểm chuẩn: 2 hàng rõ ràng, không rối chữ */}
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                {LISTENING_MILESTONES.map(m => {
                  const isSelected = rawListening === m.raw;
                  return (
                    <button
                      key={m.raw}
                      type="button"
                      onClick={() => setRawListening(m.raw)}
                      className={`flex-1 py-1.5 px-1 rounded-xl transition cursor-pointer text-center border-2 border-slate-900 dark:border-slate-700 flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title={`Chọn nhanh ${m.raw} câu đúng (~${m.score}đ)`}
                    >
                      <span className="text-xs font-black tabular-nums">{m.raw} câu</span>
                      <span className={`text-[10px] font-bold tabular-nums ${isSelected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {m.score}đ
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Chỉ số nhanh gọn gàng thay cho đoạn văn dài dòng */}
              <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800/80 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Sai tối đa: <strong className="text-slate-950 dark:text-white font-black">{100 - rawListening} câu</strong></span>
                <span>Tỉ lệ thang điểm: <strong className="text-indigo-700 dark:text-indigo-400 font-black">{Math.round((scaledListening / 495) * 100)}%</strong></span>
              </div>

            </div>

            {/* Reading Block: Viền đen 2px rõ nét, KHÔNG đổ bóng, chữ tinh gọn */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 space-y-3">
              
              {/* Header: Tên kỹ năng + Cấp độ + Bộ tăng giảm câu + Huy hiệu điểm */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center border-2 border-slate-900 dark:border-slate-700 shrink-0">
                    <BookOpen className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-950 dark:text-white">Reading</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">(Part 5–7)</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border border-slate-900 ${readingDiag.badge}`}>
                      {readingDiag.level}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Stepper Buttons: Viền đen 2px rõ nét, không đổ bóng, font đồng bộ */}
                  <div className="flex items-center border-2 border-slate-900 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setRawReading(prev => Math.max(0, prev - 1))}
                      className="w-7 h-7 flex items-center justify-center text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 font-black cursor-pointer active:bg-slate-200 transition"
                      title="Giảm 1 câu"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rawReading}
                      onChange={e => setRawReading(Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))))}
                      className="w-10 text-center font-extrabold tabular-nums text-sm text-teal-700 dark:text-teal-300 bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setRawReading(prev => Math.min(100, prev + 1))}
                      className="w-7 h-7 flex items-center justify-center text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 font-black cursor-pointer active:bg-slate-200 transition"
                      title="Tăng 1 câu"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-teal-200 dark:bg-teal-950 text-teal-950 dark:text-teal-200 font-extrabold tabular-nums text-sm border-2 border-slate-900 dark:border-slate-700">
                    {scaledReading}đ
                  </span>
                </div>
              </div>

              {/* Slider tương tác */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={rawReading}
                  onChange={e => setRawReading(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-600 border border-slate-900"
                />
              </div>

              {/* Hàng nút bấm chọn nhanh các mốc điểm chuẩn: 2 hàng rõ ràng, không rối chữ */}
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                {READING_MILESTONES.map(m => {
                  const isSelected = rawReading === m.raw;
                  return (
                    <button
                      key={m.raw}
                      type="button"
                      onClick={() => setRawReading(m.raw)}
                      className={`flex-1 py-1.5 px-1 rounded-xl transition cursor-pointer text-center border-2 border-slate-900 dark:border-slate-700 flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-teal-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title={`Chọn nhanh ${m.raw} câu đúng (~${m.score}đ)`}
                    >
                      <span className="text-xs font-black tabular-nums">{m.raw} câu</span>
                      <span className={`text-[10px] font-bold tabular-nums ${isSelected ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {m.score}đ
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Chỉ số nhanh gọn gàng thay cho đoạn văn dài dòng */}
              <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800/80 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Sai tối đa: <strong className="text-slate-950 dark:text-white font-black">{100 - rawReading} câu</strong></span>
                <span>Tỉ lệ thang điểm: <strong className="text-teal-700 dark:text-teal-400 font-black">{Math.round((scaledReading / 495) * 100)}%</strong></span>
              </div>

            </div>

          </div>

          {/* Cột Phải (5 cols): Điểm số & Chứng chỉ mở rộng đầy đủ, thanh thoát */}
          <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] flex flex-col justify-between h-full min-h-0 space-y-3.5">
            
            {/* 1. Score Hero Display: Viền đen 2px rõ nét, KHÔNG đổ bóng lồng, font đồng bộ */}
            <div className="p-4 sm:p-4.5 rounded-2xl bg-amber-100/70 dark:bg-slate-900/80 border-2 border-slate-900 dark:border-slate-700 text-center space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Tổng Điểm Dự Kiến
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-300 dark:bg-emerald-500 text-slate-950 font-black text-xs border border-slate-900">
                  CEFR {concordance.cefr}
                </span>
              </div>

              <div className="text-6xl sm:text-7xl font-black tabular-nums text-slate-950 dark:text-white tracking-tight leading-none py-1">
                {totalEstimated}
              </div>

              <div className="flex justify-center items-center gap-2.5 text-xs font-bold tabular-nums">
                <span className="px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-200 border-2 border-slate-900 dark:border-slate-700">
                  Listening: {scaledListening}đ
                </span>
                <span className="text-slate-900 dark:text-white font-black text-sm">+</span>
                <span className="px-3 py-1 rounded-lg bg-teal-100 dark:bg-teal-950/80 text-teal-950 dark:text-teal-200 border-2 border-slate-900 dark:border-slate-700">
                  Reading: {scaledReading}đ
                </span>
              </div>
            </div>

            {/* 2. Khung Tiến Độ Mục Tiêu Riêng Biệt - Lấp đầy khoảng trống hài hòa */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Tiến Độ Mục Tiêu</span>
                </span>
                <span className="tabular-nums">
                  <strong className="text-amber-600 dark:text-amber-400 font-black text-sm">{totalEstimated}</strong> / {goal}đ ({goalPercent}%)
                </span>
              </div>

              <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 overflow-hidden">
                <div 
                  className="h-full bg-amber-400 dark:bg-amber-500 border-r-2 border-slate-900 transition-all duration-300" 
                  style={{ width: `${goalPercent}%` }}
                />
              </div>

              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between pt-0.5">
                {totalEstimated >= goal ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-black flex items-center gap-1">
                    <span>✓</span>
                    <span>Đã đạt mục tiêu (+{totalEstimated - goal} điểm)</span>
                  </span>
                ) : (
                  <span>
                    Còn thiếu <strong className="text-slate-950 dark:text-white font-black">+{goal - totalEstimated} điểm</strong> để về đích
                  </span>
                )}
                <span className="text-[10px] text-slate-500 font-bold">Mục tiêu: {goal}đ</span>
              </div>
            </div>

            {/* 3. International Equivalent Cards: Viền đen 2px rõ nét, KHÔNG đổ bóng lồng */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-black uppercase text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Chứng Chỉ Tương Đương</span>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-center space-y-0.5">
                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase">IELTS</div>
                  <div className="font-extrabold tabular-nums text-lg text-rose-700 dark:text-rose-400">
                    {concordance.ielts}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500">Academic</div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-center space-y-0.5">
                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase">VSTEP</div>
                  <div className="font-extrabold text-lg text-emerald-800 dark:text-emerald-400">
                    {concordance.vstep}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500">Bộ GD&ĐT</div>
                </div>

                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-center space-y-0.5">
                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase">TOEFL iBT</div>
                  <div className="font-extrabold tabular-nums text-lg text-blue-700 dark:text-blue-400">
                    {concordance.toeflIbt}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500">Điểm ETS</div>
                </div>

              </div>

              {/* Quick link sang tab bảng tra cứu: Nút bấm tương tác có bóng đổ xúc giác */}
              <div className="text-center pt-0.5">
                <button 
                  type="button"
                  onClick={() => setActiveTab('matrix')} 
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 text-xs font-black text-indigo-700 dark:text-indigo-300 shadow-[1.5px_1.5px_0px_#0f172a] flex items-center justify-center gap-2 cursor-pointer transition active:translate-x-0.5 active:translate-y-0.5"
                >
                  <span>Xem bảng đối chiếu CEFR chi tiết</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

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
                Tham chiếu tương đương giữa TOEIC (2 kỹ năng), CEFR, IELTS, VSTEP (Bộ GD&ĐT) và TOEFL iBT.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-amber-200 dark:bg-amber-950 text-amber-950 dark:text-amber-200 font-black text-xs border-2 border-slate-900 dark:border-slate-700 self-start sm:self-auto">
              👉 Mức điểm của bạn: {totalEstimated}đ ({concordance.cefr})
            </span>
          </div>

          <div className="overflow-x-auto flex-1 flex flex-col justify-center">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-black">
                  <th className="py-3 px-3.5">Thang Điểm TOEIC</th>
                  <th className="py-3 px-3.5">Khung CEFR</th>
                  <th className="py-3 px-3.5">IELTS Tương Đương</th>
                  <th className="py-3 px-3.5">VSTEP (Bộ GD&ĐT)</th>
                  <th className="py-3 px-3.5">TOEFL iBT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold">
                {CONCORDANCE_TIERS.map((tier, idx) => {
                  const isCurrentTier = totalEstimated >= tier.minScore && totalEstimated <= tier.maxScore;
                  return (
                    <tr 
                      key={idx}
                      className={`transition-colors duration-150 ${
                        isCurrentTier 
                          ? 'bg-amber-100/90 dark:bg-amber-950/60 font-black border-2 border-slate-900 dark:border-amber-400' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <td className="py-3 px-3.5 font-bold tabular-nums text-sm whitespace-nowrap text-slate-950 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{tier.toeicRange}</span>
                          {isCurrentTier && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-400 text-slate-950 font-black text-[10px] border border-slate-900">
                              👉 Điểm hiện tại ({totalEstimated}đ)
                            </span>
                          )}
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
                      <td className="py-3 px-3.5 font-bold tabular-nums text-rose-700 dark:text-rose-400 whitespace-nowrap">
                        {tier.ielts}
                      </td>
                      <td className="py-3 px-3.5 font-black text-emerald-800 dark:text-emerald-400 whitespace-nowrap">
                        {tier.vstep}
                      </td>
                      <td className="py-3 px-3.5 font-bold tabular-nums text-blue-700 dark:text-blue-400 whitespace-nowrap">
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
                <span>Chuẩn Tốt Nghiệp ĐH</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Bậc 3 (B1) • 450 – 550+ TOEIC
              </div>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700">
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>💼</span>
                <span>Doanh Nghiệp Quốc Tế</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Bậc 4 (B2) • 600 – 780+ TOEIC
              </div>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700">
              <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🌟</span>
                <span>Du Học & Giảng Dạy</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                Bậc 5 (C1) • 785 – 990 TOEIC
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
