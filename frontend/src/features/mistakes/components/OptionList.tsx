import React from 'react';
import type { ParsedOption } from '@/features/mistakes/lib/quizOptions';

interface OptionListProps {
  options: ParsedOption[];
  /** Letter of the learner's choice: their recorded mistake, or the option just picked in review */
  chosen?: string;
  /** Label next to the correct option, e.g. "AI đề xuất"; empty shows only the check mark */
  correctLabel?: string;
  /** Label next to the chosen wrong option */
  chosenLabel?: string;
  /** Colour the correct and chosen options and show meanings. Review keeps this off until answered. */
  revealed?: boolean;
  /** Part 7 places the longer translations in the explanation instead. */
  showMeanings?: boolean;
  /** Makes options buttons (review before answering) */
  onSelect?: (index: number) => void;
  large?: boolean;
}

/** A–D options with the correct answer, the learner's choice and, once revealed, each option's meaning. */
export const OptionList: React.FC<OptionListProps> = ({
  options, chosen, correctLabel = '', chosenLabel = 'Bạn chọn', revealed = true, showMeanings = true, onSelect, large = false
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    {options.map((option, index) => {
      const right = revealed && option.isCorrect;
      const wrong = revealed && !option.isCorrect && option.letter === chosen;
      const tone = right ? 'right' : wrong ? 'wrong' : 'plain';
      const body = (
        <>
          <span className={`shrink-0 w-3.5 font-semibold ${
            tone === 'right' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'wrong' ? 'text-rose-500' : 'text-slate-400'
          }`}>{option.letter}</span>
          <span className="min-w-0 flex-1 break-words">
            <span className={tone === 'right' ? 'font-semibold' : ''}>{option.text}</span>
            {revealed && showMeanings && option.note?.meaning && (
              <span className={`text-[12.5px] ${
                tone === 'right' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'wrong' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {option.note.pos && <span className="font-semibold"> ({option.note.pos})</span>}: {option.note.meaning}
              </span>
            )}
          </span>
          {right && (
            <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {correctLabel}
            </span>
          )}
          {wrong && chosenLabel && (
            <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-rose-700 dark:text-rose-300">
              {chosenLabel}
            </span>
          )}
        </>
      );
      const className = `w-full text-left rounded-2xl border-2 flex items-start gap-2.5 text-[var(--rd-ink)] ${
        large ? 'px-3.5 py-3 text-base leading-relaxed' : 'px-3 py-2 text-sm'
      } ${
        tone === 'right'
          ? 'border-[#a9deb2] bg-[#e9f7ec]'
          : tone === 'wrong'
            ? 'border-[#ffc2d1] bg-[#ffeef2]'
            : 'border-[#efeae4] bg-white'
      }`;
      return onSelect ? (
        <button key={index} type="button" onClick={() => onSelect(index)}
          className={`${className} cursor-pointer hover:border-[#ffc2d1] hover:bg-[#fff8fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--rd-blue)]`}>
          {body}
        </button>
      ) : (
        <div key={index} className={className}>{body}</div>
      );
    })}
  </div>
);
