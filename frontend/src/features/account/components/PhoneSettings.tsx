import React, { useState } from 'react';
import { Calendar, ChevronRight, Cloud, Database, Download, RotateCcw, ShieldCheck, Target, Trash2, Upload } from 'lucide-react';
import type { UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { PhoneSheet } from '@/app/components/phone/PhoneSheet';
import { profileDisplayName } from '@/app/components/profileInitials';
import { goalLabel } from '@/features/today/lib/goalSetup';
import { daysUntil as localDaysUntil } from '@/features/journey/lib/scoreJourney';
import { getTodayDateString } from '@/shared/data/storage';
import { LegalLinks } from '@/features/public-pages/components/LegalLinks';
import { DateField } from '@/shared/components/DateField';
import { SettingsGoalEditor } from './SettingsGoalEditor';
import './account.css';

export type PhoneSettingsField = 'account' | 'targetScore' | 'examDate';

interface Props {
  profile: UserProfile;
  syncLabel?: string;
  syncTone?: 'ok' | 'warn' | 'local' | 'wait';
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
  return localDaysUntil(date, getTodayDateString());
}

const formatDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

function Icon({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={'st-ic ' + tone} aria-hidden="true">{children}</span>;
}

/** Phone settings: grouped rows that show each current value; a row opens a small sheet that saves only that field. */
export function PhoneSettings({ profile, syncLabel, syncTone = 'local', editing, setEditing, onSaveField, accountPanel, signOutAction, onExport, onPickBackup, onLoadDemo, onReset, resetBusy, dataNotice }: Props) {
  const days = daysUntil(profile.examDate);
  const signedIn = Boolean(signOutAction) || syncTone === 'ok';
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
        <span className="st-me__av st-me__soc" aria-hidden="true"><Soc state="idle" size={50} /></span>
        <span className="st-me__who">
          <b>{profileDisplayName(profile.name)}</b>
          <small className={`st-me__sync is-${syncTone}`} aria-live="polite">{syncLabel ?? 'Tên và tài khoản'}</small>
        </span>
        <span className="st-sync"><Cloud size={15} aria-hidden="true" />Đồng bộ</span>
      </button>

      <section>
        <h4 className="st-h">Mục tiêu</h4>
        <div className="st-group">
          {row('targetScore', <Icon tone="st-b"><Target size={19} /></Icon>, 'Điểm mục tiêu', <span className="st-pill st-b">{goalLabel(profile)}</span>)}
          {row('examDate', <Icon tone="st-v"><Calendar size={19} /></Icon>, 'Ngày thi',
            profile.examDate ? <>{formatDate(profile.examDate)}{days !== null && <span className="st-pill st-v">D-{days}</span>}</> : 'Chưa đặt')}
        </div>
      </section>

      <section>
        <h4 className="st-h">Chuỗi học</h4>
        <div className="st-group">
          <div className="st-row">
            <Icon tone="st-y"><ShieldCheck size={19} /></Icon>
            <span className="st-lbl">Khiên cứu chuỗi<small className="block font-bold text-xs text-[var(--rd-mut)]">Tự tặng +1 khiên mỗi mốc 7 ngày liền</small></span>
            <span className="st-val">{profile.streakFreezes} khiên</span>
          </div>
        </div>
      </section>

      <section>
        <h4 className="st-h">Dữ liệu</h4>
        <div className="st-group">
          {!signedIn && <>
            {action(<Icon tone="st-t"><Download size={19} /></Icon>, 'Sao lưu ra tệp', onExport)}
            {action(<Icon tone="st-t"><Upload size={19} /></Icon>, 'Khôi phục từ tệp', onPickBackup)}
          </>}
          {onLoadDemo && <button type="button" className="st-row" onClick={onLoadDemo}>
            <Icon tone="st-n"><RotateCcw size={19} /></Icon><span className="st-lbl">Nạp dữ liệu mẫu</span><Database size={17} className="st-ar" aria-hidden="true" />
          </button>}
          {onReset && action(<Icon tone="st-n"><Trash2 size={19} /></Icon>, resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu', onReset, { danger: true, disabled: resetBusy })}
        </div>
        {signedIn && (
          <details className="stb-adv mt-3">
            <summary>Dữ liệu nâng cao</summary>
            <div className="st-group mt-2">
              {action(<Icon tone="st-t"><Download size={19} /></Icon>, 'Sao lưu ra tệp', onExport)}
              {action(<Icon tone="st-t"><Upload size={19} /></Icon>, 'Khôi phục từ tệp', onPickBackup)}
            </div>
          </details>
        )}
        {signOutAction}
        {dataNotice && <div className="mt-3 space-y-3">{dataNotice}</div>}
        <LegalLinks className="st-ph__legal" />
      </section>

      {editing === 'targetScore' && <SettingsGoalEditor phone profile={profile} onSaveField={onSaveField} onClose={() => setEditing(null)} />}
      {editing && editing !== 'targetScore' && <EditSheet field={editing} profile={profile} accountPanel={accountPanel} onSave={onSaveField} onClose={() => setEditing(null)} />}
    </div>
  );
}

const TITLES: Record<PhoneSettingsField, string> = {
  account: 'Tài khoản', targetScore: 'Điểm mục tiêu', examDate: 'Ngày thi'
};
const HINTS: Partial<Record<PhoneSettingsField, string>> = {
  examDate: 'Thanh trên đếm ngược tới ngày này'
};

function EditSheet({ field, profile, accountPanel, onSave, onClose }: {
  field: PhoneSettingsField; profile: UserProfile; accountPanel?: React.ReactNode;
  onSave: (patch: Partial<UserProfile>) => string | null; onClose: () => void;
}) {
  const [text, setText] = useState(field === 'account' ? profile.name : field === 'examDate' ? profile.examDate ?? '' : '');
  const [error, setError] = useState('');
  const save = () => {
    const patch: Partial<UserProfile> = field === 'account' ? { name: text } : { [field]: text };
    const message = onSave(patch);
    if (message) setError(message); else onClose();
  };

  return (
    <PhoneSheet title={TITLES[field]} onClose={onClose}>
      <div className="st">
        {HINTS[field] && <p className="st-note st-sheet-hint">{HINTS[field]}</p>}

        {field === 'examDate' && <DateField ariaLabel="Chọn ngày thi" value={text} min={getTodayDateString()} onChange={setText} className="st-text mt-4" />}
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
