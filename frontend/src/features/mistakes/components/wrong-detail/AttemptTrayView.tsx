import { useRef, useState } from 'react';
import { ArrowRight, Camera, Check, ChevronDown, Headphones, Images, Layers, PenLine, RotateCcw, X } from 'lucide-react';
import type { StudySession } from '@/shared/types';
import { partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import type { ShotItem } from '@/features/mistakes/lib/captureShots';
import { ScreenshotSuggestBar } from './ScreenshotSuggestBar';
import { CaptureZone, PhotoPreview } from './CaptureZone';
import { BurstCameraModal } from './BurstCameraModal';
import { PaperToggle } from './CaptureShotView';
import type { SentThumb, Staged, Zone } from './views';
import './capture-part.css';

export interface AttemptJobSummary {
  key: string;
  error: string;
  note: string;
  missing: number[];
}

export interface AttemptSentEntry {
  id: string;
  url: string;
  job: string;
  file?: File;
}

interface Props {
  phone: boolean;
  session: StudySession;
  readingNumbers: number[];
  outstanding: number[];
  remaining: number[];
  unread: number[];
  capturePart: number;
  targetNumber: string;
  items: ShotItem[];
  staged: Staged[];
  clarity: Record<string, ClarityResult | null>;
  photoMode: boolean;
  canRead: boolean;
  adding: boolean;
  anyReading: boolean;
  readyCount: number;
  reviewCount: number;
  savedTotal: number;
  listeningLeft: number;
  contextDoubts: { id: string; number: number; part: PartNumber }[];
  jobs: AttemptJobSummary[];
  sent: AttemptSentEntry[];
  note: string;
  error: string;
  onCapturePart: (part: number) => void;
  onTargetNumber: (value: string) => void;
  onPhotoMode: (value: boolean) => void;
  onAddFiles: (files: File[]) => void;
  onCameraAdd: (files: File[]) => void;
  onRemoveStaged: (zone: Zone, id: string) => void;
  onMoveStaged: (zone: Zone, id: string, delta: -1 | 1) => void;
  onEditPhoto: (zone: Zone, id: string) => void;
  onSubmit: () => void;
  onSaveReady: () => void;
  onReview: () => void;
  onManual: (part: PartNumber, number: number) => void;
  onListening: () => void;
  onSwitchToShots: () => void;
  onClose: () => void;
}

/**
 * Unified 1-tray capture surface for a just-logged test: lets the learner drop mixed Reading screenshots at once,
 * filter by Part if helpful, reuse/adjust photos, and seamlessly switch to Listening or grouped shots anytime.
 */
export function AttemptTrayView(props: Props) {
  const {
    phone, session, readingNumbers, outstanding, remaining, unread, capturePart, targetNumber, items,
    staged, clarity, photoMode, canRead, adding, anyReading, readyCount, reviewCount, savedTotal,
    listeningLeft, contextDoubts, jobs, sent, note, error,
    onCapturePart, onTargetNumber, onPhotoMode, onAddFiles, onCameraAdd, onRemoveStaged, onMoveStaged,
    onEditPhoto, onSubmit, onSaveReady, onReview, onManual, onListening, onSwitchToShots, onClose
  } = props;

  const picker = useRef<HTMLInputElement>(null);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [sourcePreview, setSourcePreview] = useState('');
  const [burstOpen, setBurstOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const presentParts = [5, 6, 7].filter(part => readingNumbers.some(number => partOfQuestion(number) === part));
  const unreadSet = new Set(unread);
  const badIndex = staged.findIndex(item => clarity[item.id]?.problem);
  const badItem = badIndex >= 0 ? staged[badIndex] : null;
  const badMsg = badItem ? clarityMessage(badIndex + 1, clarity[badItem.id]!.problem!) : null;
  const manualTarget = unread[0] ?? remaining[0];
  const sentThumbs: SentThumb[] = [];
  const hasSend = staged.length > 0;
  const countOf = (part: number) => part === 0
    ? outstanding.length
    : outstanding.filter(number => partOfQuestion(number) === part).length;

  return (
    <>
      <header className={'cv-head cv-attempt-head' + (phone ? ' is-phone' : '')}>
        {phone && (
          <button type="button" className="cv-hbtn" aria-label="Đóng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        )}
        <div className="attempt-head-title">
          <h2 id="wd-title">Chụp trang chữa bài</h2>
          <p className="attempt-sub">
            <strong>{session.testName}</strong>
            <span>{session.date} · {unread.length > 0 ? `Còn ${unread.length} câu Đọc` : readyCount > 0 ? `${readyCount} câu chờ lưu` : `Còn ${remaining.length} câu Đọc`}</span>
          </p>
        </div>
        <div className="attempt-head-acts">
          {listeningLeft > 0 && (
            <button type="button" className="attempt-pill is-listen" aria-label="Ghi lý do phần Nghe" onClick={onListening}>
              <Headphones size={15} aria-hidden="true" />
              <span>{phone ? `Nghe (${listeningLeft})` : `Phần Nghe · ${listeningLeft}`}</span>
            </button>
          )}
          <button type="button" className="attempt-pill" onClick={onSwitchToShots} title="Chuyển sang chế độ chia từng Tấm / Nhóm câu">
            <Layers size={15} aria-hidden="true" />
            <span>{phone ? 'Chia nhóm' : 'Chia theo nhóm'}</span>
          </button>
          {!phone && (
            <button type="button" className="wd-x" aria-label="Đóng" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className={'wd-body cv-attempt' + (phone ? ' is-phone' : '')}>
        <div className="attempt-bar">
          <div className="attempt-parts" role="group" aria-label="Chụp theo Part">
            <span className="cpi-sw-lbl">Đọc</span>
            {[0, ...presentParts].map(part => {
              const count = countOf(part);
              return (
                <button
                  key={part}
                  type="button"
                  className="cpi-sw-btn is-read"
                  aria-pressed={capturePart === part}
                  onClick={() => { onCapturePart(part); onTargetNumber(''); }}
                >
                  {part ? `P${part}` : 'Tất cả'}
                  {count > 0 && <em aria-hidden="true">{count}</em>}
                </button>
              );
            })}
          </div>
          {remaining.length > 0 && (
            <button
              type="button"
              className="attempt-q-toggle"
              aria-expanded={numbersOpen}
              onClick={() => setNumbersOpen(value => !value)}
            >
              <span>Xem {remaining.length} câu cần chữa</span>
              <ChevronDown size={15} className={numbersOpen ? 'is-rot' : ''} aria-hidden="true" />
            </button>
          )}
        </div>

        {numbersOpen && remaining.length > 0 && (
          <div className="attempt-numbers" role="region" aria-label="Danh sách câu cần chữa">
            {remaining.map(number => (
              <span key={number} className={unreadSet.has(number) ? '' : 'is-ready'} title={unreadSet.has(number) ? 'Chưa đọc ảnh' : 'Đã đọc, chờ lưu'}>
                {!unreadSet.has(number) && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                {number}
              </span>
            ))}
          </div>
        )}

        {canRead && remaining.length === 0 && readyCount === 0 && !anyReading && listeningLeft > 0 && (
          <div className="attempt-all-read" role="status">
            <Soc state="yay" size={44} />
            <div>
              <strong>Đã ghi hết câu Đọc của đề này!</strong>
              <p>Còn {listeningLeft} câu Phần Nghe — bấm để ghi nhanh lý do sai.</p>
            </div>
            <button type="button" className="rd-btn rd-btn--pink attempt-sec" onClick={onListening}>
              Ghi lý do phần Nghe
            </button>
          </div>
        )}

        <CaptureZone
          zone="questions"
          title="Ảnh đã chụp"
          active
          phone={phone}
          disabled={!canRead}
          items={staged}
          sent={sentThumbs}
          clarity={clarity}
          emptyText={phone ? 'Chụp hoặc chọn ảnh đề & đáp án' : 'Thả ảnh vào đây (trộn nhiều Part đều được)'}
          onEmptyTap={() => picker.current?.click()}
          onActivate={() => undefined}
          onAdd={files => onAddFiles(files)}
          onRemove={onRemoveStaged}
          onMove={onMoveStaged}
          onEdit={onEditPhoto}
          onPreview={phone ? (_zone, idx) => setPreviewIndex(idx) : undefined}
          headRight={<PaperToggle on={photoMode} onChange={onPhotoMode} />}
        />

        <input
          hidden
          ref={picker}
          aria-label="Dán, thả hoặc chọn ảnh đề và đáp án"
          type="file"
          multiple
          accept="image/*"
          disabled={!canRead}
          onChange={event => {
            onAddFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        {!phone && (
          <ScreenshotSuggestBar
            enabled
            quick
            disabled={!canRead}
            maxAdd={Math.max(0, MAX_CAPTURE_IMAGES - staged.length)}
            onAddFiles={onAddFiles}
            onPick={() => picker.current?.click()}
          />
        )}

        {phone && canRead && (
          <div className="wd-mob-acts">
            <button
              type="button"
              className="wd-mob-btn is-cam"
              disabled={staged.length >= MAX_CAPTURE_IMAGES}
              onClick={() => setBurstOpen(true)}
            >
              <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Chụp liên tiếp</span>
            </button>
            <button
              type="button"
              className="wd-mob-btn"
              disabled={staged.length >= MAX_CAPTURE_IMAGES}
              onClick={() => picker.current?.click()}
            >
              <Images className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Chọn ảnh</span>
            </button>
          </div>
        )}

        {badItem && badMsg && (
          <div className="cv-warn-row" role="status">
            <span><b>{badMsg.head}</b>{badMsg.rest}</span>
            <button type="button" className="cv-wbtn" onClick={() => onEditPhoto('questions', badItem.id)}>Chỉnh / cắt</button>
          </div>
        )}

        {!canRead && (
          <p className="wd-note" role="status">Chức năng đọc ảnh hiện chưa sẵn sàng. Bạn có thể ghi tay bên dưới.</p>
        )}

        {(anyReading || readyCount > 0 || savedTotal > 0) && (
          <div className={'attempt-status' + (anyReading ? ' is-reading' : readyCount > 0 ? ' is-ready' : '')} role="status">
            <Soc state={anyReading ? 'think' : readyCount > 0 ? 'yay' : 'idle'} size={34} />
            <span>{anyReading ? 'Sóc đang đọc · ' : ''}{readyCount} câu đủ để lưu · Đã lưu {savedTotal}</span>
          </div>
        )}

        {note && <p className="wd-note" role="status">{note}</p>}

        {contextDoubts.length > 0 && (
          <div className="attempt-doubts">
            {contextDoubts.map(row => (
              <div key={row.id} className="attempt-doubt-row">
                <span>Câu <b>{row.number}</b> chưa ghép được đoạn văn rõ ràng</span>
                <button
                  type="button"
                  className="cv-wbtn"
                  onClick={() => { onCapturePart(row.part); onTargetNumber(String(row.number)); }}
                >
                  Bổ sung đoạn văn cho câu {row.number}
                </button>
              </div>
            ))}
          </div>
        )}

        {jobs.map(job => (job.error || job.note || job.missing.length > 0) && (
          <div key={job.key} className={'attempt-job-msg' + (job.error ? ' is-err' : '')} role={job.error ? 'alert' : 'status'}>
            {job.error || job.note}
            {job.missing.length > 0 && ` Chưa đọc được câu ${job.missing.join(', ')}.`}
          </div>
        ))}

        {jobs.length > 0 && (
          <div className="attempt-follow">
            <label className="attempt-target">
              <span>Bổ sung ảnh cho</span>
              <select className="wd-select" value={targetNumber} onChange={event => onTargetNumber(event.target.value)}>
                <option value="">Các câu chưa đọc</option>
                {items.filter(item => item.kind === 'group' && item.wrong.some(number => remaining.includes(number))).map(item => (
                  <option key={item.key} value={item.key}>Cụm {item.from}–{item.to}</option>
                ))}
                {remaining.map(number => (
                  <option key={number} value={number}>Câu {number}</option>
                ))}
              </select>
            </label>
            {sent.length > 0 && (
              <div className="attempt-sent-wrap">
                <button type="button" className="attempt-q-toggle" aria-expanded={sentOpen} onClick={() => setSentOpen(value => !value)}>
                  <span>Xem và dùng lại ảnh đã gửi ({sent.length})</span>
                  <ChevronDown size={15} className={sentOpen ? 'is-rot' : ''} aria-hidden="true" />
                </button>
                {sentOpen && (
                  <div className="attempt-sent-strip">
                    <div className="attempt-sent-list">
                      {sent.map((image, index) => (
                        <div key={image.job + image.id} className="attempt-sent-card">
                          <button type="button" className="attempt-sent-thumb" onClick={() => setSourcePreview(prev => prev === image.url ? '' : image.url)}>
                            <img src={image.url} alt={`Xem ảnh nguồn ${index + 1}`} />
                          </button>
                          {image.file && (
                            <button
                              type="button"
                              className="attempt-sent-reuse"
                              onClick={() => onAddFiles([image.file!])}
                            >
                              <RotateCcw size={12} aria-hidden="true" />
                              Dùng lại ảnh {index + 1}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {sourcePreview && (
                      <div className="attempt-sent-preview">
                        <img src={sourcePreview} alt="Ảnh nguồn đã chọn" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="wd-err" role="alert">{error}</p>}
      </div>

      <footer className={phone ? 'cv-pfoot cv-bar attempt-foot is-phone' : 'cv-act attempt-foot'}>
        <div className="attempt-foot-sec">
          {manualTarget !== undefined && (
            <button
              type="button"
              className="rd-btn rd-btn--white attempt-sec"
              onClick={() => onManual(partOfQuestion(manualTarget)!, manualTarget)}
            >
              <PenLine size={15} aria-hidden="true" />
              <span>Ghi tay câu {manualTarget}</span>
            </button>
          )}
          {reviewCount > 0 && (
            <button type="button" className="rd-btn rd-btn--white attempt-sec" onClick={onReview}>
              Soát {reviewCount} câu
            </button>
          )}
        </div>
        <div className="attempt-foot-pri">
          {readyCount > 0 && (
            <button type="button" className="rd-btn rd-btn--green attempt-cta" onClick={onSaveReady}>
              <Check size={17} strokeWidth={3} aria-hidden="true" />
              <span>Lưu {readyCount} câu đã đủ</span>
            </button>
          )}
          {(hasSend || readyCount === 0) && (
            <button
              type="button"
              className="rd-btn rd-btn--pink attempt-cta"
              disabled={!canRead || adding || anyReading || (!unread.length && !targetNumber) || !staged.length}
              onClick={onSubmit}
            >
              <span>{staged.length ? `Gửi ${staged.length} ảnh cho Sóc` : 'Gửi ảnh cho Sóc'}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>

      {burstOpen && (
        <BurstCameraModal
          maxPhotos={Math.max(1, MAX_CAPTURE_IMAGES - staged.length)}
          title="Chụp trang chữa bài"
          onClose={() => setBurstOpen(false)}
          onComplete={files => {
            setBurstOpen(false);
            onCameraAdd(files);
          }}
        />
      )}
      {previewIndex !== null && staged.length > 0 && (
        <PhotoPreview
          zone="questions"
          items={staged}
          start={previewIndex}
          twoZones={false}
          onClose={() => setPreviewIndex(null)}
          onRemove={id => onRemoveStaged('questions', id)}
          onSwitch={() => undefined}
          onEdit={id => {
            setPreviewIndex(null);
            onEditPhoto('questions', id);
          }}
        />
      )}
    </>
  );
}
