import React from 'react';
import { AlertTriangle, RotateCcw, ArrowRight } from 'lucide-react';
import { MistakeEntry } from '../types';
import { detectRelapses } from '../utils/relapse';

interface RelapseAlertProps {
  mistakes: MistakeEntry[];
  /** Hạ các thẻ đã thông suốt của một nhóm về lại trạng thái cần ôn */
  onReopenCards: (mistakeIds: string[]) => void;
  onNavigateToMistakes: () => void;
}

const formatVnDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const RelapseAlert: React.FC<RelapseAlertProps> = ({
  mistakes,
  onReopenCards,
  onNavigateToMistakes
}) => {
  const signals = React.useMemo(() => detectRelapses(mistakes), [mistakes]);

  if (signals.length === 0) return null;

  return (
    <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-300/80 dark:border-amber-900/50 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Phát hiện tái phạm
          </h3>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            Nhóm lỗi bạn từng đánh dấu thông suốt nhưng vẫn sai lại
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {signals.map(signal => (
          <div
            key={signal.category}
            className="p-3 rounded-xl bg-white/90 dark:bg-slate-900/60 border border-amber-200/70 dark:border-amber-900/40 space-y-2"
          >
            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
              Bạn đánh dấu <strong className="font-bold">{signal.label}</strong> là đã thông suốt{' '}
              {signal.daysSinceMastered > 0 ? (
                <>cách đây <strong className="font-bold">{signal.daysSinceMastered} ngày</strong></>
              ) : (
                <>hôm nay</>
              )}{' '}
              ({formatVnDate(signal.masteredAt)}), nhưng từ đó đã sai thêm{' '}
              <strong className="font-bold text-amber-700 dark:text-amber-300">
                {signal.relapsedEntries.length} câu
              </strong>{' '}
              thuộc đúng nhóm này.
            </p>

            <div className="flex flex-wrap gap-1">
              {signal.relapsedEntries.slice(0, 4).map(entry => (
                <span
                  key={entry.id}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 whitespace-nowrap"
                >
                  Part {entry.part}
                </span>
              ))}
              {signal.relapsedEntries.length > 4 && (
                <span className="text-[10px] px-2 py-0.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  +{signal.relapsedEntries.length - 4} nữa
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                onClick={() => onReopenCards(signal.masteredEntries.map(m => m.id))}
                className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">
                  Đưa {signal.masteredEntries.length} thẻ về ôn lại
                </span>
              </button>
              <button
                onClick={onNavigateToMistakes}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition cursor-pointer"
              >
                <span className="whitespace-nowrap">Mở Sổ Tay</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
