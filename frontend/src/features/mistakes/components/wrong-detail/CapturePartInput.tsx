import { useImperativeHandle, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import type { CaptureImage, CapturePart, CaptureZone } from '@/features/mistakes/services/captureSession';
import type { ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { isGroupedPart, PART_NAMES, suggestGroups, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { BurstCameraModal } from './BurstCameraModal';
import { CaptureZone as CalmZone, PhotoPreview } from './CaptureZone';
import { PaperToggle } from './CaptureShotView';
import './wrong-detail.css';
import './capture-part.css';
import './capture-calm.css';

/** What the parent can ask the input to do: open the camera (phone) or the file picker (computer) for a zone. */
export interface CapturePartControls { open: (zone?: CaptureZone) => void }

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
  extraTools?: (pick: () => void) => ReactNode;
  controlsRef?: MutableRefObject<CapturePartControls | null>;
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
  phone = false, controlsRef, part, group, customPart7Ranges, images, activeZone = 'passage', onActiveZone, onSwitchZone, logged, disabled = false, photoMode = false, clarity, extraTools,
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
  const pick = useRef<HTMLInputElement>(null);
  const pickZone = useRef<CaptureZone>('questions');
  const [burst, setBurst] = useState<CaptureZone | null>(null);
  const [preview, setPreview] = useState<{ zone: CaptureZone; index: number } | null>(null);
  const twoZones = part === 7;
  const openFor = (zone?: CaptureZone) => {
    const target = zone ?? (twoZones ? activeZone : 'questions');
    if (phone) setBurst(target);
    else { pickZone.current = target; pick.current?.click(); }
  };
  useImperativeHandle(controlsRef, () => ({ open: openFor }));
  const zoneProps = {
    phone,
    disabled,
    clarity,
    onAdd,
    onEdit: onEditImage ? (_zone: CaptureZone, id: string) => onEditImage(id) : undefined,
    onMove: onMoveImage ? (_zone: CaptureZone, id: string, delta: -1 | 1) => onMoveImage(id, delta) : undefined,
    onRemove: (_zone: CaptureZone, id: string) => onRemove(id),
    onActivate: (zone: CaptureZone) => onActiveZone?.(zone)
  };
  const zoneImages = (zone: CaptureZone) => images.filter(image => image.zone === zone);
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
      {onPhotoMode && <div className="cpi-paper"><PaperToggle on={photoMode} onChange={onPhotoMode} /></div>}
      {part === 7 && phone ? <>
        <div className="cv-seg" role="tablist" aria-label="Ô ảnh">
          <button type="button" role="tab" aria-selected={activeZone === 'passage'} className={activeZone === 'passage' ? 'is-on' : ''} onClick={() => onActiveZone?.('passage')}>Đoạn văn · {zoneImages('passage').length}</button>
          <button type="button" role="tab" aria-selected={activeZone === 'questions'} className={activeZone === 'questions' ? 'is-on' : ''} onClick={() => onActiveZone?.('questions')}>Câu hỏi · {zoneImages('questions').length}</button>
        </div>
        <CalmZone {...zoneProps} zone={activeZone} title={activeZone === 'passage' ? 'Đoạn văn' : 'Câu hỏi'} active items={zoneImages(activeZone)}
          onPreview={(zone, index) => setPreview({ zone, index })} onSwitchZone={switchZone} onEmptyTap={() => openFor(activeZone)}
          emptyText={activeZone === 'passage' ? 'Chụp đoạn văn, không bắt buộc' : 'Chụp phần câu hỏi của nhóm'} />
      </> : part === 7 ? (
        <div className="cv-zones">
          <CalmZone {...zoneProps} zone="passage" num={1} title="Đoạn văn" items={zoneImages('passage')} active={activeZone === 'passage'} onSwitchZone={switchZone}
            emptyText={activeZone === 'passage' ? 'Thả ảnh vào đây' : 'Chưa có ảnh'} />
          <CalmZone {...zoneProps} zone="questions" num={2} title="Câu hỏi" items={zoneImages('questions')} active={activeZone === 'questions'} onSwitchZone={switchZone}
            emptyText={activeZone === 'questions' ? 'Thả ảnh vào đây' : 'Chưa có ảnh'} />
        </div>
      ) : (
        <CalmZone {...zoneProps} zone="questions" title="Ảnh đã chụp" active items={images}
          onPreview={(zone, index) => setPreview({ zone, index })} onEmptyTap={() => openFor('questions')}
          emptyText={phone ? 'Chụp cả trang có câu sai, nhiều trang cũng được' : 'Thả ảnh vào đây'} />
      )}
      {!phone && extraTools?.(() => openFor())}
      <input ref={pick} type="file" accept="image/*" multiple hidden aria-label="Chọn ảnh chụp tiếp"
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAdd(files, pickZone.current); }} />
      {burst && <BurstCameraModal maxPhotos={Math.max(1, MAX_CAPTURE_IMAGES - images.length)} title={part !== 7 ? `Ảnh câu Part ${part}` : burst === 'passage' ? 'Đoạn văn' : 'Câu hỏi'}
        onClose={() => setBurst(null)} onComplete={files => { const zone = burst; setBurst(null); (onCameraAdd ?? onAdd)(files, zone); }} />}
      {preview && zoneImages(preview.zone).length > 0 && (
        <PhotoPreview zone={preview.zone} items={zoneImages(preview.zone)} start={preview.index} twoZones={twoZones}
          onClose={() => setPreview(null)} onRemove={id => onRemove(id)} onSwitch={id => onSwitchZone?.(id)} onEdit={id => onEditImage?.(id)} />
      )}
    </div>
  );
}
