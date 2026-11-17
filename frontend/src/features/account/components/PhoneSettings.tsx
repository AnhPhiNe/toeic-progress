import React, { useState } from 'react';
import { Calendar, ChevronRight, Cloud, Database, Download, Minus, Plus, Quote, RotateCcw, ShieldCheck, Target, Timer, Trash2, Upload } from 'lucide-react';
import type { UserProfile } from '@/shared/types';
import { PhoneSheet } from '@/app/components/phone/PhoneSheet';
import { profileDisplayName, profileInitials } from '@/app/components/profileInitials';
import './account.css';

export type PhoneSettingsField = 'account' | 'targetScore' | 'examDate' | 'dailyMinGoalMinutes' | 'streakFreezes' | 'motto';

interface Props {
  profile: UserProfile;
  syncLabel?: string;
  editing: PhoneSettingsField | null;
  setEditing: (field: PhoneSettingsField | null) => void;
  /** Saves one field through the same merge as the desktop form; returns an error message or null. */
  onSaveField: (patch: Partial<UserProfile>) => string | null;
  accountPanel?: React.ReactNode;
  signOutAction?: React.ReactNode;
  onExport: () => void;
  onPickBackup: () => void;
  onLoadDemo?: () => void;
  onReset?: () => void;
  resetBusy: boolean;
  /** Restore preview and errors, shown under the data group. */
  dataNotice?: React.ReactNode;
}

function daysUntil(date: string) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

const formatDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

function Icon({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={'st-ic ' + tone} aria-hidden="true">{children}</span>;
}

/** Phone settings: grouped rows that show each current value; a row opens a small sheet that saves only that field. */
export function PhoneSettings({ profile, syncLabel, editing, setEditing, onSaveField, accountPanel, signOutAction, onExport, onPickBackup, onLoadDemo, onReset, resetBusy, dataNotice }: Props) {
  const days = daysUntil(profile.examDate);
  const row = (field: PhoneSettingsField, icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <button type="button" className="st-row" onClick={() => setEditing(field)} data-settings-row={field}>
      {icon}<span className="st-lbl">{label}</span>
      <span className="st-val">{value}<ChevronRight size={18} className="st-ar" aria-hidden="true" /></span>
    </button>
  );
  const action = (icon: React.ReactNode, label: string, onClick: () => void, extra?: { danger?: boolean; disabled?: boolean }) => (
    <button type="button" className={'st-row' + (extra?.danger ? ' st-danger' : '')} onClick={onClick} disabled={extra?.disabled}>
      {icon}<span className="st-lbl">{label}</span>
    </button>
  );

  return (
    <div className="rd st st-ph">
      <button type="button" onClick={() => setEditing('account')} data-settings-row="account" className="st-me">
        <span className="st-me__av" aria-hidden="true">{profileInitials(profile.name)}</span>
        <span className="st-me__who">
          <b>{profileDisplayName(profile.name)}</b>
          <small>{syncLabel ?? 'Tên và tài khoản'}</small>
        </span>
        <span className="st-sync"><Cloud size={15} aria-hidden="true" />Đồng bộ</span>
      </button>

      <section>
        <h4 className="st-h">Mục tiêu</h4>
        <div className="st-group">
          {row('targetScore', <Icon tone="st-b"><Target size={19} /></Icon>, 'Điểm mục tiêu', <span className="st-pill st-b">{profile.targetScore}</span>)}
          {row('examDate', <Icon tone="st-v"><Calendar size={19} /></Icon>, 'Ngày thi',
            profile.examDate ? <>{formatDate(profile.examDate)}{days !== null && <span className="st-pill st-v">D-{days}</span>}</> : 'Chưa đặt')}
          {row('dailyMinGoalMinutes', <Icon tone="st-g"><Timer size={19} /></Icon>, 'Học mỗi ngày', `${profile.dailyMinGoalMinutes} phút`)}
        </div>
      </section>

      <section>
        <h4 className="st-h">Chuỗi học</h4>
        <div className="st-group">
          {row('streakFreezes', <Icon tone="st-y"><ShieldCheck size={19} /></Icon>, 'Khiên cứu chuỗi', `${profile.streakFreezes} khiên`)}
          {row('motto', <Icon tone="st-p"><Quote size={19} /></Icon>, 'Châm ngôn', <span className="max-w-[120px] truncate">{profile.motto?.trim() || 'Chưa đặt'}</span>)}
        </div>
      </section>

      <section>
        <h4 className="st-h">Dữ liệu</h4>
        <div className="st-group">
          {action(<Icon tone="st-t"><Download size={19} /></Icon>, 'Sao lưu ra tệp', onExport)}
          {action(<Icon tone="st-t"><Upload size={19} /></Icon>, 'Khôi phục từ tệp', onPickBackup)}
          {onLoadDemo && <button type="button" className="st-row" onClick={onLoadDemo}>
            <Icon tone="st-n"><RotateCcw size={19} /></Icon><span className="st-lbl">Nạp dữ liệu mẫu</span><Database size={17} className="st-ar" aria-hidden="true" />
          </button>}
          {onReset && action(<Icon tone="st-n"><Trash2 size={19} /></Icon>, resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu', onReset, { danger: true, disabled: resetBusy })}
        </div>
        {signOutAction}
        {dataNotice && <div className="mt-3 space-y-3">{dataNotice}</div>}
      </section>

      {editing && <EditSheet field={editing} profile={profile} accountPanel={accountPanel} onSave={onSaveField} onClose={() => setEditing(null)} />}
    </div>
  );
}

const TITLES: Record<PhoneSettingsField, string> = {
  account: 'Tài khoản', targetScore: 'Điểm mục tiêu', examDate: 'Ngày thi', dailyMinGoalMinutes: 'Học mỗi ngày', streakFreezes: 'Khiên cứu chuỗi', motto: 'Châm ngôn'
};
const HINTS: Partial<Record<PhoneSettingsField, string>> = {
  targetScore: 'Dùng để tính khoảng cách và kế hoạch tuần',
  examDate: 'Thanh trên đếm ngược tới ngày này',
  dailyMinGoalMinutes: 'Thời gian tối thiểu để tính là đã học trong ngày',
  streakFreezes: 'Giữ chuỗi khi lỡ một ngày (tối đa 5)'
};
const STEPPERS = {
  targetScore: { min: 10, max: 990, step: 5, presets: [650, 750, 850, 900, 990] },
  dailyMinGoalMinutes: { min: 5, max: 300, step: 5, presets: [15, 30, 45, 60, 90] },
  streakFreezes: { min: 0, max: 5, step: 1, presets: [0, 1, 2, 3, 5] }
} as const;

function EditSheet({ field, profile, accountPanel, onSave, onClose }: {
  field: PhoneSettingsField; profile: UserProfile; accountPanel?: React.ReactNode;
  onSave: (patch: Partial<UserProfile>) => string | null; onClose: () => void;
}) {
  const [number, setNumber] = useState(field in STEPPERS ? Number(profile[field as keyof typeof STEPPERS]) : 0);
  const [text, setText] = useState(field === 'account' ? profile.name : field === 'motto' ? profile.motto ?? '' : field === 'examDate' ? profile.examDate ?? '' : '');
  const [error, setError] = useState('');
  const stepper = STEPPERS[field as keyof typeof STEPPERS];
  const save = () => {
    const patch: Partial<UserProfile> = stepper ? { [field]: number } : field === 'account' ? { name: text } : { [field]: text };
    const message = onSave(patch);
    if (message) setError(message); else onClose();
  };
  const clamp = (value: number) => stepper ? Math.max(stepper.min, Math.min(stepper.max, value)) : value;

  return (
    <PhoneSheet title={TITLES[field]} onClose={onClose}>
      <div className="st">
        {HINTS[field] && <p className="st-note st-sheet-hint">{HINTS[field]}</p>}

        {stepper && <>
          <div className="st-step">
            <button type="button" className="st-step__b" aria-label="Giảm" onClick={() => setNumber(value => clamp(value - stepper.step))}><Minus size={24} /></button>
            <input data-large-text type="text" inputMode="numeric" aria-label={TITLES[field]} value={number} className="st-step__n"
              onChange={event => setNumber(Number(event.target.value.replace(/\D/g, '') || 0))}
              onBlur={() => setNumber(value => clamp(Math.round(value / stepper.step) * stepper.step))} />
            <button type="button" className="st-step__b" aria-label="Tăng" onClick={() => setNumber(value => clamp(value + stepper.step))}><Plus size={24} /></button>
          </div>
          <div className="st-chips">
            {stepper.presets.map(preset => (
              <button key={preset} type="button" className="st-chip" aria-pressed={number === preset} onClick={() => setNumber(preset)}>{preset}</button>
            ))}
          </div>
        </>}

        {field === 'examDate' && <input type="date" aria-label="Chọn ngày thi" value={text} onChange={event => setText(event.target.value)} className="st-text mt-4" />}
        {field === 'motto' && <textarea aria-label="Châm ngôn" rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="Ví dụ: Mỗi ngày một đề" className="st-text mt-4" />}
        {field === 'account' && <>
          <label className="st-label mt-4">Tên học viên
            <input type="text" value={text} onChange={event => setText(event.target.value)} placeholder="Ví dụ: Minh Tuấn" className="st-text" />
          </label>
          {accountPanel && <div className="mt-4">{accountPanel}</div>}
        </>}

        {error && <p role="alert" className="st-err mt-3">{error}</p>}
        <div className="st-sheet-acts">
          <button type="button" onClick={onClose} className="st-btn st-btn--soft st-btn--wide">Hủy</button>
          <button type="button" onClick={save} className="st-btn st-btn--green st-btn--wide">{field === 'account' ? 'Lưu tên' : 'Lưu'}</button>
          {field === 'examDate' && profile.examDate && (
            <button type="button" className="st-btn st-btn--quiet" onClick={() => { const message = onSave({ examDate: '' }); if (message) setError(message); else onClose(); }}>Bỏ ngày thi</button>
          )}
        </div>
      </div>
    </PhoneSheet>
  );
}
