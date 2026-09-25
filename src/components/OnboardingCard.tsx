import React, { useEffect } from 'react';
import { Target, PlusCircle, TrendingUp, Sparkles, X, ArrowRight } from 'lucide-react';

interface Props {
  onSetGoal: () => void;
  onRecord: () => void;
  onDismiss: () => void;
}

export const OnboardingCard: React.FC<Props> = ({ onSetGoal, onRecord, onDismiss }) => {
  // Lắng nghe phím Escape để đóng modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-6 animate-scale-in relative">
        
        {/* Nút đóng modal góc phải */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Đóng (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề & Lời chào */}
        <div className="flex items-start gap-4 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 id="onboarding-title" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Bắt đầu theo cách của bạn
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Không cần tài khoản. Dữ liệu lưu an toàn trên máy này; bạn có thể bật đồng bộ đám mây bất cứ lúc nào.
            </p>
          </div>
        </div>

        {/* 3 Bước Khởi Đầu */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Target className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                1 · Đặt mục tiêu
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chọn điểm muốn đạt và ngày thi để hệ thống đếm ngược và tính nhịp học.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                2 · Ghi buổi đầu
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Nhập điểm 1 đề Full Test 200 câu hoặc bài luyện Part lẻ để bắt đầu chuỗi ngày học.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                3 · Theo dõi & Bứt phá
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Xem biểu đồ tiến độ qua từng bài thi và nhận diện điểm yếu cần cải thiện.
              </p>
            </div>
          </div>
        </div>

        {/* Cụm nút hành động */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGoalClick}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Target className="w-4 h-4 text-amber-500" />
              Đặt mục tiêu
            </button>

            <button
              type="button"
              onClick={handleRecordClick}
              className="px-4 py-2.5 rounded-xl btn-linear-primary text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              Ghi buổi đầu
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition text-center cursor-pointer"
          >
            Khám phá Dashboard ngay
          </button>
        </div>

      </div>
    </div>
  );
};

export const OnboardingModal = OnboardingCard;
