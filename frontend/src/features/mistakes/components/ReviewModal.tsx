import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PartBadge } from '@/features/mistakes/components/MistakeCard';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { reviewResultText } from '@/features/mistakes/lib/review';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { QuestionContext } from '@/features/mistakes/components/QuestionContext';
import { SourceImageViewer } from '@/features/mistakes/components/SourceImageViewer';

interface ReviewModalProps {
  /** Cards to review, fixed when the session opens */
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, correct: boolean) => { before: MistakeEntry; after: MistakeEntry };
  onReload: (id: string) => MistakeEntry | undefined;
}

interface Result { correct: boolean; text: string; picked: string }

/**
 * One review flow for every card. Cards with options: pick A–D, the app grades it and
 * updates the schedule. Cards without usable options: flip, then self-grade.
 */
export const ReviewModal: React.FC<ReviewModalProps> = ({ cards, onClose, onGrade, onReload }) => {
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [scheduleUpdatedCount, setScheduleUpdatedCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');
  const [reloaded, setReloaded] = useState<MistakeEntry | null>(null);
  const ref = useModalA11y(true, onClose);

  const finished = index >= cards.length;
  const card = reloaded || cards[Math.min(index, cards.length - 1)];
  const quiz = card ? resolveQuizOptions(card) : null;
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };

  const grade = (correct: boolean, picked = '') => {
    if (!card || result) return;
    try {
      const { before, after } = onGrade(card, correct);
      if (after !== before) setScheduleUpdatedCount(value => value + 1);
      setReloaded(after);
      if (correct) setCorrectCount(value => value + 1);
      setResult({ correct, picked, text: reviewResultText(before, after, correct, picked) });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được lịch ôn.'); }
  };

  const next = () => {
    setResult(null);
    setFlipped(false);
    setError('');
    setReloaded(null);
    setIndex(value => value + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="review-title"
        className="flex w-full flex-col bg-white dark:bg-[#111A2C] sm:max-h-[86vh] sm:max-w-[720px] sm:rounded-2xl sm:border-2 sm:border-slate-900 sm:shadow-[6px_6px_0px_#0f172a] dark:sm:border-slate-500">
        <div className="flex items-center gap-4 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <h2 id="review-title" className="text-[17px] font-extrabold text-slate-900 dark:text-white">Ôn tập</h2>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
            <div className="h-full bg-emerald-400 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(Math.min(index + (result ? 1 : 0), cards.length) / Math.max(cards.length, 1)) * 100}%` }} />
          </div>
          <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{Math.min(index + 1, cards.length)} / {cards.length}</span>
          <button type="button" onClick={onClose} aria-label="Đóng phiên ôn tập" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {finished || !card ? (
          <div className="space-y-4 px-4 pb-6 pt-6 text-center sm:px-6">
            <div role="status" className="space-y-3">
              {cards.length > skipped && <SuccessMark />}
              <p className="text-xl font-bold text-slate-900 dark:text-white">{cards.length > skipped ? `Xong ${cards.length - skipped} thẻ` : 'Chưa có thẻ nào được ôn'}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{cards.length > skipped ? `Trả lời đúng ${correctCount}/${cards.length - skipped}. ${scheduleUpdatedCount ? 'Lịch ôn đã được cập nhật.' : 'Lịch ôn giữ nguyên.'}` : 'Không có lịch ôn nào được cập nhật.'}{skipped > 0 && ` Bỏ qua ${skipped} thẻ không còn ôn được.`}</p>
            </div>
            <button type="button" onClick={onClose} autoFocus className="min-h-11 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900 cursor-pointer">Đóng</button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-6">
              {error && <div className="space-y-2 text-sm text-rose-600 dark:text-rose-300" role="alert"><p>{error}</p>
                <button type="button" onClick={() => { const latest = onReload(card.id); if (latest) { setReloaded(latest); setFlipped(false); setResult(null); setError(''); } else { setSkipped(value => value + 1); next(); } }} className="font-bold underline">Tải lại thẻ</button></div>}
              <p className="text-base font-bold leading-snug text-slate-900 dark:text-white sm:text-[16px]">
                <span className="mr-2 align-middle"><PartBadge part={card.part} /></span>{question}
              </p>
              <SourceImageViewer key={card.id + ':images'} ids={card.sourceImageIds} part={card.part} />
              {!card.sourceImageIds?.length && <QuestionContext key={card.id} context={context} part={card.part} initiallyOpen />}

              {quizMode && quiz ? (
                <OptionList options={quiz.options} large revealed={Boolean(result)} chosen={result?.picked} showMeanings={card.part !== 7}
                  chosenLabel="" correctLabel={card.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án'}
                  onSelect={result ? undefined : selected => grade(selected === quiz.correctIndex, quiz.options[selected].letter)} />
              ) : !flipped ? (
                <button type="button" onClick={() => setFlipped(true)}
                  className="w-full rounded-xl border-2 border-dashed border-slate-300 py-6 text-sm font-semibold text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300 cursor-pointer">
                  Tự nhớ lại đáp án, rồi bấm để lật thẻ
                </button>
              ) : (
                <div className="space-y-1 rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950/40">
                  <p><span className="font-bold">{card.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án'}:</span> {card.correctAnswer}</p>
                  {card.userMistake && <p className="text-slate-600 dark:text-slate-300"><span className="font-semibold">Lần trước bạn nhầm:</span> {card.userMistake}</p>}
                </div>
              )}

              {result && (
                <p className={`text-sm font-semibold ${result.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`} role="status">
                  {result.text}
                </p>
              )}

              {(result || (flipped && !quizMode)) && (
                <ExplanationView explanation={card.explanation} trapTip={card.trapTip} optionMeanings={card.part === 7 ? quiz?.options : undefined}
                  extra={[['Lần trước bạn chọn', quizMode ? getUserChoice(card) : '']]} />
              )}
            </div>

            <div className="border-t-2 border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6">
              {result ? (
                <button type="button" onClick={next} autoFocus
                  className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900 sm:w-auto cursor-pointer">
                  {index + 1 < cards.length ? 'Tiếp' : 'Xem kết quả'}<ArrowRight className="h-4 w-4" />
                </button>
              ) : flipped && !quizMode ? (
                <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-fit">
                  <button type="button" onClick={() => grade(false)} className="rounded-xl border-2 border-rose-300 px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 cursor-pointer">Chưa nhớ</button>
                  <button type="button" onClick={() => grade(true)} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 cursor-pointer">Nhớ</button>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 sm:text-right">
                  {quizMode ? 'Chọn một phương án' : 'Thẻ này chưa có phương án A–D'}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
