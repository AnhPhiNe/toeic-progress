import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Timer, 
  BookOpen, 
  CalendarDays, 
  RefreshCw, 
  AlertCircle,
  Lightbulb,
  Search
} from 'lucide-react';
import type { MistakeEntry, ReadingPartType, StudySession } from '@/shared/types';
import type { AttemptAnalysisReport } from '../services/attemptAnalysis';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { triggerHaptic } from '@/shared/lib/haptics';
import { ContainerScrollCue } from '@/shared/components/ScrollCue';
import { PHONE_SHEET_PANEL, PHONE_SHEET_BACKDROP, PHONE_SHEET_FOOTER } from '@/shared/ui/surfaces';

interface AttemptAdviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  attempt: StudySession | null;
  report: AttemptAnalysisReport | null;
  busy: boolean;
  error: string;
  cacheNotice: string;
  cacheSaved: boolean;
  stale: boolean;
  owner: string | null;
  consent: boolean;
  setConsent: (value: boolean) => void;
  onGenerate: () => void;
  linkedNotes: MistakeEntry[];
  onNavigateToMistakes?: (sources?: string[]) => void;
  onNavigateToTimer?: (part?: ReadingPartType) => void;
  onNavigateToPlan?: () => void;
}

export function AttemptAdviceModal({
  isOpen,
  onClose,
  attempt,
  report,
  busy,
  error,
  cacheNotice,
  cacheSaved,
  stale,
  owner,
  consent,
  setConsent,
  onGenerate,
  linkedNotes,
  onNavigateToMistakes,
  onNavigateToTimer,
  onNavigateToPlan
}: AttemptAdviceModalProps) {
  const modalRef = useModalA11y(isOpen, onClose);
  const bodyRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !attempt) return null;

  // Tổng hợp nhận xét tổng quan dựa trên điểm số
  const getOverallVerdict = () => {
    const l = attempt.scaledListening;
    const r = attempt.scaledReading;
    if (l !== undefined && r !== undefined) {
      if (l >= 450 && r >= 450) {
        return `Phong độ xuất sắc toàn diện! Bạn đạt ${l}/495 Listening và ${r}/495 Reading. Các câu sai chủ yếu là bẫy phân loại nâng cao, hãy đối chiếu chi tiết từng câu dưới đây để đạt mốc điểm tuyệt đối.`;
      }
      if (l >= 450 && r < 420) {
        return `Kỹ năng Nghe đạt phong độ cực kỳ vững vàng (${l}/495 điểm). Toàn bộ trọng tâm cải thiện nên dồn vào kỹ năng Đọc (${r}/495 điểm), đặc biệt là phân bổ thời gian cho Part 7 để bứt phá điểm tổng.`;
      }
      if (r >= 450 && l < 420) {
        return `Kỹ năng Đọc rất tốt (${r}/495 điểm). Điểm mất tập trung ở kỹ năng Nghe (${l}/495 điểm), cần ưu tiên luyện nghe bắt nhịp từ đồng nghĩa và phản xạ 8 giây giữa các câu hỏi.`;
      }
    }
    return `Báo cáo phân tích chuyên sâu các bẫy ETS và thói quen làm bài của bạn ở lần thi ${attempt.testName}. Dưới đây là các Part cần ưu tiên khắc phục nhất để cải thiện điểm số.`;
  };

  const handleAction = (callback?: () => void) => {
    triggerHaptic(8);
    onClose();
    callback?.();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 animate-backdrop ${PHONE_SHEET_BACKDROP}`}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-advice-modal-title"
        className={`flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-slate-100 dark:shadow-[4px_4px_0_0_#cbd5e1] animate-sheet-up sm:animate-modal-pop ${PHONE_SHEET_PANEL}`}
      >
        {/* Header Modal */}
        <header className="flex shrink-0 items-center justify-between border-b-2 border-slate-900 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-[#162137]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-indigo-600 text-white shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none">
              <Sparkles className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="ai-advice-modal-title" className="text-base font-black text-slate-950 dark:text-white truncate">
                  Chẩn đoán & Gợi ý ôn tập
                </h3>
                <span className="rounded-md bg-slate-200 border border-slate-300 px-1.5 py-0.5 text-[10.5px] font-black text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  {attempt.testName} {attempt.attemptNumber ? `· Lần ${attempt.attemptNumber}` : ''}
                </span>
                {report && cacheSaved && (
                  <span className="rounded-md bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300">
                    Đã lưu trên máy
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Tổng điểm: <strong className="text-slate-900 dark:text-white">{attempt.totalScore ?? '—'}/990</strong>
                {report ? ` · Dựa trên ${report.sampledNotes}/${report.linkedNotes} câu sai có chi tiết` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chẩn đoán AI"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {/* Thân Modal (Cuộn mượt mà) */}
        <div className="relative min-h-0 flex-1 flex flex-col">
          <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            
            {/* TH1: Chưa có báo cáo hoặc đang chạy phân tích */}
            {!report && (
              <div className="space-y-4 py-3">
                <div className="rounded-2xl border-2 border-slate-900 bg-indigo-50/70 p-5 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-700 dark:bg-indigo-950/30 text-center sm:text-left">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Sẵn sàng Chẩn đoán Lần làm này
                  </h4>
                  <p className="mt-2 text-xs md:text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                    Hệ thống sẽ đối chiếu số câu sai thực tế của đề <strong className="text-slate-900 dark:text-white">{attempt.testName}</strong>, nhận diện các bẫy ETS bạn thường gặp phải và xây dựng phương pháp khắc phục tối ưu theo từng Part.
                  </p>
                </div>

                {owner ? (
                  <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <label className="flex cursor-pointer items-start gap-2.5 text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600 rounded cursor-pointer"
                        checked={consent}
                        disabled={busy}
                        onChange={e => setConsent(e.target.checked)}
                      />
                      <span>
                        Cho phép gửi kết quả và câu sai của lần làm này lên AI để tạo gợi ý ôn tập. Tuyệt đối không gửi ảnh và không gửi thông tin cá nhân.
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={onGenerate}
                      disabled={!consent || busy}
                      className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-indigo-600 px-5 text-sm font-black text-white shadow-[2px_2px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 transition-all dark:border-slate-300"
                    >
                      <RefreshCw size={16} aria-hidden="true" className={busy ? 'animate-spin motion-reduce:animate-none' : ''} />
                      {busy ? 'Đang đối chiếu dữ liệu và tạo gợi ý…' : 'Bắt đầu Chẩn đoán bằng AI'}
                    </button>
                    <p className="text-[11.5px] text-center font-medium text-slate-500 dark:text-slate-400">
                      Mỗi lần chẩn đoán mới tiêu tốn 1 lượt AI. Báo cáo sau khi tạo sẽ được lưu lại để mở xem lại miễn phí bất cứ lúc nào.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 text-center">
                    Vui lòng đăng nhập và đồng bộ bài thi lên tài khoản để sử dụng tính năng Chẩn đoán AI.
                  </div>
                )}
              </div>
            )}

            {/* TH2: ĐÃ CÓ BÁO CÁO PHÂN TÍCH */}
            {report && (
              <>
                {/* 1. Nhận xét tổng quan (Verdict Box) */}
                <div className="rounded-xl border-2 border-slate-900 bg-indigo-50/80 p-4 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-indigo-950/30">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-300 mb-1.5">
                    <span>🎯</span> Nhận xét Tổng quan lần làm này
                  </div>
                  <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                    {getOverallVerdict()}
                  </p>
                </div>

                {stale && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Dữ liệu lần làm này đã có thay đổi. Bạn có thể bấm "Cập nhật phân tích mới" để nhận gợi ý chính xác nhất.</span>
                  </div>
                )}

                {/* 2. Danh sách Ưu tiên Cải thiện từng Part */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Các Part cần tập trung cải thiện
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                      {report.priorities.length} trọng tâm chính
                    </span>
                  </div>

                  {report.priorities.map((priority, index) => {
                    const partFact = priority.part ? report.parts.find(f => f.part === priority.part) : null;
                    const isReading = priority.part && priority.part >= 5;

                    return (
                      <article
                        key={index}
                        className="rounded-xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#162137] space-y-3.5"
                      >
                        {/* Header Part */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {priority.part ? (
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white text-xs font-black ${
                                  priority.part === 7 ? 'bg-rose-600' : isReading ? 'bg-teal-600' : 'bg-indigo-600'
                                }`}
                              >
                                P{priority.part}
                              </span>
                            ) : (
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-black">
                                #{index + 1}
                              </span>
                            )}
                            <div className="min-w-0">
                              <h5 className="text-sm font-black text-slate-950 dark:text-white truncate">
                                {index + 1}. {priority.title}
                              </h5>
                              {partFact && (
                                <p className="text-[11.5px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                                  Mất {partFact.wrong} câu · Kết quả: đúng {partFact.correct}/{partFact.total} câu ({Math.round((partFact.correct / partFact.total) * 100)}%)
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-900 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200">
                            ⏱️ Luyện ~{priority.minutes} phút
                          </span>
                        </div>

                        {/* Phân tích nguyên nhân & bẫy */}
                        <div className="space-y-1">
                          <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Search className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            Nguyên nhân & Bẫy ETS thường gặp:
                          </span>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-5 whitespace-pre-line">
                            {priority.observation}
                          </p>
                        </div>

                        {/* Bằng chứng câu sai (nếu có) */}
                        {priority.evidenceIds.length > 0 && (
                          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5 dark:border-slate-700 dark:bg-slate-900/60">
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 block">
                              📌 Bằng chứng câu sai từ đề thi ({priority.evidenceIds.length} câu):
                            </span>
                            <ul className="space-y-1 text-slate-600 dark:text-slate-400 text-[11.5px] pl-2 border-l-2 border-slate-300 dark:border-slate-700">
                              {priority.evidenceIds.map(id => {
                                const note = linkedNotes.find(item => item.id === id);
                                if (!note) return null;
                                return (
                                  <li key={id} className="break-words">
                                    <strong className="text-slate-900 dark:text-slate-100">
                                      {note.questionNumber ? `Câu ${note.questionNumber}: ` : ''}
                                    </strong>
                                    {(note.question || note.questionContext).slice(0, 180)}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Phương pháp học tập tối ưu */}
                        <div className="rounded-xl bg-emerald-50/90 border border-emerald-300 p-3.5 text-xs text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200 leading-relaxed space-y-1">
                          <span className="font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                            <Lightbulb className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            Phương pháp học tập & Luyện thi tối ưu:
                          </span>
                          <p className="pl-5 whitespace-pre-line font-medium">
                            {priority.practice}
                          </p>
                        </div>

                        {/* 3 Nút hành động 1-chạm */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {onNavigateToTimer && priority.part && priority.part >= 5 && (
                            <button
                              type="button"
                              onClick={() => handleAction(() => onNavigateToTimer(`PART_${priority.part}` as ReadingPartType))}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-amber-400 hover:bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300"
                            >
                              <Timer size={14} aria-hidden="true" />
                              Bấm giờ Part {priority.part}
                            </button>
                          )}
                          {onNavigateToMistakes && (
                            <button
                              type="button"
                              onClick={() => handleAction(() => onNavigateToMistakes([attempt.testName]))}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              <BookOpen size={14} aria-hidden="true" />
                              Mở Sổ tay của đề
                            </button>
                          )}
                          {onNavigateToPlan && (
                            <button
                              type="button"
                              onClick={() => handleAction(onNavigateToPlan)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              <CalendarDays size={14} aria-hidden="true" />
                              Thêm vào Kế hoạch tuần
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {/* Trạng thái lỗi hoặc thông báo */}
            {error && (
              <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {cacheNotice && (
              <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">{cacheNotice}</p>
            )}
          </div>
          <ContainerScrollCue containerRef={bodyRef} />
        </div>

        {/* Footer Modal */}
        <footer className={`flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-[#162137] ${PHONE_SHEET_FOOTER}`}>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Đóng
          </button>
          {report && owner && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-900 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-black text-white shadow-[2px_2px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 transition-all dark:border-slate-300"
            >
              <RefreshCw size={14} aria-hidden="true" className={busy ? 'animate-spin motion-reduce:animate-none' : ''} />
              {busy ? 'Đang cập nhật…' : 'Cập nhật phân tích mới'}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
