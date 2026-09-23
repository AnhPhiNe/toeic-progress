import React from 'react';
import { ArrowRight, Check, Target } from 'lucide-react';
import { CARD } from './surfaces';

interface Props {
  onSetGoal: () => void;
  onRecord: () => void;
  onDismiss: () => void;
}

export const OnboardingCard: React.FC<Props> = ({ onSetGoal, onRecord, onDismiss }) => (
  <section className={`${CARD} space-y-3`} aria-label="Bắt đầu với TOEIC Progress">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Bắt đầu theo cách của bạn</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Không cần tài khoản. Dữ liệu đầu tiên lưu trên máy này; bạn có thể bật đồng bộ sau.</p></div>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold text-slate-500 underline dark:text-slate-400">Để sau</button>
    </div>
    <ol className="grid gap-2 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-3">
      <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="font-bold">1 · Đặt mục tiêu</span><p className="mt-1">Chọn điểm muốn đạt và ngày thi.</p></li>
      <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="font-bold">2 · Ghi buổi đầu</span><p className="mt-1">Nhập đề, Part lẻ hoặc số từ đã học.</p></li>
      <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="font-bold">3 · Theo dõi</span><p className="mt-1">Xem tiến bộ và việc nên tập trung.</p></li>
    </ol>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onSetGoal} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-600"><Target size={14} className="mr-1 inline" />Đặt mục tiêu</button>
      <button type="button" onClick={onRecord} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Ghi buổi đầu <ArrowRight size={14} className="ml-1 inline" /></button>
      <button type="button" onClick={onDismiss} className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><Check size={14} className="mr-1 inline" />Đã hiểu</button>
    </div>
  </section>
);
