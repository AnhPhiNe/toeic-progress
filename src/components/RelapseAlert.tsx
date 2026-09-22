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
    <div className="rounded-xl border border-amber-300/70 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 divide-y divide-amber-200/60 dark:divide-amber-900/40 overflow-hidden">
      {signals.map(signal => {
        const isOpen = expanded === signal.category;

        return (
          <div key={signal.category}>
            <button
              onClick={() => setExpanded(isOpen ? null : signal.category)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-100/50 dark:hover:bg-amber-950/40 transition cursor-pointer min-w-0"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs text-slate-800 dark:text-slate-100 min-w-0 flex-1 truncate">
                <span className="font-bold">Tái phạm: {signal.label}</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {' '}— sai lại {signal.relapsedEntries.length} câu sau khi đánh dấu thông suốt
                  {signal.daysSinceMastered > 0 ? ` ${signal.daysSinceMastered} ngày trước` : ' hôm nay'}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pt-0.5 space-y-2.5">
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Đánh dấu thông suốt ngày {formatVnDate(signal.masteredAt)}. Các câu sai lại nằm ở:
                </p>

                <div className="flex flex-wrap gap-1">
                  {signal.relapsedEntries.map(entry => (
                    <span
                      key={entry.id}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 whitespace-nowrap"
                    >
                      Part {entry.part}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer whitespace-nowrap"
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
