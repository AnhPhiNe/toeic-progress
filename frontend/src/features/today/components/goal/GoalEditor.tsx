import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { StudySession } from '@/shared/types';
import { PhoneSheet } from '@/app/components/phone';
import { Soc } from '@/shared/ui/soc/Soc';
import { GOAL_PRESETS, examDateLabel, examState, goalPreview, isReachedGoal, previewHeadline, stepGoal } from '../../lib/goalEdit';
import { MAX_TARGET, MIN_TARGET } from '../../lib/goalSetup';
import './goalEditor.css';

export interface GoalEditorProps {
  sessions: StudySession[];
  /** The saved goal (the preview counts stairs added or removed against it). */
  current: number;
  /** Value the stepper starts on. */
  initial: number;
  best: number | null;
  examDate: string;
  today: string;
  onSave: (target: number, examDate: string) => void;
  onClose: () => void;
}

/** A small pencil (Lucide "pencil" path) for the ✎ dot on the trophy. */
export function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

/** Goal editor shared by phone (bottom sheet) and desktop (popover): −/+ by 25, presets, stairs preview, exam date. */
function GoalEditorBody({ sessions, current, initial, best, examDate, today, onSave, onClose }: GoalEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [date, setDate] = useState(examDate);
  const preview = useMemo(() => goalPreview(sessions, current, draft), [sessions, current, draft]);
  const reached = isReachedGoal(draft, best);
  const head = previewHeadline(preview, draft);
  const exam = examState(date, today);
  const dateIn = useRef<HTMLInputElement>(null);
  const pickDate = () => {
    const el = dateIn.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };
  const n = preview.bars.length;

  return (
    <div className="ge">
      <div className="ge-h">
        <b>Mục tiêu của bạn</b>
        <button type="button" className="ge-x" aria-label="Đóng" onClick={onClose}>✕</button>
      </div>

      <span className="ge-lbl" id="ge-target">Điểm mục tiêu</span>
      <div className="ge-step" role="group" aria-labelledby="ge-target">
        <button type="button" aria-label="Bớt 25 điểm" disabled={draft <= MIN_TARGET} onClick={() => setDraft(v => stepGoal(v, -1))}>−</button>
        <strong aria-live="polite">{draft}</strong>
        <button type="button" aria-label="Thêm 25 điểm" disabled={draft >= MAX_TARGET} onClick={() => setDraft(v => stepGoal(v, 1))}>+</button>
      </div>
      <div className="ge-presets" role="group" aria-label="Mốc nhanh">
        {GOAL_PRESETS.map(v => (
          <button key={v} type="button" aria-pressed={draft === v} onClick={() => setDraft(v)}
            className={draft === v ? 'is-on' : isReachedGoal(v, best) ? 'is-past' : undefined}>{v}</button>
        ))}
      </div>

      {reached && best !== null
        ? <div className="ge-note" role="status">
            <Soc state="think" size={44} className="ge-note-soc" />
            <p>Bạn đã chạm <b>{best}</b> rồi, {best > draft ? 'cao hơn' : 'đúng'} mốc này. Lưu thì cúp {draft} hiện là <b>đã đạt</b>. Muốn có bậc mới để leo thì chọn trên {best}.</p>
          </div>
        : <div className="ge-prev" role="status">
            <span className="ge-mini" aria-hidden="true">
              {preview.bars.map((k, i) => <i key={i} className={'is-' + k} style={{ height: 10 + (n > 1 ? (i * 28) / (n - 1) : 0) }} />)}
            </span>
            <p><b>{head.lead}</b> · {head.rest}.<br />Tự chia: Nghe {preview.split.listening} · Đọc {preview.split.reading}</p>
          </div>}

      <span className="ge-lbl">Ngày thi</span>
      <div className="ge-date">
        <i aria-hidden="true">📅</i>
        <div className="ge-date-t">
          <b>{date ? examDateLabel(date) : 'Chưa đặt ngày thi'}</b>
          <small className={exam.kind === 'past' ? 'is-past' : undefined}>
            {exam.kind === 'soon' ? (exam.days === 0 ? 'thi hôm nay' : `còn ${exam.days} ngày`) : exam.kind === 'past' ? `đã qua ${exam.daysAgo} ngày` : 'không bắt buộc'}
          </small>
        </div>
        <span className="ge-ch">
          <button type="button" onClick={pickDate}>{date ? 'Đổi ngày' : 'Đặt ngày'}</button>
          <input ref={dateIn} type="date" aria-label="Ngày thi" value={date} min={today} onChange={e => setDate(e.target.value)} tabIndex={-1} />
        </span>
        {date && <button type="button" className="ge-clr" aria-label="Bỏ ngày thi" onClick={() => setDate('')}>✕</button>}
      </div>

      <button type="button" className={'ge-cta' + (reached ? ' is-gold' : '')} onClick={() => onSave(draft, date)}>
        {reached ? `Vẫn lưu ${draft}` : `Lưu · cúp ${draft}`}
      </button>
    </div>
  );
}

/** Phone: the editor in a bottom sheet over the scene. */
export function GoalSheet(props: GoalEditorProps) {
  return (
    <PhoneSheet title="Mục tiêu của bạn" onClose={props.onClose} hideTitle>
      <GoalEditorBody {...props} />
    </PhoneSheet>
  );
}

const POP_W = 360;
const GAP = 16;

/** Desktop: the editor in a popover beside whatever opened it (trophy or exam chip); click outside or Esc closes. */
export function GoalPopover({ anchor, ...props }: GoalEditorProps & { anchor: HTMLElement | SVGElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; side: 'left' | 'right' } | null>(null);
  const { onClose } = props;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = anchor?.getBoundingClientRect() ?? new DOMRect(vw / 2, vh / 2, 0, 0);
    const roomLeft = r.left - GAP - POP_W >= 12;
    const left = roomLeft ? r.left - GAP - POP_W : Math.min(vw - POP_W - 12, r.right + GAP);
    const cy = r.top + r.height / 2;
    const top = Math.max(12, Math.min(vh - h - 12, cy - 90));
    setPos({ left, top, arrow: Math.max(24, Math.min(h - 24, cy - top)), side: roomLeft ? 'left' : 'right' });
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} role="dialog" aria-label="Mục tiêu của bạn" tabIndex={-1}
      className={'rd ge-pop is-' + (pos?.side ?? 'left')}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: POP_W, '--arrow': `${pos?.arrow ?? 60}px` } as CSSProperties}>
      <GoalEditorBody {...props} />
    </div>,
    document.body
  );
}
