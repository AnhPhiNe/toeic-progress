import { useEffect, useState } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import type { ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { Soc } from '@/shared/ui/soc/Soc';
import './review-rd.css';

interface Props {
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, answer: ReviewAnswer) => { before: MistakeEntry; after: MistakeEntry };
}

/**
 * Reviewing due mistakes on computers (design/previews/mock-notebook.html, "Đang ôn"): try the question again,
 * see your pick against the answer with Sóc's explanation, then "Hiểu rồi" or "Vẫn chưa chắc".
 */
export function ReviewSession({ cards, onClose, onGrade }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [more, setMore] = useState(false);
  const [tally, setTally] = useState({ got: 0, again: 0 });
  const [error, setError] = useState('');
  const done = index >= cards.length;
  const card = cards[Math.min(index, cards.length - 1)];
  const quiz = card ? resolveQuizOptions(card) : null;
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };
  const answer = quiz && quiz.correctIndex >= 0 ? quiz.options[quiz.correctIndex].letter : '';
  const before = card ? getUserChoice(card) : '';
  const right = picked !== null && picked === answer;

  const pick = (letter: string) => { if (!revealed) { setPicked(letter); setRevealed(true); } };
  const grade = (understood: boolean) => {
    if (!card) return;
    try {
      onGrade(card, understood ? (right || picked === null ? 'GOOD' : 'HARD') : 'AGAIN');
      setTally(t => understood ? { ...t, got: t.got + 1 } : { ...t, again: t.again + 1 });
      setIndex(i => i + 1); setPicked(null); setRevealed(false); setMore(false); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được lịch ôn.'); }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (done || !quiz) return;
      if (!revealed && quizMode) {
        const n = ['1', '2', '3', '4'].indexOf(e.key), l = 'ABCD'.indexOf(e.key.toUpperCase());
        const i = n >= 0 ? n : l;
        if (i >= 0 && quiz.options[i]) { e.preventDefault(); pick(quiz.options[i].letter); }
      } else if (revealed && e.key === 'Enter') { e.preventDefault(); grade(true); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (done) {
    return (
      <div className="rd rv" role="dialog" aria-modal="true" aria-label="Ôn xong">
        <div className="rv-done">
          <Soc state="cheerB" size={150} />
          <h2>Xong {cards.length} câu!</h2>
          <p>Hiểu rồi <b>{tally.got}</b> · Ôn lại ngày mai <b>{tally.again}</b>. Hôm nay đã tính vào chuỗi ngày.</p>
          <button type="button" className="rd-btn" onClick={onClose}>Về Sổ tay</button>
        </div>
      </div>
    );
  }

  const ex = card.explanation;
  const why = ex?.analysis || card.trapTip || '';
  const meta = [`Part ${card.part}`, card.questionNumber ? `Câu ${card.questionNumber}` : '', card.sourceTestName ?? ''].filter(Boolean).join(' · ');
  return (
    <div className="rd rv" role="dialog" aria-modal="true" aria-label="Ôn câu sai">
      <div className="rv-bar"><b>Ôn câu sai<span>{index + 1} / {cards.length}</span></b><button type="button" className="rv-x" onClick={onClose}>× Thoát</button></div>
      <div className="rv-prog"><i style={{ width: `${(index + (revealed ? 0.5 : 0)) / cards.length * 100}%` }} /></div>
      <article className="rv-card">
        <small>{meta}</small>
        {context && <p className="rv-ctx">{context}</p>}
        <h3 className="rv-q">{question}</h3>
        {quizMode && quiz ? (
          <div className="rv-opts" role="group" aria-label="Chọn đáp án">
            {quiz.options.map(o => {
              const isAns = o.letter === answer, isPick = o.letter === picked;
              const cls = !revealed ? '' : isAns ? 'is-ok' : isPick ? 'is-bad' : 'is-dim';
              return (
                <button key={o.letter} type="button" className={'rv-o ' + cls} disabled={revealed} onClick={() => pick(o.letter)}>
                  <span><b>({o.letter})</b> {o.text}</span>
                  {revealed && isAns && <em>{isPick ? 'đúng rồi' : 'đáp án'}</em>}
                  {revealed && isPick && !isAns && <em>bạn chọn</em>}
                  {revealed && more && o.note?.meaning && <small>{o.note.meaning}</small>}
                </button>
              );
            })}
          </div>
        ) : (
          revealed ? <div className="rv-plain"><b>Đáp án:</b> {card.correctAnswer}</div>
            : <button type="button" className="rd-btn rd-btn--white rv-show" onClick={() => setRevealed(true)}>Xem đáp án</button>
        )}
        {revealed && (
          <div className="rv-ex">
            <Soc state={right ? 'cheerC' : 'idle'} size={64} />
            <p>{right ? <><b>Lần này đúng rồi!</b>{before && before !== answer ? ` Lần trước bạn chọn (${before}).` : ''} </> : null}{why || (right ? '' : `Đáp án là (${answer || card.correctAnswer}).`)}</p>
          </div>
        )}
      </article>
      {error && <p role="alert" className="rv-err">{error}</p>}
      {revealed ? (
        <>
          <div className="rv-acts">
            <button type="button" className="rd-btn rd-btn--white" onClick={() => grade(false)}>Vẫn chưa chắc</button>
            <button type="button" className="rd-btn" onClick={() => grade(true)}>Hiểu rồi</button>
          </div>
          <p className="rv-hint">"Hiểu rồi" thì vài ngày sau Sóc hỏi lại, "Vẫn chưa chắc" thì ngày mai.
            {quiz?.options.some(o => o.note?.meaning) && !more && <button type="button" onClick={() => setMore(true)}>Xem nghĩa từng phương án</button>}</p>
        </>
      ) : <p className="rv-hint">Chọn lại phương án lần này. Phím 1–4 cũng được.</p>}
    </div>
  );
}
