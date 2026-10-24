import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCw, Undo2, X } from 'lucide-react';
import type { MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PartBadge } from '@/features/mistakes/components/MistakeCard';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { reviewResultText } from '@/features/mistakes/lib/review';
import { normalizeReviewRating, type ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { QuestionContext } from '@/features/mistakes/components/QuestionContext';
import { SourceImageViewer } from '@/features/mistakes/components/SourceImageViewer';
import { triggerHaptic } from '@/shared/lib/haptics';
import type { MistakeUndoAction } from '@/features/mistakes/lib/mistakeUndo';
import { getActiveAccountId } from '@/shared/data/dataBundle';

interface ReviewModalProps {
  /** Cards to review, fixed when the session opens */
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, answer: ReviewAnswer) => { before: MistakeEntry; after: MistakeEntry; undo?: MistakeUndoAction };
  onReload: (id: string) => MistakeEntry | undefined;
}

interface Result { correct: boolean; text: string; picked: string }

/**
 * 3D Flashcard & Spaced Repetition review flow for mistake cards.
 * Cards can be answered via quiz options or flipped with 3D animation to self-rate recall with SRS buttons.
 */
export const ReviewModal: React.FC<ReviewModalProps> = ({ cards, onClose, onGrade, onReload }) => {
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [scheduleUpdatedCount, setScheduleUpdatedCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');
  const [reloaded, setReloaded] = useState<MistakeEntry | null>(null);
  const [lastGrade, setLastGrade] = useState<{ index: number; before: MistakeEntry; correct: boolean; updated: boolean; skipped: number; undo: MistakeUndoAction; owner: string | null } | null>(null);
  const [undoError, setUndoError] = useState('');
  const ref = useModalA11y(true, onClose);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const faceKey = `${index}:${showAnswer}`;
  const previousFace = useRef(faceKey);

  // Rotating a face only hides its pixels. Make the inactive face inert too,
  // and move keyboard focus off the control that just became invisible.
  useLayoutEffect(() => {
    if (previousFace.current === faceKey) return;
    previousFace.current = faceKey;
    const face = showAnswer ? backRef.current : frontRef.current;
    (face?.querySelector<HTMLElement>('button:not([disabled]), summary, a[href]') || face)?.focus();
  }, [faceKey, showAnswer]);

  const finished = index >= cards.length;
  const card = reloaded || cards[Math.min(index, cards.length - 1)];
  const quiz = card ? resolveQuizOptions(card) : null;
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };

  const grade = (answer: ReviewAnswer, picked = '') => {
    if (!card || result) return;
    try {
      const { before, after, undo } = onGrade(card, answer);
      const correct = normalizeReviewRating(answer) !== 'AGAIN';
      setLastGrade(undo ? { index, before, correct, updated: after !== before, skipped, undo, owner: getActiveAccountId() } : null);
      setUndoError('');
      if (after !== before) setScheduleUpdatedCount(value => value + 1);
      setReloaded(after);
      if (correct) setCorrectCount(value => value + 1);
      setResult({ correct, picked, text: reviewResultText(before, after, answer, picked) });
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được lịch ôn.');
    }
  };

  const undoGrade = () => {
    if (!lastGrade) return;
    try {
      if (lastGrade.owner !== getActiveAccountId()) throw new Error('Tài khoản đã thay đổi. Không thể hoàn tác lượt ôn trước.');
      lastGrade.undo();
      setIndex(lastGrade.index);
      setSkipped(lastGrade.skipped);
      setReloaded(onReload(lastGrade.before.id) ?? lastGrade.before);
      if (lastGrade.correct) setCorrectCount(value => Math.max(0, value - 1));
      if (lastGrade.updated) setScheduleUpdatedCount(value => Math.max(0, value - 1));
      setResult(null);
      setShowAnswer(false);
      setError('');
      setUndoError('');
      setLastGrade(null);
    } catch (reason) { setUndoError(reason instanceof Error ? reason.message : 'Chưa hoàn tác được lượt ôn.'); }
  };

  const next = () => {
    setResult(null);
    setShowAnswer(false);
    setError('');
    setReloaded(null);
    setIndex(value => value + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 sm:items-start sm:p-4 sm:pt-[8vh]" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="flex w-full flex-col bg-white dark:bg-[#111A2C] sm:max-h-[86vh] sm:max-w-[720px] sm:rounded-2xl sm:border-2 sm:border-slate-900 sm:shadow-[6px_6px_0px_#0f172a] dark:sm:border-slate-500"
      >
        <div className="flex items-center gap-4 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <h2 id="review-title" className="text-[17px] font-extrabold text-slate-900 dark:text-white">
            Ôn tập
          </h2>
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            aria-hidden="true"
          >
            <div
              className="h-full bg-emerald-400 transition-[width] duration-200 motion-reduce:transition-none"
              style={{
                width: `${(Math.min(index + (result ? 1 : 0), cards.length) / Math.max(cards.length, 1)) * 100}%`
              }}
            />
          </div>
          <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            {Math.min(index + 1, cards.length)} / {cards.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng phiên ôn tập"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {lastGrade && lastGrade.owner === getActiveAccountId() && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 sm:px-6 dark:border-slate-800">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Chấm nhầm thẻ vừa rồi?</span>
          <button type="button" onClick={undoGrade} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
            <Undo2 className="h-4 w-4" aria-hidden="true" />Hoàn tác chấm
          </button>
          {undoError && <p role="alert" className="w-full text-sm text-rose-700 dark:text-rose-300">{undoError}</p>}
        </div>}

        {finished || !card ? (
          <div className="space-y-4 px-4 pb-6 pt-6 text-center sm:px-6">
            <div role="status" className="space-y-3">
              {cards.length > skipped && <SuccessMark />}
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {cards.length > skipped ? `Xong ${cards.length - skipped} thẻ` : 'Chưa có thẻ nào được ôn'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {cards.length > skipped
                  ? `Trả lời đúng ${correctCount}/${cards.length - skipped}. ${
                      scheduleUpdatedCount ? 'Lịch ôn đã được cập nhật.' : 'Lịch ôn giữ nguyên.'
                    }`
                  : 'Không có lịch ôn nào được cập nhật.'}
                {skipped > 0 && ` Bỏ qua ${skipped} thẻ không còn ôn được.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="min-h-11 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-6">
              {error && (
                <div className="space-y-2 text-sm text-rose-600 dark:text-rose-300" role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const latest = onReload(card.id);
                      if (latest) {
                        setReloaded(latest);
                        setShowAnswer(false);
                        setResult(null);
                        setError('');
                      } else {
                        setSkipped(value => value + 1);
                        next();
                      }
                    }}
                    className="font-bold underline cursor-pointer"
                  >
                    Tải lại thẻ
                  </button>
                </div>
              )}

              {/* 3D Flip Card Container */}
              <div className="perspective-1000 w-full py-1">
                <div
                  className={`relative w-full transform-style-3d transition-transform duration-500 motion-reduce:transition-none ${
                    showAnswer ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* Mặt trước: Câu hỏi */}
                  <div
                    ref={node => { frontRef.current = node; if (node) node.inert = showAnswer; }}
                    tabIndex={-1}
                    className={`w-full backface-hidden rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#121A2B] dark:shadow-[4px_4px_0_0_#cbd5e1] space-y-4 ${
                      showAnswer ? 'absolute inset-0 pointer-events-none' : 'relative'
                    }`}
                    aria-hidden={showAnswer}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-bold leading-snug text-slate-900 dark:text-white sm:text-[16px]">
                        <span className="mr-2 align-middle">
                          <PartBadge part={card.part} />
                        </span>
                        {question}
                      </p>
                    </div>

                    <SourceImageViewer key={card.id + ':images'} ids={card.sourceImageIds} part={card.part} />
                    {!card.sourceImageIds?.length && (
                      <QuestionContext key={card.id} context={context} part={card.part} initiallyOpen />
                    )}

                    {quizMode && quiz ? (
                      <div className="space-y-3 pt-1">
                        <OptionList
                          options={quiz.options}
                          large
                          revealed={Boolean(result)}
                          chosen={result?.picked}
                          showMeanings={card.part !== 7}
                          chosenLabel=""
                          correctLabel={card.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án'}
                          onSelect={
                            result
                              ? undefined
                              : selected => {
                                  triggerHaptic(8);
                                  grade(selected === quiz.correctIndex, quiz.options[selected].letter);
                                  setShowAnswer(true);
                                }
                          }
                        />
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic(8);
                              setShowAnswer(true);
                            }}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer transition-colors"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            <span>Xem giải thích / Đáp án</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(8);
                          setShowAnswer(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-6 text-sm font-bold text-slate-700 hover:border-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-300 dark:hover:bg-slate-800/50 cursor-pointer transition-all duration-200 active:translate-x-0.5 active:translate-y-0.5"
                      >
                        <RotateCw className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        <span>Xem giải thích / Đáp án</span>
                      </button>
                    )}
                  </div>

                  {/* Mặt sau: Đáp án, Lời giải thích, Bản dịch */}
                  <div
                    ref={node => { backRef.current = node; if (node) node.inert = !showAnswer; }}
                    tabIndex={-1}
                    className={`w-full backface-hidden rotate-y-180 rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#121A2B] dark:shadow-[4px_4px_0_0_#cbd5e1] space-y-4 ${
                      !showAnswer ? 'absolute inset-0 pointer-events-none' : 'relative'
                    }`}
                    aria-hidden={!showAnswer}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <PartBadge part={card.part} />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Đáp án & Giải thích
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(8);
                          setShowAnswer(false);
                        }}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer transition-colors"
                      >
                        <RotateCw className="h-3 w-3" />
                        <span>Xem lại câu hỏi</span>
                      </button>
                    </div>

                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                      "{question}"
                    </p>

                    <div className="space-y-1 rounded-xl bg-emerald-50 px-4 py-3 text-sm border-2 border-emerald-500/40 dark:bg-emerald-950/40 dark:border-emerald-500/30">
                      <p>
                        <span className="font-extrabold text-emerald-900 dark:text-emerald-200">
                          {card.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án'}:
                        </span>{' '}
                        <span className="font-black text-emerald-950 dark:text-white text-base">
                          {card.correctAnswer}
                        </span>
                      </p>
                      {card.userMistake && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">Lần trước bạn nhầm:</span> {card.userMistake}
                        </p>
                      )}
                    </div>

                    {result && (
                      <p
                        className={`text-sm font-bold ${
                          result.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                        }`}
                        role="status"
                      >
                        {result.text}
                      </p>
                    )}

                    <ExplanationView
                      explanation={card.explanation}
                      trapTip={card.trapTip}
                      optionMeanings={card.part === 7 ? quiz?.options : undefined}
                      extra={[['Lần trước bạn chọn', quizMode ? getUserChoice(card) : '']]}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {result ? (
                <button
                  type="button"
                  onClick={next}
                  autoFocus
                  className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900 sm:w-auto cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all shadow-[2px_2px_0_0_#0f172a]"
                >
                  {index + 1 < cards.length ? 'Tiếp' : 'Xem kết quả'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : showAnswer ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Đánh giá mức độ nhớ (SRS):
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Chọn để cập nhật lịch ôn
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        grade('AGAIN');
                      }}
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-rose-100 py-2.5 px-1 text-xs sm:text-sm font-black text-rose-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-rose-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all cursor-pointer dark:border-slate-300 dark:bg-rose-950/60 dark:text-rose-200 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                    >
                      <span>Quên</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        grade('HARD');
                      }}
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-100 py-2.5 px-1 text-xs sm:text-sm font-black text-amber-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-amber-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all cursor-pointer dark:border-slate-300 dark:bg-amber-950/60 dark:text-amber-200 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                    >
                      <span>Khó</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        grade('GOOD');
                      }}
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-blue-100 py-2.5 px-1 text-xs sm:text-sm font-black text-blue-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-blue-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all cursor-pointer dark:border-slate-300 dark:bg-blue-950/60 dark:text-blue-200 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                    >
                      <span>Tốt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        grade('EASY');
                      }}
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-emerald-100 py-2.5 px-1 text-xs sm:text-sm font-black text-emerald-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-emerald-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all cursor-pointer dark:border-slate-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                    >
                      <span>Dễ</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {quizMode ? 'Chọn phương án hoặc bấm xem đáp án' : 'Nhớ lại đáp án rồi bấm để lật thẻ'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setShowAnswer(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-amber-300 px-4 py-2 text-xs font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-amber-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] hover:-translate-y-0.5 transition-all cursor-pointer dark:border-slate-200 dark:bg-amber-400 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>Xem giải thích / Đáp án</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
