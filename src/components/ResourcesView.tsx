import React, { useState, useMemo } from 'react';
import { 
  GraduationCap, 
  Calculator, 
  Clock, 
  CheckSquare, 
  AlertCircle, 
  Sparkles,
  Globe,
  Award,
  Mic
} from 'lucide-react';
import { 
  convertRawToListeningScore, 
  convertRawToReadingScore,
  getConcordanceByToeic,
  CONCORDANCE_TIERS
} from '../utils/etsScoring';
import { getCurrentRankTier } from '../utils/storage';
import { SpeakingWritingRoadmap } from './SpeakingWritingRoadmap';
import { StudySession } from '../types';

interface ResourcesViewProps {
  /** Toàn bộ buổi học, dùng để lấy số câu đúng của bài Full Test gần nhất làm điểm khởi tạo */
  sessions?: StudySession[];
  /** Mục tiêu điểm của người học; mặc định 990 nếu chưa đặt (SPEC mục 2.1) */
  targetScore?: number;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({ sessions, targetScore }) => {
  const goal = Math.max(10, Math.min(990, targetScore || 990));
  const [activeSubTab, setActiveSubTab] = useState<'converter' | 'pacing' | 'checklist' | 'traps' | 'sw'>('converter');

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
  const currentRank = getCurrentRankTier(totalEstimated);
  const concordance = getConcordanceByToeic(totalEstimated);

  // Checklist state stored in localStorage
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('toeic_exam_checklist_v1');
      return saved ? JSON.parse(saved) : {
        id_original: true,
        exam_slip: true,
        pencils_2b: false,
        eraser: false,
        dress_code: false,
        arrive_early: false,
        sleep_well: false,
        no_smartwatch: false
      };
    } catch {
      return {};
    }
  });

  const toggleChecklist = (id: string) => {
    const updated = { ...checklistItems, [id]: !checklistItems[id] };
    setChecklistItems(updated);
    localStorage.setItem('toeic_exam_checklist_v1', JSON.stringify(updated));
  };

  const completedChecklistCount = Object.values(checklistItems).filter(Boolean).length;
  const totalChecklistCount = 8;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="ui-card p-5 sm:p-6 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 text-white rounded-2xl relative overflow-hidden shadow-xl border border-blue-500/20">
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Cẩm Nang & Tài Liệu Chuẩn ETS 990</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Kho Chiến Thuật & Ma Trận Điểm Số ETS
          </h2>
          <p className="text-xs sm:text-sm text-blue-200/80 max-w-2xl">
            Tất cả công cụ quy đổi điểm chính xác, ma trận phân bổ thời gian từng Part, và checklist chuẩn bị ngày thi thực tế tại IIG.
          </p>
        </div>
      </div>

      {/* Sub Navigation Bar: Segmented Control Pill Bar */}
      <div className="p-1.5 bg-slate-200/60 dark:bg-slate-900/80 rounded-2xl border border-slate-300/80 dark:border-slate-800 inline-flex flex-wrap sm:flex-nowrap gap-1 w-full sm:w-auto shadow-2xs">
        <button
          onClick={() => setActiveSubTab('converter')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'converter'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Bảng Quy Đổi Điểm ETS</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pacing')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'pacing'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Chiến Thuật Phân Bổ Giờ</span>
        </button>

        <button
          onClick={() => setActiveSubTab('checklist')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'checklist'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Checklist Ngày Thi IIG</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeSubTab === 'checklist' 
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}>
            {completedChecklistCount}/{totalChecklistCount}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('traps')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'traps'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span>Top Bẫy Kinh Điển</span>
        </button>

        {/* Lộ trình S&W gộp về đây: là nội dung tham khảo tĩnh, chưa nối
            dữ liệu nào nên không xứng một mục điều hướng riêng (SPEC 3.2) */}
        <button
          onClick={() => setActiveSubTab('sw')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'sw'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Lộ Trình S&amp;W</span>
        </button>
      </div>

      {activeSubTab === 'sw' && <SpeakingWritingRoadmap />}

      {/* TAB 1: ETS SCORE CONVERTER */}
      {activeSubTab === 'converter' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Sliders & Controls */}
            <div className="lg:col-span-2 ui-card p-5 sm:p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Máy Tính Quy Đổi Raw Score Sang Scaled Score</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Kéo số câu đúng để xem điểm số thực tế dự phóng theo thuật toán ETS chuẩn.
                </p>
              </div>

              {/* Listening Slider */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Listening (100 câu)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rawListening}
                      onChange={e => setRawListening(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-14 text-center py-0.5 px-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-extrabold text-sm text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-400">câu</span>
                    <span className="text-slate-300 dark:text-slate-700">→</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">{scaledListening}đ</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={rawListening}
                  onChange={e => setRawListening(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                  <span>0 câu (5đ)</span>
                  <span>50 câu (260đ)</span>
                  <span>80 câu (450đ)</span>
                  <span>100 câu (495đ)</span>
                </div>
              </div>

              {/* Reading Slider */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Reading (100 câu)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rawReading}
                      onChange={e => setRawReading(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-14 text-center py-0.5 px-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-extrabold text-sm text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-400">câu</span>
                    <span className="text-slate-300 dark:text-slate-700">→</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">{scaledReading}đ</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={rawReading}
                  onChange={e => setRawReading(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                  <span>0 câu (5đ)</span>
                  <span>50 câu (250đ)</span>
                  <span>80 câu (415đ)</span>
                  <span>100 câu (495đ)</span>
                </div>
              </div>

              {/* Quick Summary Note */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
                <span className="font-bold">Quy luật quan trọng ETS: </span>
                Listening thường có độ "dễ thở" hơn Reading. Với Listening, sai khoảng 3-5 câu vẫn có cơ hội đạt trọn vẹn 495/495. Tuy nhiên với Reading, từ câu 90 trở đi điểm số siết rất chặt (chỉ 1 câu sai cũng có thể tụt từ 495 xuống 485-490).
              </div>
            </div>

            {/* Right 1 Col: Score Card Result */}
            <div className="ui-card p-6 flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Dự Phóng Tổng Điểm
                </span>
                <div className="text-5xl font-black text-slate-900 dark:text-white font-mono">
                  {totalEstimated}
                </div>
                <div className="flex items-center justify-center space-x-2 text-xs text-slate-500">
                  <span>L: {scaledListening}</span>
                  <span>+</span>
                  <span>R: {scaledReading}</span>
                </div>
              </div>

              {/* Rank Tier Card */}
              <div className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Bậc Danh Vọng</span>
                <p className="text-sm font-black text-blue-600 dark:text-blue-400">
                  {currentRank.title}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  {currentRank.description}
                </p>
              </div>

              {/* International Certificate Concordance Mini-Card */}
              <div className="w-full p-3.5 rounded-xl bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-purple-50/50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 border border-blue-200/80 dark:border-blue-900/50 space-y-2.5 text-left shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Quy Đổi Quốc Tế</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${concordance.badgeBg} ${concordance.badgeText}`}>
                    CEFR {concordance.cefr}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="p-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
                    <div className="text-[9px] uppercase font-bold text-slate-400">IELTS</div>
                    <div className="text-xs font-black text-rose-600 dark:text-rose-400">{concordance.ielts}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
                    <div className="text-[9px] uppercase font-bold text-slate-400">VSTEP</div>
                    <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">{concordance.vstep}</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
                    <div className="text-[9px] uppercase font-bold text-slate-400">TOEFL iBT</div>
                    <div className="text-xs font-black text-blue-600 dark:text-blue-400">{concordance.toeflIbt}</div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/50 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Chuẩn: </span>
                  {concordance.academicStandard}
                </div>
              </div>

              {/* Khoảng cách tới mục tiêu của người học */}
              <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
                {totalEstimated >= goal ? (
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <Sparkles className="w-4 h-4" />
                    {goal >= 990 ? 'Tuyệt đối 990/990!' : `Đã vượt mục tiêu ${goal}!`}
                  </span>
                ) : (
                  <span>Cách mục tiêu {goal}: <strong>+{goal - totalEstimated} điểm</strong></span>
                )}
              </div>
            </div>

          </div>

          {/* Dedicated International Concordance Matrix Table */}
          <div className="ui-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Bảng Ma Trận Quy Đổi Chứng Chỉ Quốc Tế Tương Đương</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Căn cứ Khung năng lực ngoại ngữ 6 bậc VN (Thông tư 01/2014/TT-BGDĐT) & tham chiếu quốc tế ETS / Cambridge.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 self-start sm:self-auto bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isShowingRealResult ? 'bg-blue-600 animate-pulse' : 'bg-slate-400'}`} />
                <span className="min-w-0 whitespace-nowrap truncate">
                  {isShowingRealResult ? (
                    <>Điểm gần nhất của bạn: <strong className="text-blue-600 dark:text-blue-400">{totalEstimated}đ TOEIC</strong></>
                  ) : (
                    <>Điểm thử: <strong className="text-blue-600 dark:text-blue-400">{totalEstimated}đ TOEIC</strong></>
                  )}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-900/30">
                    <th className="py-2.5 px-3 whitespace-nowrap">Thang Điểm TOEIC</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">CEFR Quốc Tế</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">IELTS Tương Đương</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">VSTEP (Bộ GD&ĐT)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">TOEFL iBT</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Chuẩn Học Thuật & Ứng Dụng Thực Tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {CONCORDANCE_TIERS.map((tier, idx) => {
                    const isCurrentTier = totalEstimated >= tier.minScore && totalEstimated <= tier.maxScore;
                    return (
                      <tr 
                        key={idx}
                        className={`transition-colors duration-150 ${
                          isCurrentTier 
                            ? 'bg-blue-50/90 dark:bg-blue-950/40 font-semibold text-slate-900 dark:text-white border-l-4 border-l-blue-600 shadow-2xs' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span className={`font-mono font-extrabold ${isCurrentTier ? 'text-blue-600 dark:text-blue-400 text-sm' : 'text-slate-900 dark:text-white'}`}>
                              {tier.toeicRange}
                            </span>
                            {isCurrentTier && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-600 text-white shadow-2xs whitespace-nowrap shrink-0">
                                {isShowingRealResult ? 'Bạn đang ở đây' : 'Mức đang thử'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${tier.badgeBg} ${tier.badgeText}`}>
                            {tier.cefr}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">
                            {tier.cefrLevelName}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                            {tier.ielts}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {tier.vstep}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">
                            ({tier.vstepTier})
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {tier.toeflIbt}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {tier.academicStandard}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed font-normal">
                            {tier.description}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý quy đổi:</strong> Bảng quy đổi chỉ mang tính chất tham khảo tương đương về năng lực ngôn ngữ tổng quát. Một số cơ quan, trường đại học hoặc chương trình học bổng nước ngoài có thể yêu cầu chứng chỉ chuyên biệt (như IELTS Academic hoặc TOEFL iBT 4 kỹ năng) theo quy định tuyển sinh riêng.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PACING STRATEGY */}
      {activeSubTab === 'pacing' && (
        <div className="space-y-4">
          <div className="ui-card p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Chiến Thuật Phân Bổ Thời Gian Chuẩn 990 (Pacing Matrix)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quy tắc vàng phân bổ 120 phút làm bài để không bao giờ bị cháy giờ Part 7.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Phần Thi (Part)</th>
                    <th className="py-2.5 px-3">Số Câu</th>
                    <th className="py-2.5 px-3">Thời Lượng Chuẩn</th>
                    <th className="py-2.5 px-3">Tốc Độ / Câu</th>
                    <th className="py-2.5 px-3">Chiến Thuật Cốt Lõi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">Part 1 (Photos)</td>
                    <td className="py-3 px-3">6 câu</td>
                    <td className="py-3 px-3 font-semibold text-blue-600 dark:text-blue-400">~3 phút</td>
                    <td className="py-3 px-3">Theo băng</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">Tận dụng thời gian đọc hướng dẫn để quan sát nhanh cả 6 tranh.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">Part 2 (Q&A)</td>
                    <td className="py-3 px-3">25 câu</td>
                    <td className="py-3 px-3 font-semibold text-blue-600 dark:text-blue-400">~9 phút</td>
                    <td className="py-3 px-3">Theo băng</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">Bắt từ để hỏi đầu tiên (Who, When, Where). Cảnh giác đáp án đồng âm.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">Part 3 (Conversations)</td>
                    <td className="py-3 px-3">39 câu (13 đoạn)</td>
                    <td className="py-3 px-3 font-semibold text-blue-600 dark:text-blue-400">~17 phút</td>
                    <td className="py-3 px-3">Theo băng</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">Bắt buộc đọc trước 3 câu hỏi trước khi loa phát đoạn hội thoại!</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">Part 4 (Short Talks)</td>
                    <td className="py-3 px-3">30 câu (10 đoạn)</td>
                    <td className="py-3 px-3 font-semibold text-blue-600 dark:text-blue-400">~16 phút</td>
                    <td className="py-3 px-3">Theo băng</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">Giữ nhịp: vừa nghe vừa tô đáp án, loa đọc câu hỏi thì đọc trước đoạn sau.</td>
                  </tr>
                  <tr className="bg-blue-50/40 dark:bg-blue-950/20">
                    <td className="py-3 px-3 font-bold text-blue-900 dark:text-blue-300">Part 5 (Incomplete)</td>
                    <td className="py-3 px-3 font-bold">30 câu</td>
                    <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">10 - 12 phút</td>
                    <td className="py-3 px-3 font-bold">20 - 25s / câu</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-200">Không bao giờ dừng lại ở 1 câu quá 40s. Câu nào không biết, loại trừ rồi chọn ngay!</td>
                  </tr>
                  <tr className="bg-blue-50/40 dark:bg-blue-950/20">
                    <td className="py-3 px-3 font-bold text-blue-900 dark:text-blue-300">Part 6 (Text Compl.)</td>
                    <td className="py-3 px-3 font-bold">16 câu (4 bài)</td>
                    <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">8 - 10 phút</td>
                    <td className="py-3 px-3 font-bold">30s / câu</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-200">Đọc câu trước và sau chỗ trống. Chú ý liên từ chuyển ý (However, Therefore).</td>
                  </tr>
                  <tr className="bg-purple-50/40 dark:bg-purple-950/20">
                    <td className="py-3 px-3 font-bold text-purple-900 dark:text-purple-300">Part 7 (Comprehension)</td>
                    <td className="py-3 px-3 font-bold">54 câu</td>
                    <td className="py-3 px-3 font-bold text-purple-600 dark:text-purple-400">53 - 55 phút</td>
                    <td className="py-3 px-3 font-bold">~55s / câu</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-200">Dành 25 phút bài đơn, 30 phút bài kép/ba. Tô trực tiếp vào phiếu trả lời.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEST DAY CHECKLIST */}
      {activeSubTab === 'checklist' && (
        <div className="space-y-4">
          <div className="ui-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                  <span>Checklist Chuẩn Bị Ngày Thi Tại IIG</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Kiểm tra kỹ các vật dụng bắt buộc để tránh bị hủy quyền thi vào ngày chính thức.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {completedChecklistCount} / {totalChecklistCount} Đã sẵn sàng
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {[
                { id: 'id_original', title: 'CCCD / Hộ Chiếu Bản Gốc', desc: 'Còn hạn sử dụng, không ép dẻo lại hoặc bong tróc.' },
                { id: 'exam_slip', title: 'Phiếu Đăng Ký Thi IIG', desc: 'Có đầy đủ dấu mộc đỏ và chữ ký của cán bộ đăng ký.' },
                { id: 'pencils_2b', title: 'Bút Chì Gỗ 2B', desc: 'IIG sẽ phát bút chì tại phòng, nhưng nên tập làm quen lực tô ở nhà.' },
                { id: 'eraser', title: 'Gôm Tẩy Mềm Sạch', desc: 'Không làm lem bẩn Answer Sheet khi tẩy sửa.' },
                { id: 'dress_code', title: 'Trang Phục Lịch Sự', desc: 'Áo có tay, quần dài (quy định bắt buộc khi vào phòng thi IIG).' },
                { id: 'arrive_early', title: 'Đến Sớm Trước 45 Phút', desc: 'Để làm thủ tục an ninh, gửi đồ cá nhân và quét sinh trắc học.' },
                { id: 'sleep_well', title: 'Ngủ Đủ 7-8 Tiếng', desc: 'Bộ não tỉnh táo tối đa cho 2 tiếng tập trung cao độ.' },
                { id: 'no_smartwatch', title: 'Không Đeo Đồng Hồ / Thiết Bị Điện Tử', desc: 'Tuyệt đối không mang điện thoại hoặc đồng hồ thông minh vào phòng thi.' }
              ].map(item => {
                const isChecked = !!checklistItems[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklist(item.id)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start space-x-3 select-none ${
                      isChecked
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                        : 'bg-white dark:bg-[#121A2B] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <p className={`font-bold ${isChecked ? 'line-through text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {completedChecklistCount === totalChecklistCount && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Tuyệt vời! Toàn bộ 8/8 hành trang đã sẵn sàng. Chúc bạn tự tin bước vào phòng thi và đạt điểm tối đa!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TOP TRAPS */}
      {activeSubTab === 'traps' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Tổng hợp các bẫy điểm số phân hóa cao nhất trong đề thi ETS thật:
            </span>
          </div>

          <div className="space-y-3">
            {[
              {
                id: 'trap-1',
                title: 'Bẫy 1: Từ đồng âm / Gần âm (Similar-sounding Words)',
                part: 'Part 1 & 2',
                example: 'Nghe "coffee" nhưng băng nói "copy"; nghe "department" nhưng băng nói "departure".',
                solution: 'Quy tắc: Đáp án nào phát âm giống hệt hoặc gần giống từ khóa trong câu hỏi Part 2 thì 90% là BẪY!'
              },
              {
                id: 'trap-2',
                title: 'Bẫy 2: Câu trả lời gián tiếp hoặc né tránh (Indirect Responses)',
                part: 'Part 2',
                example: '"Where is the finance report?" -> Đáp án đúng: "Mr. Lee is handling that" (Không trực tiếp nói vị trí).',
                solution: 'Đáp án không bắt buộc phải chứa "Yes/No" hoặc địa điểm cụ thể. Luôn hiểu ngữ cảnh giao tiếp thực tế.'
              },
              {
                id: 'trap-3',
                title: 'Bẫy 3: Đổi ý vào phút chót (Last-minute Changes)',
                part: 'Part 3 & 4',
                example: '"We were supposed to launch on Friday, but the director just rescheduled to Monday next week."',
                solution: 'Luôn lắng nghe đến hết câu cuối cùng khi có các từ nối quay xe: "but", "however", "actually", "change my mind".'
              },
              {
                id: 'trap-4',
                title: 'Bẫy 4: Đảo ngữ & Mệnh đề quan hệ rút gọn',
                part: 'Part 5 & 6',
                example: '"Only after the audit ______ the funds be released" -> (will / can - đảo trợ động từ lên trước).',
                solution: 'Khi thấy từ phủ định đứng đầu câu (Seldom, Rarely, Never, Only after...), lập tức tìm cấu trúc đảo ngữ.'
              },
              {
                id: 'trap-5',
                title: 'Bẫy 5: Từ vựng đa nghĩa trong ngữ cảnh công sở (Polysemy)',
                part: 'Part 5 & 7',
                example: '"Address" = giải quyết vấn đề (không phải địa chỉ); "compromise" = làm tổn hại chất lượng (không phải thỏa hiệp).',
                solution: 'Học từ vựng theo cụm Collocation và ngữ cảnh thương mại (business settings).'
              },
              {
                id: 'trap-6',
                title: 'Bẫy 6: Bẫy thời gian & Cập nhật hoãn hủy Part 7',
                part: 'Part 7',
                example: 'Email đầu nói sự kiện tổ chức vào ngày 15, nhưng email cập nhật phía dưới hoãn sang ngày 22.',
                solution: 'Với bài đọc Kép và Ba đoạn, luôn đọc kỹ các cập nhật (updates/amendments/P.S.) ở văn bản cuối cùng.'
              }
            ].map(trap => (
              <div key={trap.id} className="ui-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{trap.title}</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {trap.part}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <strong>Ví dụ: </strong>{trap.example}
                </p>
                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-[11.5px] text-emerald-900 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-900/30">
                  <strong>Cách xử lý: </strong>{trap.solution}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
