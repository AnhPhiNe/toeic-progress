import React, { useId, useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';
import type { MistakeExplanation } from '@/shared/types';
import { analysisLines } from '@/features/mistakes/lib/analysisLines';
import type { ParsedOption } from '@/features/mistakes/lib/quizOptions';

const SECTIONS: Array<[keyof MistakeExplanation, string]> = [
  ['questionType', 'Dạng câu hỏi'],
  ['evidence', 'Bằng chứng'],
  ['paraphrase', 'Paraphrase'],
  ['translation', 'Dịch'],
  ['analysis', 'Phân tích'],
  ['keyVocabulary', 'Từ vựng trong câu']
];

interface ExplanationViewProps {
  explanation?: MistakeExplanation | null;
  /** Plain-text explanation of records saved before structured fields existed */
  trapTip?: string;
  /** Extra lines shown first in the details, e.g. the learner's own note */
  extra?: Array<[string, string]>;
  /** Longer option translations, shown only after expanding the explanation. */
  optionMeanings?: ParsedOption[];
  /** false shows the details without a toggle (draft review before saving) */
  collapsible?: boolean;
  /** Shown on the right of the toggle row, e.g. a "Ôn câu này" button */
  actions?: React.ReactNode;
}

/** The 10-second tip as the one highlighted element, with the rest of the explanation behind a toggle. */
export const ExplanationView: React.FC<ExplanationViewProps> = ({
  explanation, trapTip = '', extra = [], optionMeanings = [], collapsible = true, actions
}) => {
  const [open, setOpen] = useState(!collapsible);
  const detailsId = useId();
  const tip = explanation?.quickTip.trim() ?? '';
  const sections = [
    ...extra.filter(([, value]) => value.trim()),
    ...(explanation
      ? SECTIONS.map(([key, label]): [string, string] => [label, explanation[key]]).filter(([, value]) => value.trim())
      : [])
  ];
  const legacyText = explanation ? '' : trapTip.trim();
  const meanings = optionMeanings.filter(option => option.note?.meaning.trim());
  const hasDetails = sections.length > 0 || Boolean(legacyText) || meanings.length > 0;

  return (
    <div className="space-y-3">
      {tip && (
        <div className="flex gap-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 px-3.5 py-3 text-base leading-relaxed text-slate-900 dark:text-amber-50">
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p><span className="font-bold">Mẹo 10s:</span> {tip}</p>
        </div>
      )}
      {(collapsible && hasDetails) || actions ? (
        <div className="flex items-center justify-between gap-3">
          {collapsible && hasDetails ? (
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={detailsId}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              {open ? 'Ẩn giải thích' : 'Xem giải thích'}
            </button>
          ) : <span />}
          {actions}
        </div>
      ) : null}
      {open && hasDetails && (
        <div id={detailsId} className="space-y-2.5 text-base leading-relaxed text-slate-700 dark:text-slate-300">
          {meanings.length > 0 && <section aria-label="Nghĩa các phương án" className="space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">Nghĩa các phương án:</p>
            {meanings.map(option => <p key={option.letter} className="flex gap-2">
              <span className="w-5 shrink-0 font-semibold text-slate-900 dark:text-white">{option.letter}.</span>
              <span className="min-w-0 whitespace-pre-line break-words">{option.note!.meaning}</span>
            </p>)}
          </section>}
          {sections.map(([label, value]) => label === 'Phân tích' ? (
            <div key={label}><p className="font-bold text-slate-900 dark:text-white">{label}:</p>
              <div className="mt-1.5 space-y-1.5">{analysisLines(value).map((line, index) => <p key={index} className="whitespace-pre-line break-words">{line}</p>)}</div>
            </div>
          ) : (
            <p key={label} className="whitespace-pre-line break-words">
              <span className="font-bold text-slate-900 dark:text-white">{label}:</span> {value}
            </p>
          ))}
          {legacyText && <div className="space-y-1.5">{analysisLines(legacyText).map((line, index) => <p key={index} className="whitespace-pre-line break-words">{line}</p>)}</div>}
        </div>
      )}
    </div>
  );
};
