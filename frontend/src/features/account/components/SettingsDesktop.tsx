import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronRight, Database, Download, LogOut, Shield, Trash2, Upload } from 'lucide-react';
import type { UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { profileDisplayName } from '@/app/components/profileInitials';
import { goalLabel, shownGoal } from '@/features/today/lib/goalSetup';
import { examDateLabel, examState } from '@/features/today/lib/goalEdit';
import { localDate } from '@/features/pacing/lib/pacingModel';
import { PencilIcon } from '@/features/today/components/goal/GoalEditor';
import { LegalLinks } from '@/features/public-pages/components/LegalLinks';
import { DateField } from '@/shared/components/DateField';
import { SettingsGoalEditor, SETTINGS_GOAL_POPOVER_ID } from './SettingsGoalEditor';

/** Fields a desktop tile (or the header) edits on its own; "account" is the account popover. */
export type DesktopSettingsField = 'name' | 'targetScore' | 'examDate' | 'account';
export const SETTINGS_TILE_EDITOR_ID = 'settings-tile-editor';

type SaveField = (patch: Partial<UserProfile>) => string | null;

interface Props {
  profile: UserProfile;
  editing: DesktopSettingsField | null;
  onEdit: (field: DesktopSettingsField | null) => void;
  /** Saves one tile's field merged into the stored profile; returns an error message or null. */
  onSaveField: SaveField;
  /** The goal editor's save (same merge as Hôm nay's goal editor). */
  onSaveGoal: SaveField;
  sync: { localOnly: boolean; waiting: boolean; failed: boolean; label: string; tone: 'local' | 'wait' | 'warn' | 'ok' };
  email: string | null;
  accountAvailable: boolean;
  accountError?: string;
  accountPanel?: React.ReactNode;
  onSignIn?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
  signOutBusy?: boolean;
  signOutError?: string;
  busy: boolean;
  onExport: () => void;
  onPickBackup: () => void;
  onLoadDemo?: () => void;
  onReset?: () => void;
  resetBusy: boolean;
  dataNotice?: React.ReactNode;
  error?: string;
  /** The settings dialog, so popovers that cannot sit beside a tile stay clear of it. */
  dialog: HTMLElement | null;
}

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const Trophy = () => (
  <svg className="stb-tro" viewBox="0 0 90 100" aria-hidden="true">
    <path d="M18 10 C2 10 2 40 24 44" fill="none" stroke="#c98400" strokeWidth="7" />
    <path d="M72 10 C88 10 88 40 66 44" fill="none" stroke="#c98400" strokeWidth="7" />
    <path d="M16 4 H74 C74 40 62 56 45 58 C28 56 16 40 16 4Z" fill="#fff4c4" />
    <path d="M45 18 l4 9 10 1-7.5 6.5 2.3 10-8.8-5.3-8.8 5.3 2.3-10L31 28l10-1Z" fill="#ffc83d" />
    <rect x="38" y="58" width="14" height="12" fill="#c98400" />
    <rect x="24" y="70" width="42" height="9" rx="3" fill="#fff4c4" />
    <rect x="18" y="79" width="54" height="17" rx="3" fill="#2f3a33" />
  </svg>
);

const ShieldMark = ({ fill }: { fill: string }) => (
  <svg className="stb-sh" viewBox="0 0 24 26" aria-hidden="true">
    <path d="M12 1.5 22 5v7c0 6.5-4.5 10.5-10 12.5C6.5 22.5 2 18.5 2 12V5Z" fill={fill} />
    <path d="M8 13l3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Thứ Bảy · 02/01/2027". */
const longDate = (iso: string) => `${examDateLabel(iso).replace(', ', ' · ')}/${iso.slice(0, 4)}`;

/**
 * A small editor beside the tile it edits (right of it when there is room, else left, else under it).
 * Click outside closes it; Escape is handled by the settings dialog, which closes the editor first.
 */
export function TilePopover({ anchor, beside, label, onClose, children, id = SETTINGS_TILE_EDITOR_ID, below = false }: {
  anchor: HTMLElement | null; beside: HTMLElement | null; label: string; onClose: () => void; children: React.ReactNode; id?: string;
  /** Open under the anchor (the header's account link) instead of beside it. */
  below?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; side: 'left' | 'right' | 'below' } | null>(null);
  const width = 340, gap = 14;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const r = (beside ?? anchor)?.getBoundingClientRect() ?? new DOMRect(vw / 2, vh / 2, 0, 0);
    const roomRight = r.right + gap + width <= vw - 12;
    const roomLeft = r.left - gap - width >= 12;
    if (below || (!roomRight && !roomLeft)) {
      const left = Math.max(12, Math.min(vw - width - 12, r.left));
      setPos({ left, top: Math.max(12, Math.min(vh - h - 12, r.bottom + gap)), arrow: 0, side: 'below' });
      return;
    }
    const left = roomRight ? r.right + gap : r.left - gap - width;
    const top = Math.max(12, Math.min(vh - h - 12, r.top));
    setPos({ left, top, arrow: Math.max(24, Math.min(h - 24, r.top + Math.min(r.height / 2, 40) - top)), side: roomRight ? 'right' : 'left' });
  }, [anchor, beside, below]);

  useEffect(() => {
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('input, textarea, button[aria-pressed="true"], button');
    (first ?? node)?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} id={id} role="dialog" aria-label={label} tabIndex={-1}
      className={'rd st stb-pop is-' + (pos?.side ?? 'right')}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width, '--arrow': `${pos?.arrow ?? 40}px` } as CSSProperties}>
      {children}
    </div>,
    document.body
  );
}

function EditorActions({ error, onCancel, onSave, saveLabel = 'Lưu', extra }: { error: string; onCancel: () => void; onSave: () => void; saveLabel?: string; extra?: React.ReactNode }) {
  return <>
    {error && <p role="alert" className="st-err mt-3">{error}</p>}
    <div className="stb-acts">
      {extra}
      <button type="button" className="st-btn st-btn--quiet" onClick={onCancel}>Hủy</button>
      <button type="button" className="st-btn st-btn--green" onClick={onSave}>{saveLabel}</button>
    </div>
  </>;
}

function DateEditor({ value, onSave, onClose }: { value: string; onSave: SaveField; onClose: () => void }) {
  const [date, setDate] = useState(value);
  const [error, setError] = useState('');
  const commit = (examDate: string) => { const message = onSave({ examDate }); if (message) setError(message); else onClose(); };
  return <>
    <h4 className="stb-pop__h">Ngày thi</h4>
    <p className="st-note">Hôm nay đếm ngược tới ngày này. Không bắt buộc.</p>
    <DateField ariaLabel="Ngày thi" value={date} min={localDate(Date.now())} onChange={setDate} className="st-text mt-3" />
    <EditorActions error={error} onCancel={onClose} onSave={() => commit(date)}
      extra={value ? <button type="button" className="st-btn st-btn--quiet stb-acts__left" onClick={() => commit('')}>Bỏ ngày thi</button> : undefined} />
  </>;
}

function NameEditor({ value, onSave, onClose }: { value: string; onSave: SaveField; onClose: () => void }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const save = () => { const message = onSave({ name: text }); if (message) setError(message); else onClose(); };
  return (
    <div className="stb-name-edit">
      <div className="stb-name-edit__row">
        <input ref={input} id="settings-name" type="text" aria-label="Tên của bạn" value={text} maxLength={60} placeholder="Ví dụ: Minh Tuấn"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        <button type="button" className="st-btn st-btn--green" onClick={save}>Lưu</button>
        <button type="button" className="st-btn st-btn--quiet" onClick={onClose}>Hủy</button>
      </div>
      {error && <p role="alert" className="st-err">{error}</p>}
    </div>
  );
}

/** Computers: Cài đặt option B — warm header, tiles that show each value big, one Đổi per tile, data row at the foot. */
export function SettingsDesktop(props: Props) {
  const { profile, editing, onEdit, onSaveField, onSaveGoal, sync, email, accountAvailable, accountError, accountPanel, onSignIn, onSignOut, signOutBusy = false, signOutError = '', busy,
    onExport, onPickBackup, onLoadDemo, onReset, resetBusy, dataNotice, error, dialog } = props;
  const tiles = useRef<Partial<Record<DesktopSettingsField, HTMLElement | null>>>({});
  const buttons = useRef<Partial<Record<DesktopSettingsField, HTMLButtonElement | null>>>({});
  const [signInBusy, setSignInBusy] = useState(false);
  const close = () => onEdit(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const stableClose = useRef(() => closeRef.current()).current;

  const today = localDate(Date.now());
  const exam = examState(profile.examDate, today);
  const goal = shownGoal(profile);
  const freezes = Math.max(0, Math.min(3, profile.streakFreezes || 0));

  const editButton = (field: DesktopSettingsField, label: string, popId = SETTINGS_TILE_EDITOR_ID) => (
    <button type="button" ref={el => { buttons.current[field] = el; }} className="stb-ed" aria-label={`Đổi ${label}`}
      aria-haspopup="dialog" aria-expanded={editing === field} aria-controls={editing === field ? popId : undefined}
      onClick={() => onEdit(editing === field ? null : field)}>
      <PencilIcon size={13} />Đổi
    </button>
  );
  const tile = (field: DesktopSettingsField, cls: string, title: React.ReactNode, titleText: string, body: React.ReactNode, edit: React.ReactNode = editButton(field, titleText.toLowerCase())) => (
    <section ref={el => { tiles.current[field] = el; }} className={`stb-tile ${cls}` + (editing === field ? ' is-on' : '')} aria-labelledby={`stb-k-${field}`}>
      <h4 className="stb-k" id={`stb-k-${field}`}>{title}</h4>
      {body}
      {edit}
    </section>
  );
  const popover = (field: DesktopSettingsField, label: string, content: React.ReactNode) => editing === field && (
    <TilePopover anchor={buttons.current[field] ?? null} beside={tiles.current[field] ?? null} label={label} onClose={stableClose}>{content}</TilePopover>
  );
  const pill = 'is-' + sync.tone;
  const tileEditing = editing !== null && editing !== 'name' && editing !== 'account';

  return (
    <div className={'stb' + (tileEditing ? ' is-editing' : '')} aria-busy={resetBusy}>
      <header className="stb-hero">
        <span className="stb-ava" aria-hidden="true"><Soc state="idle" size={92} /></span>
        <div className="stb-who">
          <h3 id="settings-modal-title" className="stb-title">Cài đặt</h3>
          {editing === 'name'
            ? <NameEditor value={profile.name} onSave={onSaveField} onClose={close} />
            : <div className="stb-nm">
                <b>{profileDisplayName(profile.name)}</b>
                <button type="button" ref={el => { buttons.current.name = el; }} className="stb-pen" aria-label="Đổi tên" disabled={busy} onClick={() => onEdit('name')}><PencilIcon size={14} /></button>
              </div>}
          <div className="stb-sub">
            <span className={'stb-pill ' + pill} role="status"><i aria-hidden="true" />{sync.label}</span>
            {email && <span className="stb-mail">{email}</span>}
            {accountPanel && (
              <button type="button" ref={el => { buttons.current.account = el; }} className="stb-link" aria-haspopup="dialog" aria-expanded={editing === 'account'}
                aria-controls={editing === 'account' ? SETTINGS_TILE_EDITOR_ID : undefined} onClick={() => onEdit(editing === 'account' ? null : 'account')}>
                Tài khoản<ChevronRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {email ? (
          onSignOut && <div className="stb-acct">
            <button type="button" className="st-btn stb-quiet" disabled={busy || signOutBusy} onClick={() => void onSignOut()}>
              <LogOut size={16} aria-hidden="true" />{signOutBusy ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </button>
            {signOutError && <p role="alert" className="st-err">{signOutError}</p>}
          </div>
        ) : accountAvailable && onSignIn ? (
          <div className="stb-signin">
            <button type="button" className="stb-gbtn" disabled={busy || signInBusy} onClick={async () => {
              setSignInBusy(true);
              try { await onSignIn(); } finally { setSignInBusy(false); }
            }}><GoogleLogo />Đăng nhập với Google</button>
            <small>Lưu lên mây để học trên mọi máy</small>
            <LegalLinks className="stb-signin__legal" />
            {accountError && <p role="alert" className="st-err">{accountError}</p>}
          </div>
        ) : null}
      </header>
      {editing === 'account' && <TilePopover anchor={buttons.current.account ?? null} beside={buttons.current.account ?? null} label="Tài khoản và đồng bộ" onClose={stableClose} below>{accountPanel}</TilePopover>}

      <div className="stb-body">
        <fieldset disabled={busy} className="stb-fs">
          <p className="stb-glbl"><i style={{ background: '#ffc83d' }} aria-hidden="true" />Mục tiêu</p>
          <div className="stb-tiles stb-tiles--goal">
            {tile('targetScore', 'stb-goal', 'Điểm mục tiêu', 'Điểm mục tiêu', <>
              <p className="stb-v">{goal === null ? goalLabel(profile) : goal}</p>
              <p className="stb-s">{goal === null ? 'Chọn một mốc để có cầu thang' : 'Cúp cuối cầu thang'}</p>
              <Trophy />
            </>, editButton('targetScore', 'điểm mục tiêu', SETTINGS_GOAL_POPOVER_ID))}
            {tile('examDate', 'stb-date', <><Calendar size={18} aria-hidden="true" />Ngày thi</>, 'Ngày thi', exam.kind === 'none'
              ? <><p className="stb-v stb-v--unset">Chưa đặt</p></>
              : <>
                  <p className="stb-v">{exam.kind === 'past' ? 'Đã thi' : exam.days === 0 ? 'Hôm nay' : `D-${exam.days}`}</p>
                  <p className="stb-s">{longDate(profile.examDate)}</p>
                </>,
              exam.kind === 'none'
                ? <button type="button" ref={el => { buttons.current.examDate = el; }} className="stb-setd" aria-haspopup="dialog" aria-expanded={editing === 'examDate'}
                    aria-controls={editing === 'examDate' ? SETTINGS_TILE_EDITOR_ID : undefined} onClick={() => onEdit(editing === 'examDate' ? null : 'examDate')}>+ Đặt ngày thi</button>
                : editButton('examDate', 'ngày thi'))}
          </div>

          <p className="stb-glbl"><i style={{ background: '#ff7a1a' }} aria-hidden="true" />Chuỗi học</p>
          <div className="stb-tiles stb-tiles--streak">
            <section className="stb-tile stb-shield" aria-labelledby="stb-k-streakFreezes">
              <h4 className="stb-k" id="stb-k-streakFreezes"><Shield size={18} aria-hidden="true" />Khiên cứu chuỗi</h4>
              <p className="stb-shields" aria-label={`${freezes} khiên`}>
                {Array.from({ length: Math.max(1, Math.min(freezes, 3)) }, (_, i) => <ShieldMark key={i} fill={freezes === 0 ? '#cfe3f7' : i === 0 ? '#1c8fe3' : '#8cc4f2'} />)}
                <b aria-hidden="true">×{freezes}</b>
              </p>
              <p className="stb-s">Tự tặng +1 khiên mỗi mốc 7 ngày liền</p>
            </section>
          </div>

          {(dataNotice || error) && <div className="stb-notes">{dataNotice}{error && <p role="alert" className="st-err">{error}</p>}</div>}
        </fieldset>
      </div>

      <footer className="stb-foot" aria-label="Dữ liệu">
        <span className="stb-foot__lb"><span className="stb-foot__ic" aria-hidden="true"><Database size={16} /></span>Dữ liệu</span>
        {email ? (
          <details className="stb-adv">
            <summary>Dữ liệu nâng cao</summary>
            <span className="stb-adv__row">
              <button type="button" className="stb-dq" disabled={busy} onClick={onExport} title="Tải bản sao lưu JSON về máy"><Download size={16} aria-hidden="true" />Tải bản sao lưu</button>
              <button type="button" className="stb-dq" disabled={busy} onClick={onPickBackup} title="Khôi phục dữ liệu từ tệp JSON"><Upload size={16} aria-hidden="true" />Nhập từ file</button>
            </span>
          </details>
        ) : (
          <>
            <button type="button" className="stb-dq" disabled={busy} onClick={onExport} title="Tải bản sao lưu JSON về máy"><Download size={16} aria-hidden="true" />Tải bản sao lưu</button>
            <button type="button" className="stb-dq" disabled={busy} onClick={onPickBackup} title="Khôi phục dữ liệu từ tệp JSON"><Upload size={16} aria-hidden="true" />Nhập từ file</button>
          </>
        )}
        {onLoadDemo && <button type="button" className="stb-dq" disabled={busy} onClick={onLoadDemo} title="Nạp dữ liệu mẫu để xem thử app">Dữ liệu mẫu</button>}
        {onReset && <>
          <span className="stb-foot__sp" />
          <span className="stb-foot__vr" aria-hidden="true" />
          <button type="button" className="stb-del" disabled={resetBusy || busy} onClick={onReset}>
            <Trash2 size={17} aria-hidden="true" />{resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu'}
          </button>
        </>}
        <LegalLinks className="stb-foot__legal" />
      </footer>

      {editing === 'targetScore' && <SettingsGoalEditor phone={false} anchor={buttons.current.targetScore ?? null} beside={tiles.current.targetScore ?? dialog} profile={profile} onSaveField={onSaveGoal} onClose={stableClose} />}
      {popover('examDate', 'Ngày thi', <DateEditor value={profile.examDate} onSave={onSaveField} onClose={stableClose} />)}
    </div>
  );
}
