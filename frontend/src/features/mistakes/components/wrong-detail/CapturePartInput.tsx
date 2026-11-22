import { useState, type ReactNode } from 'react';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import type { CaptureImage, CapturePart, CaptureZone } from '@/features/mistakes/services/captureSession';
import type { ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { isGroupedPart, PART_NAMES, suggestGroups, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import { CONTEXT_PER_REQUEST } from '@/features/mistakes/lib/captureBatch';
import { DropZone, groupHint, ONE_SHOT_HINT, pasteHint, zoneSwitchHint } from './views';
import './wrong-detail.css';
import './capture-part.css';

interface Props {
  phone?: boolean;
  part: CapturePart;
  group: number | null;
  customPart7Ranges?: CustomRangeMap;
  images: readonly CaptureImage[];
  /** Grouped Parts: the zone imports go to (① passage, ② questions). */
  activeZone?: CaptureZone;
  onActiveZone?: (zone: CaptureZone) => void;
  /** "Chuyển sang ②/①" on a thumbnail. */
  onSwitchZone?: (id: string) => void;
  /** The chosen test's logged wrong questions (Parts 1–7), or null when it has no wrong list. */
  logged: number[] | null;
  disabled?: boolean;
  photoMode?: boolean;
  clarity?: Record<string, ClarityResult | null>;
  /** Optional quick tools (e.g. Desktop clipboard/folder screenshot bar) shown right beneath the dropzone. */
  extraTools?: ReactNode;
  onPart: (part: CapturePart) => void;
  onGroup: (group: number | null) => void;
  onEditPart7Range?: (oldFrom: number, from: number, to: number) => string | null;
  onPhotoMode?: (value: boolean) => void;
  onAdd: (files: File[], zone: CaptureZone) => void;
  onCameraAdd?: (files: File[], zone: CaptureZone) => void;
  onEditImage?: (id: string) => void;
  onMoveImage?: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
}

/**
 * Explicit Part capture input: starts directly on a clear Part (default Part 5 or the test's first Part with
 * wrong questions) with a labeled 1-tap switcher (`Đọc: P5 P6 P7 | Nghe: P1 P2 P3 P4`) that preserves staged photos.
 */
export function CapturePartInput({
  phone = false, part, group, customPart7Ranges, images, activeZone = 'passage', onActiveZone, onSwitchZone, logged, disabled = false, photoMode = false, clarity, extraTools,
  onPart, onGroup, onEditPart7Range, onPhotoMode, onAdd, onCameraAdd, onEditImage, onMoveImage, onRemove
}: Props) {
  const [editingRange, setEditingRange] = useState(false);
  const [fromVal, setFromVal] = useState('');
  const [toVal, setToVal] = useState('');
  const [rangeErr, setRangeErr] = useState('');
  const wrongIn = (value: number) => (logged ?? []).filter(number => partOfQuestion(number) === value);
  const grouped = isGroupedPart(part);
  const groups = grouped && logged ? suggestGroups(part, wrongIn(part), part === 7 ? customPart7Ranges : undefined) : [];
  const selectedGroup = groups.find(item => item.from === group) ?? null;
  const zoneProps = {
    phone,
    disabled,
    camera: phone,
    clarity,
    onAdd,
    onCameraAdd,
    onEdit: onEditImage ? (_zone: CaptureZone, id: string) => onEditImage(id) : undefined,
    onMove: onMoveImage ? (_zone: CaptureZone, id: string, delta: -1 | 1) => onMoveImage(id, delta) : undefined,
    onRemove: (_zone: CaptureZone, id: string) => onRemove(id),
    onActivate: (zone: CaptureZone) => onActiveZone?.(zone)
  };
  const openRangeEditor = () => {
    const target = selectedGroup ?? groups[0];
    setFromVal(String(target?.from ?? 147));
    setToVal(String(target?.to ?? 150));
    setRangeErr('');
    setEditingRange(true);
  };
  const applyRange = () => {
    if (!onEditPart7Range) return;
    const oldFrom = selectedGroup?.from ?? groups[0]?.from ?? 147;
    const err = onEditPart7Range(oldFrom, Number(fromVal), Number(toVal));
    if (err) { setRangeErr(err); return; }
    setEditingRange(false);
    setRangeErr('');
  };
  const trayNote = part === 2 ? 'hỗ trợ 3 phương án A–C' : 'mỗi ảnh một hay nhiều câu';
  const switchZone = onSwitchZone ? (_zone: CaptureZone, id: string) => onSwitchZone(id) : undefined;
  return (
    <div className={'wd-vars' + (phone ? ' cpi-phone' : '')}>
      <div className="cpi-head">
        <span>Part {part} · {PART_NAMES[part]}</span>
        {logged && wrongIn(part).length > 0 && <small>{wrongIn(part).length} câu sai</small>}
      </div>
      <div className="cpi-switch" role="group" aria-label="Chọn Part">
        <span className="cpi-sw-lbl">Đọc</span>
        {([5, 6, 7] as const).map(value => {
          const cnt = logged ? wrongIn(value).length : 0;
          return (
            <button key={value} type="button" className="cpi-sw-btn is-read" aria-pressed={part === value} disabled={disabled}
              aria-label={`Part ${value} · ${PART_NAMES[value]}`}
              onClick={() => { setEditingRange(false); onPart(value); }}>
              P{value}{cnt > 0 && <em>{cnt}</em>}
            </button>
          );
        })}
        <i className="cpi-sw-sep" aria-hidden="true" />
        <span className="cpi-sw-lbl is-listen">Nghe</span>
        {([1, 2, 3, 4] as const).map(value => {
          const cnt = logged ? wrongIn(value).length : 0;
          return (
            <button key={value} type="button" className="cpi-sw-btn is-listen" aria-pressed={part === value} disabled={disabled}
              aria-label={`Part ${value} · ${PART_NAMES[value]}`}
              onClick={() => { setEditingRange(false); onPart(value); }}>
              P{value}{cnt > 0 && <em>{cnt}</em>}
            </button>
          );
        })}
      </div>
      {groups.length > 0 && (
        <div className="cpi-groups" role="group" aria-label="Nhóm bài đọc">
          {groups.map(item => (
            <button key={item.from} type="button" aria-pressed={group === item.from} disabled={disabled}
              onClick={() => { setEditingRange(false); onGroup(group === item.from ? null : item.from); }}>
              Nhóm {item.from}–{item.to}<small>sai {item.wrong.join(', ')}</small>
            </button>
          ))}
          {part === 7 && onEditPart7Range && !editingRange && (
            <button type="button" className="wd-gr-edit" disabled={disabled} onClick={openRangeEditor}>✎ Đổi dải câu</button>
          )}
        </div>
      )}
      {part === 7 && editingRange && (
        <div className="wd-range-bar" role="group" aria-label="Đổi dải câu Part 7" style={{ marginBottom: 10 }}>
          <span>Từ</span>
          <input type="number" min={147} max={200} value={fromVal} aria-label="Từ câu" onChange={e => { setFromVal(e.target.value); setRangeErr(''); }} />
          <span>đến</span>
          <input type="number" min={147} max={200} value={toVal} aria-label="Đến câu" onChange={e => { setToVal(e.target.value); setRangeErr(''); }} />
          <button type="button" className="wd-chip-btn" onClick={applyRange}>Áp dụng</button>
          <button type="button" className="wd-lnk is-muted" onClick={() => setEditingRange(false)}>Huỷ</button>
          {rangeErr && <span className="wd-err" style={{ marginTop: 0, width: '100%' }} role="alert">{rangeErr}</span>}
        </div>
      )}
      {part === 7 ? <>
        <div className={'wd-zones' + (phone ? ' is-stacked' : '')}>
          <DropZone {...zoneProps} zone="passage" num={1} title="Đoạn văn" note={`tối đa ${CONTEXT_PER_REQUEST} ảnh`}
            items={images.filter(image => image.zone === 'passage')} active={activeZone === 'passage'} onSwitchZone={switchZone} />
          <DropZone {...zoneProps} zone="questions" num={2} title="Câu hỏi"
            items={images.filter(image => image.zone === 'questions')} active={activeZone === 'questions'} onSwitchZone={switchZone} />
        </div>
        <p className="wd-zp">{groupHint(part, selectedGroup?.passages ?? 1)} {ONE_SHOT_HINT} {pasteHint(phone)} {zoneSwitchHint(phone)}</p>
      </> : (
        <DropZone
          {...zoneProps}
          zone="questions"
          big
          title={part === 6 ? 'Ảnh đoạn văn & câu hỏi' : grouped ? 'Ảnh transcript & câu hỏi' : `Ảnh câu Part ${part}`}
          note={grouped ? 'tối đa 10 ảnh theo thứ tự' : trayNote}
          items={images}
          hint={<>{pasteHint(phone)} {grouped ? groupHint(part, 1) : 'Sóc đọc song song nhiều ảnh cùng lúc, đổi Part bên trên bất cứ lúc nào không mất ảnh.'}</>}
        />
      )}
      {extraTools}
      {onPhotoMode && (
        <div className="cpi-bar">
          <button type="button" className="wd-paper-pill" aria-pressed={photoMode} disabled={disabled} onClick={() => onPhotoMode(!photoMode)}>
            <span className="wd-sw" aria-hidden="true"><i /></span>
            <span>Ảnh chụp giấy</span>
          </button>
          <span className="cpi-note" style={{ marginTop: 0 }}>
            {photoMode
              ? 'Đang dùng chế độ đọc ảnh giấy chuyên sâu (bóng gáy, chữ 2 cột, bút khoanh tay).'
              : grouped ? 'Tự bật khi ảnh tối/mờ; bấm bật tay nếu chụp sách rõ sáng.' : 'Ảnh gửi nguyên bản; tự bật chế độ giấy khi ảnh tối/mờ.'}
          </span>
        </div>
      )}
    </div>
  );
}
