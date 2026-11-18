import { partOfQuestion } from '@/shared/domain/questionNumbers';
import type { CaptureImage, CapturePart, CaptureZone } from '@/features/mistakes/services/captureSession';
import { PART_NAMES, suggestGroups } from '@/features/mistakes/lib/wrongDetail';
import { DropZone, pasteHint } from './views';
import './wrong-detail.css';
import './capture-part.css';

interface Props {
  phone?: boolean;
  part: CapturePart | null;
  group: number | null;
  images: readonly CaptureImage[];
  /** The chosen test's logged wrong questions (Reading), or null when it has no wrong list. */
  logged: number[] | null;
  disabled?: boolean;
  onPart: (part: CapturePart | null) => void;
  onGroup: (group: number | null) => void;
  onAdd: (files: File[], zone: CaptureZone) => void;
  onRemove: (id: string) => void;
}

/**
 * The capture of one Part, as in Gỡ câu sai: "Chụp câu Part mấy?" first; Part 5 is one zone, Part 6–7 take
 * ① Đoạn văn + ② Câu hỏi read together. A test with a wrong list suggests its passage groups.
 */
export function CapturePartInput({ phone = false, part, group, images, logged, disabled = false, onPart, onGroup, onAdd, onRemove }: Props) {
  const wrongIn = (value: number) => (logged ?? []).filter(number => partOfQuestion(number) === value);
  if (!part) {
    return (
      <div className={'wd-vars' + (phone ? ' cpi-phone' : '')}>
        <p className="cpi-q">Chụp câu Part mấy?</p>
        <div className="cpi-parts">
          {([5, 6, 7] as const).map(value => (
            <button key={value} type="button" className="cpi-part" onClick={() => onPart(value)} aria-label={`Part ${value} · ${PART_NAMES[value]}`}>
              <b>Part {value}</b><span>{PART_NAMES[value]}</span>
              {logged && wrongIn(value).length > 0 && <em>{wrongIn(value).length} câu sai</em>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const groups = part >= 6 && logged ? suggestGroups(part as 6 | 7, wrongIn(part)) : [];
  const zoneProps = { phone, disabled, camera: phone, onAdd, onRemove: (_zone: CaptureZone, id: string) => onRemove(id), onActivate: () => {} };
  const zoneImages = (zone: CaptureZone) => images.filter(image => image.zone === zone);
  return (
    <div className={'wd-vars' + (phone ? ' cpi-phone' : '')}>
      <div className="cpi-head">Part {part} · {PART_NAMES[part]}{logged && <small>{wrongIn(part).length} câu sai</small>}
        <button type="button" onClick={() => onPart(null)} disabled={disabled}>Đổi Part</button></div>
      {groups.length > 0 && (
        <div className="cpi-groups" role="group" aria-label="Nhóm bài đọc">
          {groups.map(item => (
            <button key={item.from} type="button" aria-pressed={group === item.from} disabled={disabled} onClick={() => onGroup(group === item.from ? null : item.from)}>
              Nhóm {item.from}–{item.to}<small>sai {item.wrong.join(', ')}</small>
            </button>
          ))}
        </div>
      )}
      {part === 5
        ? <DropZone {...zoneProps} zone="questions" big title="Ảnh câu Part 5" note="mỗi ảnh một hay nhiều câu" items={zoneImages('questions')}
            hint={<>{pasteHint(phone)} Sóc đọc các ảnh cùng lúc, chỉ lấy câu bạn sai.</>} />
        : <div className={'wd-zones' + (phone ? ' is-stacked' : '')}>
            <DropZone {...zoneProps} zone="passage" num={1} title="Đoạn văn" note="tối đa 3 ảnh" items={zoneImages('passage')} />
            <DropZone {...zoneProps} zone="questions" num={2} title="Câu hỏi" items={zoneImages('questions')} hint={phone ? undefined : pasteHint(false)} />
          </div>}
      <p className="cpi-note">{part >= 6 ? 'Đoạn văn và câu hỏi được đọc cùng một lượt.' : 'Ảnh gửi nguyên bản; chỉ thu nhỏ khi quá nặng.'}</p>
    </div>
  );
}
