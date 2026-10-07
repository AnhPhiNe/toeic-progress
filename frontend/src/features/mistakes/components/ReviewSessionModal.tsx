import React, { useState, useMemo } from 'react';
import { X, Brain, Eye, CheckCircle2, RotateCcw, Trophy, Tag } from 'lucide-react';
import { MistakeEntry, ERROR_CATEGORY_LABELS } from '@/shared/types';
import { getDueMistakes, REVIEW_INTERVALS_DAYS } from '@/features/mistakes/lib/spacedRepetition';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

interface ReviewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mistakes: MistakeEntry[];
  /** Ghi kết quả tự chấm của một thẻ; trả về ngay để phiên chạy tiếp */
  onGrade: (mistakeId: string, remembered: boolean) => void;
}

export const ReviewSessionModal: React.FC<ReviewSessionModalProps> = ({
  isOpen,
  onClose,
  mistakes,
  onGrade
}) => {
  // Chốt danh sách ngay khi mở phiên: chấm xong một thẻ thì nó rời khỏi
  // danh sách đến hạn, nếu tính lại liên tục thì phiên sẽ tự co lại giữa chừng.
  const [queue, setQueue] = useState<MistakeEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const [forgotten, setForgotten] = useState(0);
  const [startedFor, setStartedFor] = useState<string | null>(null);

  const dueNow = useMemo(() => getDueMistakes(mistakes), [mistakes]);

  // Khởi tạo phiên một lần mỗi lần mở
  const sessionKey = isOpen ? 'open' : 'closed';
  if (isOpen && startedFor !== sessionKey) {
    setQueue(dueNow);
    setIndex(0);
    setRevealed(false);
    setRemembered(0);
    setForgotten(0);
    setStartedFor(sessionKey);
  } else if (!isOpen && startedFor !== null) {
    setStartedFor(null);
  }

  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const current = queue[index];
  const finished = index >= queue.length;
  const categoryInfo = current
    ? ERROR_CATEGORY_LABELS[current.category] || ERROR_CATEGORY_LABELS.OTHER
    : null;

  const handleGrade = (didRemember: boolean) => {
    if (!current) return;
    onGrade(current.id, didRemember);
    if (didRemember) setRemembered(n => n + 1);
    else setForgotten(n => n + 1);
    setRevealed(false);
    setIndex(i => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-session-title"
        tabIndex={-1}
        className="relative w-full max-w-2xl my-8 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Đầu phiên */}
        <div className="flex items-center justify-between gap-2 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="review-session-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                Phiên Ôn Tập
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {finished ? 'Đã xong phiên này' : `Thẻ ${index + 1}/${queue.length}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng phiên ôn tập"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh tiến độ phiên */}
        {queue.length > 0 && (
          <div className="h-1 bg-slate-100 dark:bg-slate-800 shrink-0">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.round((Math.min(index, queue.length) / queue.length) * 100)}%` }}
            />
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {queue.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">Không còn thẻ nào đến hạn</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Lịch ôn giãn dần theo bậc {REVIEW_INTERVALS_DAYS.join(' → ')} ngày. Quay lại khi có thẻ tới hẹn.
              </p>
            </div>
          ) : finished ? (
            <div className="py-10 text-center space-y-3">
              <Trophy className="w-10 h-10 mx-auto text-amber-500" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">Xong {queue.length} thẻ</p>
              <div className="flex items-center justify-center gap-3 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-900/60">
                  Nhớ: {remembered}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900/60">
                  Quên: {forgotten}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Thẻ nhớ được hẹn xa hơn, thẻ quên quay lại ngày mai.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Ngữ cảnh: phần người học phải tự nhớ trước khi lật */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs shrink-0">
                  Part {current.part}
                </span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate min-w-0">
                  {categoryInfo?.label}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ngữ cảnh câu hỏi</h4>
                <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mt-1">
                  {current.questionContext}
                </p>
                {current.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {current.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5 shrink-0" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!revealed ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    Tự nhớ lại đáp án đúng và cái bẫy ở đây, rồi mới lật thẻ.
                  </p>
                  <button
                    onClick={() => setRevealed(true)}
                    className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Lật thẻ xem đáp án
                  </button>
                </div>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  {current.userMistake && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 text-xs">
                      <span className="font-semibold text-rose-700 dark:text-rose-400 block mb-0.5">Lỗi bạn từng mắc</span>
                      <p className="text-slate-700 dark:text-slate-300">{current.userMistake}</p>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{current.answerSource === 'AI_PROPOSED' ? 'Đáp án AI đề xuất:' : 'Đáp án đúng:'}</span>
                      <span className="font-black text-slate-900 dark:text-white">{current.correctAnswer}</span>
                    </div>
                    {current.answerSource === 'AI_PROPOSED' && <p className="text-amber-800 dark:text-amber-200">Cần đối chiếu đáp án nguồn khi có.</p>}
                    {current.trapTip && (
                      <div className="text-slate-800 dark:text-slate-200 font-medium pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900/40 leading-relaxed whitespace-pre-line">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 mr-1">💡 Bí kíp 10s:</span>
                        <span>{current.trapTip}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      onClick={() => handleGrade(false)}
                      className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      Quên
                    </button>
                    <button
                      onClick={() => handleGrade(true)}
                      className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Nhớ
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                    Tự chấm thật lòng - chấm rộng tay chỉ làm lịch ôn sai.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {(finished || queue.length === 0) && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
