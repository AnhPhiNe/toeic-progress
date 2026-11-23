import { useMemo } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { canReview, isDueForReview } from '@/features/mistakes/lib/spacedRepetition';
import { cardEvidences, cardWords, optionRows, signalLine } from '@/features/mistakes/lib/cardDetail';
import { isWordSaved } from '@/features/mistakes/lib/savedWords';
import { AnswerDoubtNote } from './AnswerDoubtNote';
import { canExplain } from './MistakeCard';
import { isNumberLabel } from '@/features/mistakes/lib/questionSnippet';
import { EvidenceJumper, EvidencePassage, OptionRows, SignalBlock, TipBlock, WordRows, useEvidenceJump } from './CardParts';

export interface MistakeDetailActions {
  onEdit: () => void;
  onDelete: () => void;
  onMarkMastered: () => void;
  onReopen: () => void;
  onReview: () => void;
  onExplain: () => void;
  explainLabel: string;
  explaining: boolean;
  onResolveDoubt: (switchToAI: boolean) => void;
  /** Keeps words from "Từ cần nhớ" on the card for review. */
  onSaveWords: (words: string[]) => void;
}

const CATEGORY_SHORT: Record<string, string> = {
  VOCABULARY_TRAP: 'Từ vựng', ADVANCED_GRAMMAR: 'Ngữ pháp', LISTENING_SPEED: 'Nghe', TIME_PRESSURE: 'Thời gian', CARELESS_DISTRACTION: 'Đọc ẩu', OTHER: 'Khác'
};
export const categoryShort = (category: string) => CATEGORY_SHORT[category] ?? ERROR_CATEGORY_LABELS[category as keyof typeof ERROR_CATEGORY_LABELS]?.label ?? 'Khác';
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export function reviewLabel(m: MistakeEntry): { text: string; due: boolean } {
  if (m.status === 'MASTERED') return { text: 'đã thuộc', due: false };
  if (isDueForReview(m)) return { text: 'ôn hôm nay', due: true };
  return { text: m.nextReviewDate ? `ôn ${ddmm(m.nextReviewDate)}` : 'chưa ôn', due: false };
}
/** List rows: a new card waiting for its first review needs no red "ôn hôm nay"; only a set date that has come does. */
export function rowReviewLabel(m: MistakeEntry): { text: string; due: boolean } {
  const label = reviewLabel(m);
  return label.due && !m.nextReviewDate ? { text: '', due: false } : label;
}

/** Everything both layouts read from a card, worked out once. */
export function useCardView(m: MistakeEntry) {
  return useMemo(() => {
    const ex = m.explanation;
    const context = (m.context ?? '').trim();
    const question = (m.question ?? m.questionContext ?? '').trim();
    const rows = optionRows(m);
    return {
      ex, context, rows,
      question: question && !isNumberLabel(question) ? question : '',
      evidences: cardEvidences(m),
      words: cardWords(m),
      signal: signalLine(ex?.analysis),
      tip: (ex?.quickTip || m.trapTip || '').trim(),
      mine: m.userReason?.trim() ?? '',
      // Part 5/6 sentence translation; on a reading card it sits under the marked sentence instead.
      translation: !context ? ex?.translation?.trim() ?? '' : '',
      showPos: new Set(rows.map(row => row.pos).filter(Boolean)).size > 1,
      due: reviewLabel(m),
      answer: optionLetter(m.correctAnswer)
    };
  }, [m]);
}
export type CardView = ReturnType<typeof useCardView>;

export const cardTitle = (m: MistakeEntry, joiner: string) => `${m.questionNumber ? `Câu ${m.questionNumber}${joiner}` : ''}Part ${m.part}`;

/** The explanation side: tip, signal, translation, learner note, words; or the "Giải thích với AI" button. */
export function ExplainBody({ m, view, actions, words = true }: { m: MistakeEntry; view: CardView; actions: MistakeDetailActions; words?: boolean }) {
  const { tip, signal, translation, mine, ex } = view;
  const empty = !tip && !signal && !translation && !(words && (view.words.length || ex?.keyVocabulary?.trim()));
  return <>
    {tip && <TipBlock tip={tip} />}
    {signal && <SignalBlock text={signal} />}
    {translation && <div className="cd-sign is-plain"><small>Dịch câu</small><p>{translation}</p></div>}
    {mine && <p className="cd-mine"><b>Bạn ghi:</b> {mine}</p>}
    {words && <Words m={m} view={view} actions={actions} />}
    {empty && canExplain(m) && (
      <button type="button" className="cd-explain" onClick={actions.onExplain} disabled={actions.explaining}>
        {actions.explaining ? 'Sóc đang viết lời giải…' : `${actions.explainLabel} ✨`}
      </button>
    )}
  </>;
}

export function Words({ m, view, actions, all = false }: { m: MistakeEntry; view: CardView; actions: MistakeDetailActions; all?: boolean }) {
  if (view.words.length) return <div className="cd-block"><small className="cd-cap">Từ cần nhớ</small>
    <WordRows words={view.words} isSaved={word => isWordSaved(m, word)} onSave={actions.onSaveWords} all={all} /></div>;
  const text = view.ex?.keyVocabulary?.trim();
  return text ? <div className="cd-sign is-plain"><small>Từ cần nhớ</small><p>{text}</p></div> : null;
}

function Actions({ m, actions }: { m: MistakeEntry; actions: MistakeDetailActions }) {
  return (
    <div className="cd-acts">
      {canReview(m) && <button type="button" className="rd-btn rd-btn--pink" onClick={actions.onReview}>Ôn câu này</button>}
      {m.status === 'MASTERED'
        ? <button type="button" className="rd-btn rd-btn--white" onClick={actions.onReopen}>Ôn lại từ đầu</button>
        : <button type="button" className="rd-btn rd-btn--white" onClick={actions.onMarkMastered}>Đã thuộc</button>}
      <span className="cd-sp" />
      <button type="button" className="cd-link" onClick={actions.onEdit}>Sửa</button>
      <button type="button" className="cd-link is-del" onClick={actions.onDelete} aria-label="Xoá câu này">Xoá</button>
    </div>
  );
}

function Plain({ m }: { m: MistakeEntry }) {
  return <div className="cd-plain"><p><b>Bạn chọn:</b> {m.userMistake || '—'}</p><p><b>Đáp án:</b> {m.correctAnswer || '—'}</p></div>;
}

/**
 * One mistake card on computers (design/previews/card-v2/1-desktop-part5.html, 2-desktop-part7.html): two columns
 * that fit the screen. A single question has the question and options on the left and a sticky panel with the tip,
 * signal, words and actions on the right; a reading card keeps the passage in its own scroll box on the left, opened
 * at the evidence, and the question with everything else on the right.
 */
export function MistakeDetail({ mistake: m, testName, actions, onBack }: { mistake: MistakeEntry; testName?: string; actions: MistakeDetailActions; onBack: () => void }) {
  const view = useCardView(m);
  const { context, question, rows, evidences, due } = view;
  const reading = Boolean(context);
  const jump = useEvidenceJump(reading ? evidences.length : 0, `${m.id}:${context.length}`);
  const options = rows.length
    ? <OptionRows rows={rows} reasonOnly={reading} showPos={view.showPos} />
    : <Plain m={m} />;
  const hint = rows.some(row => row.role === '' && (row.meaning || row.reason));

  return (
    <div className={'cd' + (reading ? ' is-reading' : '')}>
      <header className="cd-crumb">
        <button type="button" className="cd-back" onClick={onBack}><span aria-hidden="true">←</span> Sổ tay</button>
        <div>
          <h2>{cardTitle(m, ', ')}</h2>
          <p>{testName ? `${testName} · ` : ''}{categoryShort(m.category)} · <b className={due.due ? 'is-due' : undefined}>{due.text}</b></p>
        </div>
      </header>
      {m.answerDoubt && view.answer !== m.answerDoubt && <div className="cd-doubt"><AnswerDoubtNote doubt={m.answerDoubt} current={view.answer} onSwitch={() => actions.onResolveDoubt(true)} onKeep={() => actions.onResolveDoubt(false)} /></div>}

      {reading ? (
        <div className="cd-cols">
          <section className="cd-pcard" aria-label="Đoạn văn">
            <div className="cd-phd"><span>Đoạn văn</span>
              {evidences.length > 1 ? <EvidenceJumper at={jump.at} count={evidences.length} onNext={jump.next} />
                : evidences.length === 1 ? <span>Câu bằng chứng tô vàng</span> : null}
            </div>
            <div className="cd-pscroll" ref={jump.box} tabIndex={0} aria-label="Nội dung đoạn văn">
              <EvidencePassage context={context} evidences={evidences} at={jump.at} />
            </div>
          </section>
          <aside className="cd-panel">
            <div className="cd-pbody">
              {question && <h3 className="cd-q is-sm">{question}</h3>}
              {options}
              <ExplainBody m={m} view={view} actions={actions} />
            </div>
            <Actions m={m} actions={actions} />
          </aside>
        </div>
      ) : (
        <div className="cd-cols">
          <section className="cd-qcard" aria-label="Câu hỏi">
            {question && <h3 className="cd-q">{question}</h3>}
            {options}
            {hint && <p className="cd-hint">Bấm “Vì sao” để xem lý do của từng đáp án.</p>}
          </section>
          <aside className="cd-panel">
            <div className="cd-pbody"><ExplainBody m={m} view={view} actions={actions} /></div>
            <Actions m={m} actions={actions} />
          </aside>
        </div>
      )}
    </div>
  );
}
