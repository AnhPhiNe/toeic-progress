import React from 'react';
import { Target, PlusCircle, TrendingUp, Sparkles, X, ArrowRight } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

interface Props {
  onSetGoal: () => void;
  onRecord: () => void;
  onDismiss: () => void;
}

export const OnboardingCard: React.FC<Props> = ({ onSetGoal, onRecord, onDismiss }) => {
  const modalRef = useModalA11y(true, onDismiss);

  const handleGoalClick = () => {
    onDismiss();
    onSetGoal();
  };

  const handleRecordClick = () => {
    onDismiss();
    onRecord();
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#111A2C] rounded-3xl border-2 border-slate-900 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:shadow-[4px_4px_0_0_#cbd5e1] p-6 sm:p-7 space-y-5 animate-scale-in relative">
        
        {/* Nút đóng modal góc phải */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-5 right-5 p-2 rounded-xl border-2 border-slate-900 bg-white text-slate-700 hover:bg-slate-100 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:shadow-none transition cursor-pointer"
          title="Đóng (Esc)"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>

        {/* Tiêu đề & Lời chào */}
        <div className="flex items-start gap-4 pr-8">
          <div className="w-12 h-12 rounded-2xl border-2 border-slate-900 bg-blue-600 text-white shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <div>
            <h2 id="onboarding-title" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Bắt đầu theo cách của bạn
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              Không cần tài khoản. Dữ liệu lưu an toàn trên máy này; bạn có thể bật đồng bộ đám mây bất cứ lúc nào.
            </p>
          </div>
        </div>

        {/* 3 Bước Khởi Đầu */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl border-2 border-slate-900/15 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
            <div className="w-8 h-8 rounded-xl border-2 border-slate-900 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 shadow-[1px_1px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none flex items-center justify-center shrink-0 mt-0.5">
              <Target className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                1 · Đặt mục tiêu
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                Chọn điểm muốn đạt và ngày thi để hệ thống đếm ngược và tính nhịp học.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl border-2 border-slate-900/15 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
            <div className="w-8 h-8 rounded-xl border-2 border-slate-900 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 shadow-[1px_1px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none flex items-center justify-center shrink-0 mt-0.5">
              <PlusCircle className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                2 · Ghi buổi đầu
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                Nhập điểm 1 đề Full Test 200 câu hoặc bài luyện Part lẻ để bắt đầu chuỗi ngày học.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl border-2 border-slate-900/15 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
            <div className="w-8 h-8 rounded-xl border-2 border-slate-900 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 shadow-[1px_1px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                3 · Theo dõi & Bứt phá
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                Xem biểu đồ tiến độ qua từng bài thi và nhận diện điểm yếu cần cải thiện.
              </p>
            </div>
          </div>
        </div>

        {/* Cụm nút hành động */}
        <div className="pt-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={handleGoalClick}
              className="w-full py-2.5 px-3 rounded-xl border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 text-xs sm:text-sm font-black shadow-[2px_2px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-1.5 cursor-pointer dark:border-slate-300 dark:bg-slate-800 dark:text-white dark:shadow-[2px_2px_0_0_#cbd5e1]"
            >
              <Target className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={2.5} />
              <span className="truncate">Đặt mục tiêu</span>
            </button>

            <button
              type="button"
              onClick={handleRecordClick}
              className="w-full py-2.5 px-3 rounded-xl border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-black shadow-[2px_2px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-1.5 cursor-pointer dark:border-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:shadow-[2px_2px_0_0_#cbd5e1]"
            >
              <span className="truncate">Ghi buổi đầu</span>
              <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            </button>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-1 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition text-center cursor-pointer"
          >
            Khám phá Dashboard ngay
          </button>
        </div>

      </div>
    </div>
  );
};

export const OnboardingModal = OnboardingCard;
