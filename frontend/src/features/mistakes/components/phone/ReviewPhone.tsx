import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import type { MistakeEntry } from '@/shared/types';
import { isSoundMuted, playChime, setSoundMuted } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { nextReviewLine } from '@/features/mistakes/lib/notebookSummary';
import { missedPick, reviewRating, type ReviewAnswer, type ReviewRating } from '@/features/mistakes/lib/spacedRepetition';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { isNumberLabel } from '@/features/mistakes/lib/questionSnippet';
import { groupLabel, groupNumbers, reviewFocus, splitFocus } from '@/features/mistakes/lib/passageFocus';
import { getTodayDateString, loadMistakes } from '@/shared/data/storage';
import { Soc } from '@/shared/ui/soc/Soc';
import { PhoneSheet } from '@/app/components/phone';
import { PassageText } from '../PassageText';
import { categoryChip, PART_COLORS } from './partStyle';
import './phone-notebook.css';

interface Props {
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, answer: ReviewAnswer) => { before: MistakeEntry; after: MistakeEntry; undo?: () => void };
  /** Passed by App for the old review; this one grades from the snapshot it was given, so it is unused. */
  onReload?: (id: string) => MistakeEntry | undefined;
}

interface LastGrade {
  index: number;
  rating: ReviewRating;
  picked: string | null;
  undo: () => void;
}

/**
 * Reviewing due mistakes on phones (design/previews/mock-phone-notebook.html): one question full screen, four big options,
 * Sóc's explanation, then "Vẫn chưa chắc" or "Hiểu rồi" with the grading of the computer ReviewSession.
 */
export function ReviewPhone({ cards, onClose, onGrade }: Props) {
  const ref = useModalA11y(true, onClose);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ got: 0, again: 0 });
  const [lastGrade, setLastGrade] = useState<LastGrade | null>(null);
  const [error, setError] = useState('');
  const [fullOpen, setFullOpen] = useState(false);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(isSoundMuted);
  const doneSoundRef = useRef(false);
  const done = index >= cards.length;
  useEffect(() => {
    if (done && cards.length > 0 && !doneSoundRef.current) {
      doneSoundRef.current = true;
      playChime('complete');
      triggerHaptic(12);
    } else if (!done) {
      doneSoundRef.current = false;
    }
  }, [done, cards.length]);
  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
  };
  const card = cards[Math.min(index, cards.length - 1)];
  const quiz = useMemo(() => card ? resolveQuizOptions(card) : null, [card]);
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };
  const answer = quiz && quiz.correctIndex >= 0 ? quiz.options[quiz.correctIndex].letter : '';
  const before = card ? getUserChoice(card) : '';
  const right = picked !== null && picked === answer;
  const missedQuiz = missedPick(picked, answer);
  const showPassage = card ? card.part >= 6 && Boolean(context) : false;
  const [more, setMore] = useState(false);

  const pick = (letter: string) => {
    if (revealed) return;
    setPicked(letter);
    setRevealed(true);
    if (letter === answer) {
      playChime('correct');
      triggerHaptic(8);
      setCombo(c => c + 1);
    } else {
      playChime('wrong');
      setCombo(0);
    }
  };
  const grade = (understood: boolean) => {
    if (!card) return;
    try {
      const rating = reviewRating(understood, picked, answer);
      if (rating === 'AGAIN') setCombo(0);
      const graded = onGrade(card, rating);
      setTally(t => rating === 'AGAIN' ? { ...t, again: t.again + 1 } : { ...t, got: t.got + 1 });
      setLastGrade(graded.undo ? { index, rating, picked, undo: graded.undo } : null);
      setIndex(i => i + 1); setPicked(null); setRevealed(false); setError(''); setFullOpen(false); setMore(false);
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
      setLastGrade(null);
      setError('');
      setFullOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa hoàn tác được lần chấm vừa rồi.');
    }
  };

  if (done) {
    return createPortal(
      <div ref={ref} className="rd pr" role="dialog" aria-modal="true" aria-label="Ôn xong" tabIndex={-1}>
        <div className="pr-done">
          <Soc state="cheerC" size={150} />
          <h2>Xong {cards.length} câu!</h2>
          <p>Hiểu rồi <b>{tally.got}</b> · Ôn lại ngày mai <b>{tally.again}</b>. Hôm nay đã tính vào chuỗi ngày.</p>
          <p className="pr-next">{nextReviewLine(loadMistakes(), getTodayDateString())}</p>
          {error && <p role="alert" className="pr-err">{error}</p>}
        </div>
        <div className="pr-bot">
          {lastGrade && <button type="button" className="pr-btn pr-btn--white" onClick={undoLast}>Hoàn tác</button>}
          <button type="button" className="pr-btn pr-btn--go" onClick={onClose}>Về Sổ tay</button>
        </div>
      </div>, document.body);
  }

  const ex = card.explanation;
  const quickTip = ex?.quickTip?.trim() || '';
  const analysis = ex?.analysis?.trim() || card.trapTip?.trim() || '';
  const evidence = ex?.evidence?.trim() || '';
  const paraphrase = ex?.paraphrase?.trim() || '';
  const translation = ex?.translation?.trim() || '';
  const keyVocabulary = ex?.keyVocabulary?.trim() || '';
  const reason = card.userReason?.trim() || '';
  const hasExtras = Boolean(paraphrase || translation || keyVocabulary);
  const sayLine = right || analysis;
  const hasWhy = Boolean(quickTip || sayLine || reason || evidence || hasExtras);
  const chip = categoryChip(card.category);
  const partColor = PART_COLORS[card.part] ?? '#7c5ce0';
  const meta = (
    <>
      <span className="pr-chip" style={{ background: partColor, color: '#fff' }}>Part {card.part}{card.questionNumber ? ` · câu ${card.questionNumber}` : ''}</span>
      {chip && <span className="pr-chip" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>}
    </>
  );

  return createPortal(
    <div ref={ref} className="rd pr" role="dialog" aria-modal="true" aria-label="Ôn câu sai" tabIndex={-1}>
      <div className="pr-top">
        <button type="button" className="pr-x" aria-label="Thoát ôn tập" onClick={onClose}>×</button>
        <span className="pr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={index}><i style={{ width: `${(index + (revealed ? 0.5 : 0)) / cards.length * 100}%` }} /></span>
        {combo >= 2 && <span className="rv-combo is-sm" aria-live="polite">🔥×{combo}</span>}
        <button type="button" className="rv-mute" onClick={toggleMute} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}>
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
        {lastGrade && <button type="button" className="pr-undo" onClick={undoLast}>↶ Hoàn tác</button>}
        <small>{index + 1}/{cards.length}</small>
      </div>

      <div className="pr-main">
        {showPassage ? (
          <PassageBox key={card.id} card={card} context={context} revealed={revealed} meta={meta} onFull={() => setFullOpen(true)} />
        ) : (
          <div className="pr-meta">{meta}</div>
        )}
        {!showPassage && context && <p className="pr-ctx">{context}</p>}
        {question && !isNumberLabel(question) && <h3 className={'pr-q' + (showPassage ? ' is-sm' : '')}>{question}</h3>}

        {quizMode && quiz ? (
          <div className="pr-opts" role="group" aria-label="Chọn đáp án">
            {quiz.options.map(o => {
              const isAns = o.letter === answer, isPick = o.letter === picked;
              const cls = !revealed ? '' : isAns ? ' is-ok' : isPick ? ' is-bad' : ' is-dim';
              return (
                <button key={o.letter} type="button" className={'pr-opt' + cls} disabled={revealed} onClick={() => pick(o.letter)}>
                  <em>{o.letter}</em><span>{o.text}</span>
                  {revealed && isAns && <small>{isPick ? 'đúng rồi' : 'đáp án'}</small>}
                  {revealed && isPick && !isAns && <small>bạn chọn</small>}
                </button>
              );
            })}
          </div>
        ) : revealed ? (
          <div className="pr-plain"><b>Đáp án:</b> {card.correctAnswer}</div>
        ) : (
          <button type="button" className="pr-btn pr-btn--white" onClick={() => setRevealed(true)}>Xem đáp án</button>
        )}

        {revealed ? hasWhy && (
          <div className="pr-why">
            <Soc state={right ? 'cheerC' : 'idle'} size={56} />
            <div className="pr-why-body">
              {quickTip && <p className="pr-tip"><b>Mẹo nhanh:</b> {quickTip}</p>}
              {sayLine && <p>{right ? <><b>Lần này đúng rồi!</b>{before && before !== answer ? ` Lần trước bạn chọn (${before}).` : ''} </> : null}{analysis}</p>}
              {reason && <p className="pr-extra"><b>Bạn ghi:</b> {reason}</p>}
              {evidence && <span className="pr-quote">“{evidence.replace(/^["“”]|["“”]$/g, '')}”</span>}
              {more && paraphrase && <p className="pr-extra"><b>Tương đương:</b> {paraphrase}</p>}
              {more && translation && <p className="pr-extra"><b>Dịch nghĩa:</b> {translation}</p>}
              {more && keyVocabulary && <p className="pr-extra"><b>Từ vựng:</b> {keyVocabulary}</p>}
              {hasExtras && <button type="button" className="pr-morebtn" aria-expanded={more} onClick={() => setMore(v => !v)}>{more ? 'Ẩn bớt ▴' : 'Xem thêm ▾'}</button>}
            </div>
          </div>
        ) : (
          <div className="pr-hint"><Soc state="focus" size={52} /><span>{before ? `Lần trước bạn chọn (${before}). Thử lại nhé!` : 'Thử chọn lại, Sóc đợi nhé!'}</span></div>
        )}
        {error && <p role="alert" className="pr-err">{error}</p>}
      </div>

      {revealed && (
        <div className="pr-bot">
          {missedQuiz
            // A wrong pick is reviewed again tomorrow whichever button is pressed, so there is only one.
            ? <button type="button" className="pr-btn pr-btn--go" onClick={() => grade(false)}>Tiếp</button>
            : <>
              <button type="button" className="pr-btn pr-btn--white" onClick={() => grade(false)}>Vẫn chưa chắc</button>
              <button type="button" className="pr-btn pr-btn--go" onClick={() => grade(true)}>Hiểu rồi</button>
            </>}
        </div>
      )}

      {fullOpen && showPassage && (
        <FullPassage card={card} context={context} revealed={revealed} onClose={() => setFullOpen(false)} />
      )}
    </div>, document.body);
}

/** Fixed-height box: the reading text scrolled to the highlighted sentence. It shrinks after the answer. */
function PassageBox({ card, context, revealed, meta, onFull }: {
  card: MistakeEntry; context: string; revealed: boolean; meta: React.ReactNode; onFull: () => void;
}) {
  const short = revealed;
  const range = useMemo(() => reviewFocus(context, card, revealed), [card, context, revealed]);
  const parts = splitFocus(context, range);
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLElement>(null);
  const siblings = useMemo(() => groupLabel(groupNumbers(card, loadMistakes())), [card]);
  const center = () => {
    const el = box.current, hl = mark.current;
    if (!el || !hl) return;
    el.scrollTop = Math.max(0, hl.offsetTop - (el.clientHeight - hl.offsetHeight) / 2);
  };
  useLayoutEffect(center, [short, parts.focus]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(center);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={'pr-psg' + (short ? ' is-short' : '')} aria-label="Đoạn văn">
      <div className="pr-phd">{meta}{siblings && <span className="pr-grp">{siblings}</span>}</div>
      <div className="pr-ptx" ref={box} tabIndex={0} aria-label="Đoạn văn của câu này">
        <p>{parts.before}{parts.focus && <mark ref={mark}>{parts.focus}</mark>}{parts.after}</p>
      </div>
      <button type="button" className="pr-more" onClick={onFull}>Xem cả đoạn ⌄</button>
    </section>
  );
}

/** Sheet with the whole passage, the highlight kept, and the numbers of the questions that share it. */
function FullPassage({ card, context, revealed, onClose }: { card: MistakeEntry; context: string; revealed: boolean; onClose: () => void }) {
  const range = useMemo(() => reviewFocus(context, card, revealed), [card, context, revealed]);
  const parts = splitFocus(context, range);
  const numbers = useMemo(() => groupNumbers(card, loadMistakes()), [card]);
  const mark = useRef<HTMLElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: 'center' }); }, []);
  return (
    <PhoneSheet title={`Đoạn văn · câu ${groupLabel(numbers) || card.questionNumber || ''}`.trim()} onClose={onClose}>
      {parts.focus ? <p className="pr-full">{parts.before}<mark ref={mark}>{parts.focus}</mark>{parts.after}</p>
        : <PassageText className="pr-full" text={context} />}
      {numbers.length > 0 && (
        <div className="pr-nums">Câu trong nhóm:
          {numbers.map(n => <span key={n} className={n === card.questionNumber ? 'is-me' : ''}>{n}</span>)}
        </div>
      )}
    </PhoneSheet>
  );
}
