import { Fragment, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { EvidenceNote, KeyWord } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { markPassage, quotedParts, type MarkedBlock, type OptionRow } from '@/features/mistakes/lib/cardDetail';
import './card-detail.css';

const normPart6 = (s: string) => s.toLowerCase().replace(/[_＿—–-]{2,}|\[?\b\d{1,3}\b\]?|[.,;:!?\s]+/g, ' ').trim();

/** True when a Part 6 card's `question` merely repeats the gapped sentence already visible inside `context`. */
export function isDuplicatePart6Question(part: number, question: string, context: string): boolean {
  if (part !== 6 || !question || !context) return false;
  const qn = normPart6(question);
  if (qn.length < 12) return false;
  const cn = normPart6(context);
  return cn.includes(qn);
}

/** Question heading: formats Part 5 blanks & quoted signal clues, or shows a compact Part 6 cue instead of duplicating the blank sentence. */
export function QuestionHeading({
  part, question, context, questionNumber, signal = '', showClues = false, small = false
}: {
  part: number;
  question: string;
  context: string;
  questionNumber?: number;
  signal?: string;
  showClues?: boolean;
  small?: boolean;
}) {
  if (isDuplicatePart6Question(part, question, context)) {
    return (
      <p className="cd-p6-cue">
        Điền vào chỗ trống <b>[{questionNumber ?? '___'}]</b> trong đoạn văn
      </p>
    );
  }
  if (!question) return null;
  if (part !== 5) return <h3 className={small ? 'cd-q is-sm' : 'cd-q'}>{question}</h3>;

  const clues = showClues && signal
    ? quotedParts(signal).filter(p => p.quoted && p.text.trim().length >= 3).map(p => p.text.trim())
    : [];
  const blankSplit = question.split(/([_＿—–-]{3,})/);
  const renderPiece = (piece: string, keyPrefix: string) => {
    if (!clues.length) return <Fragment key={keyPrefix}>{piece}</Fragment>;
    for (const clue of clues) {
      const idx = piece.toLowerCase().indexOf(clue.toLowerCase());
      if (idx >= 0) {
        return (
          <Fragment key={keyPrefix}>
            {piece.slice(0, idx)}
            <mark className="cd-qclue">{piece.slice(idx, idx + clue.length)}</mark>
            {piece.slice(idx + clue.length)}
          </Fragment>
        );
      }
    }
    return <Fragment key={keyPrefix}>{piece}</Fragment>;
  };

  return (
    <h3 className={small ? 'cd-q is-sm' : 'cd-q'}>
      {blankSplit.map((partStr, i) => /^[_＿—–-]{3,}$/.test(partStr)
        ? <span key={i} className="cd-qblank" aria-label="chỗ trống">&nbsp;</span>
        : renderPiece(partStr, `q-${i}`))}
    </h3>
  );
}

/** Pieces of the card detail (design/previews/card-v2) shared by the desktop columns and the phone tabs. */

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className={open ? 'is-open' : undefined}>
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface OptionRowsProps {
  rows: OptionRow[];
  reasonOnly?: boolean;
  showPos?: boolean;
  blind?: boolean;
  selfPick?: string | null;
  onSelfPick?: (letter: string) => void;
}

/**
 * A–D rows. The chosen and correct options show their one-line reason; the others keep it behind an explicit
 * "Vì sao" button. In `blind` mode before picking, all styling, tags and reasons are hidden until the learner picks A–D.
 */
export function OptionRows({ rows, reasonOnly = false, showPos = false, blind = false, selfPick = null, onSelfPick }: OptionRowsProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const id = useId();
  const testing = blind && !selfPick;
  const line = (row: OptionRow) => reasonOnly && row.reason
    ? <>{row.reason}</>
    : <>{row.meaning && <b>{row.meaning}</b>}{row.meaning && row.reason ? ' — ' : ''}{row.reason}</>;
  return (
    <ol className="cd-opts">
      {rows.map(row => {
        const effectiveRole: OptionRow['role'] = testing
          ? ''
          : blind && selfPick
            ? (row.role === 'ans' ? 'ans' : row.letter === selfPick ? 'pick' : '')
            : row.role;
        const has = Boolean(row.meaning || row.reason);
        const toggle = !testing && effectiveRole === '' && has;
        const shown = !testing && has && (effectiveRole !== '' || open.has(row.letter));
        const whyId = `${id}-${row.letter}`;
        const tagText = blind && selfPick
          ? (row.letter === selfPick && row.role === 'ans' ? 'chính xác' : effectiveRole === 'ans' ? 'đáp án' : effectiveRole === 'pick' ? 'bạn chọn' : '')
          : effectiveRole === 'pick' ? 'bạn chọn' : effectiveRole === 'ans' ? 'đáp án' : '';

        if (testing) {
          return (
            <li key={row.letter || row.text} className="cd-opt is-blind">
              <button type="button" className="cd-opt-btn" onClick={() => onSelfPick?.(row.letter)}>
                <span className="cd-lt" aria-hidden="true">{row.letter}</span>
                <span className="cd-tx"><span className="sr-only">{row.letter}. </span>{row.text}</span>
              </button>
            </li>
          );
        }

        return (
          <li key={row.letter || row.text} className={'cd-opt' + (effectiveRole ? ` is-${effectiveRole}` : '')}>
            <div className="cd-ot">
              <span className="cd-lt" aria-hidden="true">{row.letter}</span>
              <span className="cd-tx"><span className="sr-only">{row.letter}. </span>{row.text}{showPos && row.pos ? <em className="cd-pos">{row.pos}</em> : null}</span>
              {tagText && <small className="cd-tag">{tagText}</small>}
              {toggle && (
                <button type="button" className="cd-ask" aria-expanded={open.has(row.letter)} aria-controls={whyId}
                  aria-label={`Vì sao ${row.letter}`}
                  onClick={() => setOpen(current => { const next = new Set(current); if (next.has(row.letter)) next.delete(row.letter); else next.add(row.letter); return next; })}>
                  Vì sao <Chevron open={open.has(row.letter)} />
                </button>
              )}
            </div>
            {shown && <p className="cd-why" id={whyId}>{line(row)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function TipBlock({ tip, size = 54, icon = 'soc' }: { tip: string; size?: number; icon?: 'soc' | 'bulb' }) {
  return (
    <div className="cd-tip">
      {icon === 'bulb'
        ? <span className="cd-tip-bulb" aria-hidden="true"><Lightbulb size={22} /></span>
        : <Soc state="idle" size={size} />}
      <p><b>Mẹo nhanh:</b> <span>{tip}</span></p>
    </div>
  );
}

export function SignalBlock({ text }: { text: string }) {
  return (
    <div className="cd-sign">
      <small>Dấu hiệu</small>
      <p>{quotedParts(text).map((part, index) => part.quoted ? <b key={index}>{part.text}</b> : <Fragment key={index}>{part.text}</Fragment>)}</p>
    </div>
  );
}

/** "Từ cần nhớ" rows; "+ Ôn" keeps the word on the card and turns into "Đã lưu" (tap again to unsave). */
export function WordRows({ words, isSaved, onSave, onToggle, all = false }: { words: KeyWord[]; isSaved: (word: string) => boolean; onSave: (words: string[]) => void; onToggle?: (word: string) => void; all?: boolean }) {
  const unsaved = words.filter(item => !isSaved(item.word));
  return (
    <div className="cd-wd">
      <ul className="cd-words" aria-label="Từ cần nhớ">
        {words.map(item => {
          const saved = isSaved(item.word);
          const canUntoggle = Boolean(onToggle);
          return (
            <li key={item.word}>
              <span className="cd-wm"><b lang="en">{item.word}</b><em>{item.meaning}</em></span>
              <button type="button" className={saved ? 'is-saved' : undefined} disabled={saved && !canUntoggle}
                aria-pressed={saved}
                aria-label={saved ? `Đã lưu ${item.word}` : `Ôn từ ${item.word}`}
                title={saved && canUntoggle ? 'Bấm để bỏ lưu' : undefined}
                onClick={() => (onToggle ? onToggle(item.word) : onSave([item.word]))}>{saved ? 'Đã lưu' : '+ Ôn'}</button>
            </li>
          );
        })}
      </ul>
      {all && unsaved.length > 1 && <button type="button" className="cd-allw" onClick={() => onSave(unsaved.map(item => item.word))}>+ Ôn cả {unsaved.length} từ</button>}
    </div>
  );
}

/**
 * The passage with every evidence sentence highlighted where it is (any passage of a double/triple set) and its
 * Vietnamese translation right under it. The scroll box starts at the first evidence; with two or more,
 * "Bằng chứng 1/2 ›" steps through them.
 */
export function useEvidenceJump(count: number, key: string) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = useCallback((index: number, onlyIfHidden = false) => {
    const container = box.current;
    const mark = container?.querySelector<HTMLElement>(`[data-ev="${index}"]`);
    setAt(index);
    if (!container || !mark) return;
    const outer = container.getBoundingClientRect(), inner = mark.getBoundingClientRect();
    // Opening the card keeps the passage at its start (labels in view) when the first evidence is already on screen.
    if (onlyIfHidden && inner.top >= outer.top && inner.bottom <= outer.bottom - 40) return;
    container.scrollTop = Math.max(0, inner.top - outer.top + container.scrollTop - 56);
  }, []);
  useLayoutEffect(() => { if (count > 0) go(0, true); }, [count, key, go]);
  return { box, at, next: () => go(count ? (at + 1) % count : 0) };
}

export function EvidenceJumper({ at, count, onNext }: { at: number; count: number; onNext: () => void }) {
  if (count < 2) return null;
  return <button type="button" className="cd-jump" onClick={onNext} aria-label={`Bằng chứng ${at + 1} trên ${count}, sang bằng chứng tiếp theo`}>
    Bằng chứng {at + 1}/{count} <span aria-hidden="true">›</span>
  </button>;
}

const BLANK_TOKEN = /([_＿]{2,}\s*\(?\b\d{1,3}\b\)?\.?|\(?\b\d{1,3}\b\)?\s*[_＿]{2,}|\[(\d{1,3})\])/g;

function renderInlineText(text: string, formatBlanks: boolean) {
  if (!formatBlanks) return <>{text}</>;
  const out: Array<string | { num: string }> = [];
  let cursor = 0;
  for (let m = BLANK_TOKEN.exec(text); m; m = BLANK_TOKEN.exec(text)) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    const numMatch = m[0].match(/\d{1,3}/);
    out.push({ num: numMatch ? numMatch[0] : '___' });
    cursor = m.index + m[0].length;
  }
  BLANK_TOKEN.lastIndex = 0;
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out.map((chunk, i) => typeof chunk === 'string'
    ? <Fragment key={i}>{chunk}</Fragment>
    : <span key={i} className="cd-blank">[{chunk.num}]</span>)}</>;
}

export function EvidencePassage({ context, evidences, at, marked, hideHighlights = false, part }: { context: string; evidences: readonly EvidenceNote[]; at: number; marked?: { blocks: MarkedBlock[]; count: number }; hideHighlights?: boolean; part?: number }) {
  const computed = useMemo(
    () => (hideHighlights ? markPassage(context, []) : marked ?? markPassage(context, evidences)),
    [hideHighlights, marked, context, evidences]
  );
  const { blocks, count } = computed;
  const formatBlanks = part === 6;
  return (
    <div className={'psg cd-psg' + (count > 1 ? ' has-multi' : '')} lang="en">
      {blocks.map((block, index) => block.kind === 'label'
        ? <p key={index} className="psg-label" lang="vi">{block.text}</p>
        : block.kind === 'table'
          ? <div key={index} className="psg-tw"><table className="psg-table">
              <thead>
                <tr className={block.headerOrder !== undefined ? 'cd-ev-row' + (block.headerOrder === at ? ' is-at' : '') : undefined} data-ev={block.headerOrder}>
                  {block.header.map((cell, column) => <th key={column} scope="col">{cell}</th>)}
                </tr>
                {block.headerTranslation ? <tr className="cd-ev-tr"><td colSpan={block.header.length} lang="vi">{block.headerTranslation}</td></tr> : null}
              </thead>
              <tbody>{block.rows.map((row, line) => (
                <Fragment key={line}>
                  <tr className={row.order !== undefined ? 'cd-ev-row' + (row.order === at ? ' is-at' : '') : undefined} data-ev={row.order}>
                    {block.header.map((_, column) => <td key={column}>{row.cells[column] ?? ''}</td>)}
                  </tr>
                  {row.translation ? <tr className="cd-ev-tr"><td colSpan={block.header.length} lang="vi">{row.translation}</td></tr> : null}
                </Fragment>
              ))}</tbody>
            </table></div>
          : <p key={index} className="psg-text">{block.segments.map((segment, segIdx) => segment.kind === 'text'
              ? <Fragment key={segIdx}>{renderInlineText(segment.text, formatBlanks)}</Fragment>
              : <Fragment key={segIdx}>
                  <mark className={'cd-ev' + (segment.order === at ? ' is-at' : '')} data-ev={segment.order}>{renderInlineText(segment.text, formatBlanks)}</mark>
                  {segment.translation && <span className="cd-ev-vi" lang="vi">{segment.translation}</span>}
                </Fragment>)}
            </p>)}
    </div>
  );
}
