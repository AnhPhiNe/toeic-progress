import { useState, type ReactNode } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { isDueForReview } from '@/features/mistakes/lib/spacedRepetition';
import { Soc } from '@/shared/ui/soc/Soc';
import { SourceImageViewer } from './SourceImageViewer';
import { AnswerDoubtNote } from './AnswerDoubtNote';
import { canExplain } from './MistakeCard';

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

/** Mark the evidence sentence inside the passage, when the AI quoted it exactly. */
function withEvidence(text: string, evidence: string, show: boolean): ReactNode {
  const e = evidence.trim().replace(/^["“]|["”]$/g, '');
  if (!show || e.length < 6) return text;
  const i = text.toLowerCase().indexOf(e.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="nbd-ev">{text.slice(i, i + e.length)}</mark>{text.slice(i + e.length)}</>;
}

/**
 * One card per mistake (design/previews/mock-detail-v3.html): answers only by default; "Xem giải thích" adds
 * each option's meaning, the passage translation with the evidence marked, why, words and tip.
 */
export function MistakeDetail({ mistake: m, testName, actions, onBack }: { mistake: MistakeEntry; testName?: string; actions: MistakeDetailActions; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(false);
  const chosen = getUserChoice(m);
  const answer = optionLetter(m.correctAnswer);
  const notes = m.optionNotes ?? [];
  const ex = m.explanation;
  const due = reviewLabel(m);
  const question = (m.question ?? m.questionContext ?? '').trim();
  const context = (m.context ?? '').trim();
  const posDiffer = new Set(notes.map(n => n.pos).filter(Boolean)).size > 1;
  const hasExplain = Boolean(ex && (ex.analysis || ex.translation || ex.keyVocabulary || ex.quickTip || ex.evidence)) || notes.some(n => n.meaning) || Boolean(m.trapTip);
  const tip = ex?.quickTip || m.trapTip || '';

  return (
    <div className="nbd">
      <button type="button" className="nbd-back" onClick={onBack}>← Sổ tay</button>
      <article className="nbd-card">
        <header className="nbd-head">
          <div>
            <h2>{m.questionNumber ? `Câu ${m.questionNumber}, ` : ''}Part {m.part}</h2>
            <p>{testName ? `${testName} · ` : ''}{categoryShort(m.category)} · <b className={due.due ? 'is-due' : undefined}>{due.text}</b></p>
          </div>
          <div className="nbd-links">
            {m.sourceImageIds?.length ? <button type="button" onClick={() => setImage(v => !v)} aria-expanded={image}>Ảnh gốc</button> : null}
            <button type="button" onClick={actions.onEdit}>Sửa</button>
          </div>
        </header>
        {image && <div className="nbd-img"><SourceImageViewer ids={m.sourceImageIds} part={m.part} /></div>}
        {m.answerDoubt && answer !== m.answerDoubt && <AnswerDoubtNote doubt={m.answerDoubt} current={answer} onSwitch={() => actions.onResolveDoubt(true)} onKeep={() => actions.onResolveDoubt(false)} />}

        {context && (
          <div className="nbd-ctx">
            <p>{withEvidence(context, ex?.evidence ?? '', open)}</p>
            {open && ex?.translation && <p className="nbd-tr">{ex.translation}</p>}
          </div>
        )}
        {question && <h3 className="nbd-q">{question}</h3>}
        {!context && open && ex?.translation && <p className="nbd-tr is-solo">{ex.translation}</p>}

        {m.options?.length ? (
          <ol className="nbd-opts">
            {m.options.map(option => {
              const letter = optionLetter(option);
              const note = notes.find(n => n.label === letter);
              const isAnswer = letter === answer, isChosen = letter === chosen && !isAnswer;
              return (
                <li key={option} className={isAnswer ? 'is-ans' : isChosen ? 'is-pick' : undefined}>
                  <div className="nbd-ot">
                    <span>{option}{open && posDiffer && note?.pos ? <em className="nbd-pos">{note.pos}</em> : null}</span>
                    {isAnswer && <small>đáp án</small>}{isChosen && <small>bạn chọn</small>}
                  </div>
                  {open && note?.meaning && <p className="nbd-mean">{note.meaning}</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="nbd-plain"><p><b>Bạn chọn:</b> {m.userMistake || '—'}</p><p><b>Đáp án:</b> {m.correctAnswer || '—'}</p></div>
        )}

        {open && (
          <div className="nbd-why">
            {ex?.analysis && <div className="nbd-say"><Soc state="idle" size={54} /><p>{ex.analysis}</p></div>}
            {m.userReason && <p className="nbd-mine"><b>Bạn ghi:</b> {m.userReason}</p>}
            {(ex?.keyVocabulary || tip) && (
              <div className="nbd-two">
                {ex?.keyVocabulary && <div><small>Từ cần nhớ</small><p>{ex.keyVocabulary}</p></div>}
                {tip && <div><small>Mẹo</small><p>{tip}</p></div>}
              </div>
            )}
          </div>
        )}

        <div className="nbd-foot">
          {hasExplain
            ? <button type="button" className="nbd-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? 'Ẩn giải thích ▴' : 'Xem giải thích ▾'}</button>
            : canExplain(m) ? <button type="button" className="nbd-toggle" onClick={actions.onExplain} disabled={actions.explaining}>{actions.explaining ? 'Sóc đang viết lời giải…' : `${actions.explainLabel} ✨`}</button>
            : <span />}
        </div>
      </article>
      <div className="nbd-actions">
        {due.due && <button type="button" className="rd-btn rd-btn--pink" onClick={actions.onReview}>Ôn câu này</button>}
        {m.status === 'MASTERED'
          ? <button type="button" className="rd-btn rd-btn--white" onClick={actions.onReopen}>Ôn lại từ đầu</button>
          : <button type="button" className="rd-btn rd-btn--white" onClick={actions.onMarkMastered}>Đã thuộc</button>}
        <button type="button" className="nbd-del" onClick={actions.onDelete}>Xoá câu này</button>
      </div>
    </div>
  );
}
