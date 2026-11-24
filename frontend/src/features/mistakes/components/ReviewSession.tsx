import { useEffect, useMemo, useRef, useState } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { missedPick, reviewRating, type ReviewAnswer, type ReviewRating } from '@/features/mistakes/lib/spacedRepetition';
import { nextReviewLine } from '@/features/mistakes/lib/notebookSummary';
import { isNumberLabel } from '@/features/mistakes/lib/questionSnippet';
import { cardEvidences, markPassage, signalLine } from '@/features/mistakes/lib/cardDetail';
import { getTodayDateString, loadMistakes } from '@/shared/data/storage';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { PassageText } from './PassageText';
import { EvidenceJumper, EvidencePassage, SignalBlock, TipBlock, useEvidenceJump } from './CardParts';
import { Soc } from '@/shared/ui/soc/Soc';
import './review-rd.css';

interface Props {
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, answer: ReviewAnswer) => { before: MistakeEntry; after: MistakeEntry; undo?: () => void };
}

interface LastGrade {
  index: number;
  rating: ReviewRating;
  picked: string | null;
  undo: () => void;
}

/**
 * Reviewing due mistakes on computers in the Card-v2 aesthetic: centered layout (or 2-column passage + question
 * for reading cards), Sóc mascot feedback, yellow evidence highlights on reveal, and celebratory finish screen.
 */
export function ReviewSession({ cards, onClose, onGrade }: Props) {
  const dialogRef = useModalA11y(true, onClose);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [more, setMore] = useState(false);
  const [tally, setTally] = useState({ got: 0, again: 0 });
  const [lastGrade, setLastGrade] = useState<LastGrade | null>(null);
  const [error, setError] = useState('');
  const done = index >= cards.length;
  const card = cards[Math.min(index, cards.length - 1)];
  const quiz = card ? resolveQuizOptions(card) : null;
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };
  const reading = Boolean(context.trim());
  const answer = quiz && quiz.correctIndex >= 0 ? quiz.options[quiz.correctIndex].letter : '';
  const before = card ? getUserChoice(card) : '';
  const right = picked !== null && picked === answer;
  const missedQuiz = missedPick(picked, answer);
  const firstOption = useRef<HTMLButtonElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);

  const evidences = useMemo(() => (card && reading ? cardEvidences(card) : []), [card, reading]);
  const marked = useMemo(() => (reading && revealed ? markPassage(context, evidences) : { blocks: [], count: 0 }), [reading, revealed, context, evidences]);
  const jump = useEvidenceJump(reading && revealed ? marked.count : 0, `${card?.id ?? ''}:${revealed ? '1' : '0'}`);

  const pick = (letter: string) => { if (!revealed) { setPicked(letter); setRevealed(true); } };
  const grade = (understood: boolean) => {
    if (!card) return;
    try {
      const rating = reviewRating(understood, picked, answer);
      const graded = onGrade(card, rating);
      setTally(t => rating === 'AGAIN' ? { ...t, again: t.again + 1 } : { ...t, got: t.got + 1 });
      setLastGrade(graded.undo ? { index, rating, picked, undo: graded.undo } : null);
      setIndex(i => i + 1); setPicked(null); setRevealed(false); setMore(false); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được lịch ôn.'); }
  };

  const undoLast = () => {
    if (!lastGrade) return;
    try {
      lastGrade.undo();
      setTally(t => lastGrade.rating === 'AGAIN'
        ? { ...t, again: Math.max(0, t.again - 1) }
        : { ...t, got: Math.max(0, t.got - 1) });
      setIndex(lastGrade.index);
      setPicked(lastGrade.picked);
      setRevealed(true);
      setMore(false);
      setLastGrade(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa hoàn tác được lần chấm vừa rồi.');
    }
  };

  // Focus follows the step: the first option (or "Xem đáp án") on a new card, the main rating once answered.
  useEffect(() => {
    if (done) return;
    (revealed ? primary.current : firstOption.current ?? showButton.current)?.focus({ preventScroll: true });
  }, [index, revealed, done]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || done) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.key === 'Enter') {
        const onButton = target?.closest('button');
        if (onButton && !onButton.classList.contains('rv-x')) return;
        e.preventDefault();
        if (revealed) grade(!missedQuiz);
        else if (!quizMode) setRevealed(true);
        return;
      }
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (revealed) {
        if (!missedQuiz && (e.key === '0' || e.key === 'Backspace')) { e.preventDefault(); grade(false); }
        return;
      }
      if (!quiz || !quizMode) return;
      const n = ['1', '2', '3', '4'].indexOf(e.key), l = 'ABCD'.indexOf(e.key.toUpperCase());
      const i = n >= 0 ? n : l;
      if (i >= 0 && quiz.options[i]) { e.preventDefault(); pick(quiz.options[i].letter); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (done) {
    const perfect = tally.again === 0 && tally.got > 0;
    return (
      <div ref={dialogRef} tabIndex={-1} className="rd rv" role="dialog" aria-modal="true" aria-label="Ôn xong">
        <div className="rv-done">
          <div className="rv-conf" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
          <Soc state={perfect ? 'yay' : 'cheerB'} size={160} />
          <h2>Xong {cards.length} câu!</h2>
          <p className="rv-done-sub">{perfect ? 'Chuẩn hết lượt này luôn — Sóc vỗ tay!' : 'Hôm nay đã tính vào chuỗi ngày. Câu chưa chắc Sóc hẹn mai ôn tiếp.'}</p>
          <div className="rv-stats" aria-label="Tổng kết phiên ôn">
            <div className="is-ok"><b>{tally.got}</b><span>Hiểu rồi</span></div>
            <div className="is-again"><b>{tally.again}</b><span>Ôn lại ngày mai</span></div>
          </div>
          <p className="rv-next">{nextReviewLine(loadMistakes(), getTodayDateString())}</p>
          {error && <p role="alert" className="rv-err">{error}</p>}
          <div className="rv-done-acts">
            {lastGrade && <button type="button" className="rd-btn rd-btn--white" onClick={undoLast}>Hoàn tác câu vừa chấm</button>}
            <button type="button" className="rd-btn rd-btn--pink" onClick={onClose}>Về Sổ tay</button>
          </div>
        </div>
      </div>
    );
  }

  const ex = card.explanation;
  const quickTip = (ex?.quickTip || (!ex ? card.trapTip : '') || '').trim();
  const signal = signalLine(ex?.analysis);
  const analysis = ex?.analysis?.trim() || (!quickTip ? card.trapTip?.trim() || '' : '');
  const evidence = !marked.count ? (ex?.evidence?.trim() || '') : '';
  const paraphrase = ex?.paraphrase?.trim() || '';
  const translation = !marked.count ? (ex?.translation?.trim() || '') : '';
  const keyVocabulary = ex?.keyVocabulary?.trim() || (ex?.words?.length ? ex.words.map(w => `${w.word}: ${w.meaning}`).join(' · ') : '');
  const reason = card.userReason?.trim() || '';
  const hasExtraDetails = Boolean((!signal && analysis) || evidence || paraphrase || translation || keyVocabulary);
  const hasMeanings = Boolean(quiz?.options.some(o => o.note?.meaning || o.note?.reason));
  const subMeta = [card.questionNumber ? `Câu ${card.questionNumber}` : '', card.sourceTestName ?? ''].filter(Boolean).join(' · ');
  const socMood = !revealed ? 'idle' : right ? 'cheerC' : 'focus';

  const questionCard = (
    <article className="rv-card">
      <div className="rv-meta">
        <span className={'rv-part p' + card.part}>Part {card.part}</span>
        {subMeta && <small>{subMeta}</small>}
      </div>
      {question && !isNumberLabel(question) && <h3 className={'rv-q' + (reading ? ' is-sm' : '')}>{question}</h3>}
      {quizMode && quiz ? (
        <div className={'rv-opts' + (reading ? ' is-stack' : '')} role="group" aria-label="Chọn đáp án">
          {quiz.options.map((o, i) => {
            const isAns = o.letter === answer, isPick = o.letter === picked;
            const cls = !revealed ? '' : isAns ? 'is-ok' : isPick ? 'is-bad' : 'is-dim';
            const noteLine = o.note?.reason || o.note?.meaning || '';
            const showNote = revealed && Boolean(noteLine) && (isAns || isPick || more);
            return (
              <button key={o.letter} ref={i === 0 ? firstOption : undefined} type="button" className={'rv-o ' + cls} disabled={revealed} onClick={() => pick(o.letter)}>
                <div className="rv-ot">
                  <span className="rv-lt" aria-hidden="true">{o.letter}</span>
                  <span className="rv-tx"><span className="sr-only">({o.letter}) </span>{o.text}</span>
                  {revealed && isAns && <em>{isPick ? 'đúng rồi' : 'đáp án'}</em>}
                  {revealed && isPick && !isAns && <em>bạn chọn</em>}
                </div>
                {showNote && <small className="rv-why">{o.note?.meaning && o.note?.reason && !reading ? <><b>{o.note.meaning}</b> — {o.note.reason}</> : noteLine}</small>}
              </button>
            );
          })}
        </div>
      ) : (
        revealed ? <div className="rv-plain"><b>Đáp án:</b> {card.correctAnswer || 'Chưa ghi đáp án'}</div>
          : <button ref={showButton} type="button" className="rd-btn rd-btn--white rv-show" onClick={() => setRevealed(true)}>Xem đáp án</button>
      )}

      {revealed && (
        <div className="rv-fb">
          {quizMode && (
            <div className={'rv-say ' + (right ? 'is-ok' : 'is-bad')}>
              <Soc state={right ? 'cheerC' : 'focus'} size={54} />
              <p>
                {right
                  ? <><b>Lần này đúng rồi!</b>{before && before !== answer ? ` Lần trước bạn chọn (${before}).` : ' Giữ chắc phản xạ này nhé.'}</>
                  : <><b>Chưa khớp đáp án ({answer}).</b>{before && before === picked ? ' Bạn vừa dính lại đúng bẫy lần trước — xem kỹ mẹo bên dưới nhé.' : ' Đọc nhanh mẹo bên dưới để nhớ ngay.'}</>}
              </p>
            </div>
          )}
          {quickTip && <TipBlock tip={quickTip} size={48} />}
          {signal && <SignalBlock text={signal} />}
          {reason && <p className="rv-mine"><b>Bạn ghi:</b> {reason}</p>}
          {more && hasExtraDetails && (
            <dl className="rv-details">
              {!signal && analysis && <div><dt>Phân tích</dt><dd>{analysis}</dd></div>}
              {evidence && <div><dt>Bằng chứng</dt><dd>“{evidence.replace(/^["“”]|["“”]$/g, '')}”</dd></div>}
              {paraphrase && <div><dt>Diễn đạt tương đương</dt><dd>{paraphrase}</dd></div>}
              {translation && <div><dt>Dịch nghĩa</dt><dd>{translation}</dd></div>}
              {keyVocabulary && <div><dt>Từ vựng cần nhớ</dt><dd>{keyVocabulary}</dd></div>}
            </dl>
          )}
        </div>
      )}
    </article>
  );

  return (
    <div ref={dialogRef} tabIndex={-1} className="rd rv" role="dialog" aria-modal="true" aria-label="Ôn câu sai">
      <div className={'rv-wrap' + (reading ? ' is-reading' : '')}>
        <div className="rv-bar">
          <div className="rv-bar-l">
            <Soc state={socMood} size={42} />
            <b>Ôn câu sai<span>{index + 1} / {cards.length}</span></b>
          </div>
          <div className="rv-bar-acts">
            {lastGrade && <button type="button" className="rv-undo" onClick={undoLast}>↶ Hoàn tác câu trước</button>}
            <button type="button" className="rv-x" onClick={onClose}>× Thoát</button>
          </div>
        </div>
        <div className="rv-prog"><i style={{ width: `${(index + (revealed ? 0.5 : 0)) / cards.length * 100}%` }} /></div>

        {reading ? (
          <div className="rv-cols">
            <section className="rv-pcard" aria-label="Đoạn văn">
              <div className="rv-phd">
                <span>Đoạn văn</span>
                {revealed && marked.count > 1
                  ? <EvidenceJumper at={jump.at} count={marked.count} onNext={jump.next} />
                  : revealed && marked.count === 1 ? <span>Câu bằng chứng tô vàng</span> : null}
              </div>
              <div className="rv-pscroll" ref={jump.box} tabIndex={0} aria-label="Nội dung đoạn văn">
                {revealed && marked.count > 0
                  ? <EvidencePassage context={context} evidences={evidences} marked={marked} at={marked.count > 1 ? jump.at : -1} />
                  : <PassageText className="cd-psg" text={context} />}
              </div>
            </section>
            <div className="rv-right">
              {questionCard}
            </div>
          </div>
        ) : (
          questionCard
        )}

        {error && <p role="alert" className="rv-err">{error}</p>}
        {revealed ? (
          <div className="rv-foot">
            <div className="rv-acts">
              {missedQuiz
                ? <button ref={primary} type="button" className="rd-btn rd-btn--pink" aria-keyshortcuts="Enter" onClick={() => grade(false)}>Tiếp<kbd aria-hidden="true">Enter</kbd></button>
                : <>
                  <button type="button" className="rd-btn rd-btn--white" aria-keyshortcuts="0" onClick={() => grade(false)}>Vẫn chưa chắc<kbd aria-hidden="true">0</kbd></button>
                  <button ref={primary} type="button" className="rd-btn" aria-keyshortcuts="Enter" onClick={() => grade(true)}>Hiểu rồi<kbd aria-hidden="true">Enter</kbd></button>
                </>}
            </div>
            {(hasMeanings || hasExtraDetails) && !more && (
              <p className="rv-hint"><button type="button" onClick={() => setMore(true)}>{hasMeanings && !hasExtraDetails ? 'Xem nghĩa từng phương án' : 'Xem thêm giải thích'}</button></p>
            )}
          </div>
        ) : (
          <p className="rv-hint">{quizMode ? 'Chọn lại phương án lần này. Phím 1–4 hoặc A–D đều được.' : 'Nhớ lại đáp án rồi bấm Xem đáp án hoặc nhấn Enter.'}</p>
        )}
      </div>
    </div>
  );
}
