import React, { useState, useMemo } from 'react';
import { AlertTriangle, RotateCcw, ChevronDown } from 'lucide-react';
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

/**
 * Dải cảnh báo tái phạm: mỗi nhóm một dòng, mặc định thu gọn.
 *
 * Đây là cảnh báo, không phải nội dung chính - nó phải đứng nhường chỗ cho
 * dashboard. Chi tiết và nút hành động chỉ hiện khi người dùng mở ra.
 */
export const RelapseAlert: React.FC<RelapseAlertProps> = ({
  mistakes,
  onReopenCards,
  onNavigateToMistakes
}) => {
  const signals = useMemo(() => detectRelapses(mistakes), [mistakes]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-slate-900 bg-[#FEF3C7] dark:bg-amber-950/40 text-slate-900 dark:text-slate-100 shadow-[2px_2px_0px_0px_#0f172a] divide-y-2 divide-slate-900/10 dark:divide-slate-800 overflow-hidden">
      {signals.map(signal => {
        const isOpen = expanded === signal.category;

        return (
          <div key={signal.category}>
            <button
              onClick={() => setExpanded(isOpen ? null : signal.category)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-amber-200/50 dark:hover:bg-amber-900/40 transition cursor-pointer min-w-0"
            >
              <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-950 border-2 border-slate-900 shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
              </span>
              <span className="text-xs text-slate-900 dark:text-slate-100 min-w-0 flex-1 truncate">
                <span className="font-black text-amber-950 dark:text-amber-300">Cần ôn tập: {signal.label}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {' '}— lặp lại {signal.relapsedEntries.length} câu cần củng cố sau khi đã nắm vững
                  {signal.daysSinceMastered > 0 ? ` ${signal.daysSinceMastered} ngày trước` : ' hôm nay'}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-900 dark:text-slate-200 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="px-4 pb-3.5 pt-1 space-y-2.5">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Đánh dấu thông suốt ngày {formatVnDate(signal.masteredAt)}. Các câu sai lại nằm ở:
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {signal.relapsedEntries.map(entry => (
                    <span
                      key={entry.id}
                      className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-amber-300 border-2 border-slate-900 shadow-[1px_1px_0px_0px_#0f172a] whitespace-nowrap"
                    >
                      Part {entry.part}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => onReopenCards(signal.masteredEntries.map(m => m.id))}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0 stroke-[2.5]" />
                    <span className="whitespace-nowrap">
                      Đưa {signal.masteredEntries.length} thẻ về ôn lại
                    </span>
                  </button>
                  <button
                    onClick={onNavigateToMistakes}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-black transition cursor-pointer whitespace-nowrap"
                  >
                    Mở Sổ Tay →
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
