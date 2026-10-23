import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronRight, Cloud, Database, Download, Minus, Plus, Quote, RotateCcw, ShieldCheck, Target, Timer, Trash2, Upload } from 'lucide-react';
import type { UserProfile } from '@/shared/types';
import { useOverlayHistory } from '@/shared/hooks/overlayHistory';
import { profileDisplayName, profileInitials } from '@/app/components/profileInitials';

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
  onClose?: () => void;
  /** Restore preview and errors, shown under the data group. */
  dataNotice?: React.ReactNode;
}

function daysUntil(date: string) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

const formatDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

const groupClass = 'overflow-hidden rounded-2xl border-[1.5px] border-stone-300 bg-white dark:border-slate-700 dark:bg-[#111A2C]';
const rowClass = 'flex min-h-14 w-full items-center gap-3 border-t border-stone-100 px-3.5 text-left text-[15px] font-bold text-slate-900 first:border-t-0 dark:border-slate-800 dark:text-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';

function Icon({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-slate-900 text-slate-900 dark:border-slate-400 dark:text-slate-900 ' + tone}>{children}</span>;
}

/** Phone settings: grouped rows that show each current value; a row opens a small sheet that saves only that field. */
export function PhoneSettings({ profile, syncLabel, editing, setEditing, onSaveField, accountPanel, signOutAction, onExport, onPickBackup, onLoadDemo, onReset, resetBusy, dataNotice, onClose }: Props) {
  const days = daysUntil(profile.examDate);
  const row = (field: PhoneSettingsField, icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <button type="button" className={rowClass} onClick={() => setEditing(field)} data-settings-row={field}>
      {icon}<span className="flex-1">{label}</span>
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-500 dark:text-slate-400">{value}<ChevronRight size={16} aria-hidden="true" /></span>
    </button>
  );
  const pill = (text: string, tone: string) => <span className={'flex h-7 items-center rounded-[9px] border-2 border-slate-900 px-2.5 text-[13px] font-black text-slate-950 ' + tone}>{text}</span>;

  return (
    <div className="space-y-4 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={() => setEditing('account')} data-settings-row="account"
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-900 bg-white p-3.5 text-left shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1] cursor-pointer">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 bg-[#DDD6FE] font-black text-slate-950">{profileInitials(profile.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-black text-slate-950 dark:text-white">{profileDisplayName(profile.name)}</span>
          <span className="block truncate text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">{syncLabel ?? 'Tên và tài khoản'}</span>
        </span>
        <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 text-[13px] font-black text-slate-950 dark:border-slate-300 dark:bg-slate-900 dark:text-white"><Cloud size={15} aria-hidden="true" />Đồng bộ</span>
      </button>

      <section>
        <h4 className="mb-1.5 ml-1 text-[12px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Mục tiêu</h4>
        <div className={groupClass}>
          {row('targetScore', <Icon tone="bg-blue-100"><Target size={17} /></Icon>, 'Điểm mục tiêu', pill(String(profile.targetScore), 'bg-blue-100'))}
          {row('examDate', <Icon tone="bg-sky-200"><Calendar size={17} /></Icon>, 'Ngày thi',
            profile.examDate ? <>{formatDate(profile.examDate)}{days !== null && pill(`D-${days}`, 'bg-sky-200')}</> : 'Chưa đặt')}
          {row('dailyMinGoalMinutes', <Icon tone="bg-emerald-100"><Timer size={17} /></Icon>, 'Học mỗi ngày', `${profile.dailyMinGoalMinutes} phút`)}
        </div>
      </section>

      <section>
        <h4 className="mb-1.5 ml-1 text-[12px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Chuỗi học</h4>
        <div className={groupClass}>
          {row('streakFreezes', <Icon tone="bg-amber-100"><ShieldCheck size={17} /></Icon>, 'Khiên cứu chuỗi', `${profile.streakFreezes} khiên`)}
          {row('motto', <Icon tone="bg-violet-100"><Quote size={17} /></Icon>, 'Châm ngôn', <span className="max-w-[120px] truncate">{profile.motto?.trim() || 'Chưa đặt'}</span>)}
        </div>
      </section>

      <section>
        <h4 className="mb-1.5 ml-1 text-[12px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Dữ liệu</h4>
        <div className={groupClass}>
          <button type="button" className={rowClass} onClick={onExport}><Icon tone="bg-slate-100"><Download size={17} /></Icon><span className="flex-1">Sao lưu ra tệp</span><ChevronRight size={16} className="text-slate-400" aria-hidden="true" /></button>
          <button type="button" className={rowClass} onClick={onPickBackup}><Icon tone="bg-slate-100"><Upload size={17} /></Icon><span className="flex-1">Khôi phục từ tệp</span><ChevronRight size={16} className="text-slate-400" aria-hidden="true" /></button>
          {onLoadDemo && <button type="button" className={rowClass} onClick={onLoadDemo}><Icon tone="bg-slate-100"><RotateCcw size={17} /></Icon><span className="flex-1">Nạp dữ liệu mẫu</span><Database size={16} className="text-slate-400" aria-hidden="true" /></button>}
          {onReset && <button type="button" className={rowClass + ' !text-rose-600 dark:!text-rose-400'} onClick={onReset} disabled={resetBusy}>
            <Icon tone="bg-rose-100 !border-rose-600"><Trash2 size={17} className="text-rose-600" /></Icon>{resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu'}
          </button>}
        </div>
        {signOutAction}
        {dataNotice && <div className="mt-3 space-y-3 text-xs">{dataNotice}</div>}
        {onClose && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-slate-900 bg-white text-sm font-black text-slate-800 shadow-[2px_2px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C] dark:text-white"
            >
              Đóng Cài Đặt
            </button>
          </div>
        )}
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
  targetScore: { min: 10, max: 990, step: 5, presets: [650, 750, 850, 900, 990], unit: '' },
  dailyMinGoalMinutes: { min: 5, max: 300, step: 5, presets: [15, 30, 45, 60, 90], unit: ' phút' },
  streakFreezes: { min: 0, max: 5, step: 1, presets: [0, 1, 2, 3, 5], unit: '' }
} as const;

function EditSheet({ field, profile, accountPanel, onSave, onClose }: {
  field: PhoneSettingsField; profile: UserProfile; accountPanel?: React.ReactNode;
  onSave: (patch: Partial<UserProfile>) => string | null; onClose: () => void;
}) {
  const [number, setNumber] = useState(field in STEPPERS ? Number(profile[field as keyof typeof STEPPERS]) : 0);
  const [text, setText] = useState(field === 'account' ? profile.name : field === 'motto' ? profile.motto ?? '' : field === 'examDate' ? profile.examDate ?? '' : '');
  const [error, setError] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  useOverlayHistory(true, onClose);
  useEffect(() => {
    const first = sheetRef.current?.querySelector<HTMLElement>('input, textarea, button');
    first?.focus();
  }, []);
  const stepper = STEPPERS[field as keyof typeof STEPPERS];
  const save = () => {
    const patch: Partial<UserProfile> = stepper ? { [field]: number } : field === 'account' ? { name: text } : { [field]: text };
    const message = onSave(patch);
    if (message) setError(message); else onClose();
  };
  const clamp = (value: number) => stepper ? Math.max(stepper.min, Math.min(stepper.max, value)) : value;
  const textInput = 'mt-2 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-[16px] font-semibold text-slate-950 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white';

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button type="button" tabIndex={-1} aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-950/45 cursor-default" />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={TITLES[field]}
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t-2 border-slate-900 bg-[#FDFBF7] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 text-slate-900 dark:border-slate-600 dark:bg-[#0B132B] dark:text-slate-100">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
        <h3 className="text-lg font-black">{TITLES[field]}</h3>
        {HINTS[field] && <p className="mt-0.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{HINTS[field]}</p>}

        {stepper && <>
          <div className="mt-5 flex items-center justify-center gap-5">
            <button type="button" aria-label="Giảm" onClick={() => setNumber(value => clamp(value - stepper.step))}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border-2 border-slate-900 bg-white shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900 dark:shadow-none cursor-pointer"><Minus size={22} /></button>
            <input data-large-text type="text" inputMode="numeric" aria-label={TITLES[field]} value={number}
              onChange={event => setNumber(Number(event.target.value.replace(/\D/g, '') || 0))}
              onBlur={() => setNumber(value => clamp(Math.round(value / stepper.step) * stepper.step))}
              className="w-36 bg-transparent text-center text-[52px] font-black tracking-tight tabular-nums text-slate-950 outline-none dark:text-white" />
            <button type="button" aria-label="Tăng" onClick={() => setNumber(value => clamp(value + stepper.step))}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border-2 border-slate-900 bg-white shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900 dark:shadow-none cursor-pointer"><Plus size={22} /></button>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            {stepper.presets.map(preset => (
              <button key={preset} type="button" aria-pressed={number === preset} onClick={() => setNumber(preset)}
                className={'h-10 rounded-xl px-3 text-[14px] font-black tabular-nums cursor-pointer ' + (number === preset
                  ? 'border-2 border-slate-900 bg-blue-100 text-slate-950 dark:border-slate-200'
                  : 'border-[1.5px] border-stone-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>
                {preset}
              </button>
            ))}
          </div>
        </>}

        {field === 'examDate' && <input type="date" aria-label="Chọn ngày thi" value={text} onChange={event => setText(event.target.value)} className={textInput + ' h-12'} />}
        {field === 'motto' && <textarea aria-label="Châm ngôn" rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="Ví dụ: Mỗi ngày một đề" className={textInput + ' py-2.5'} />}
        {field === 'account' && <>
          <label className="mt-4 block text-[13px] font-bold text-slate-600 dark:text-slate-300">Tên học viên
            <input type="text" value={text} onChange={event => setText(event.target.value)} placeholder="Ví dụ: Minh Tuấn" className={textInput + ' h-12'} />
          </label>
          {accountPanel && <div className="mt-4 text-xs">{accountPanel}</div>}
        </>}

        {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onClose} className="h-[52px] rounded-2xl border border-slate-300 bg-white text-[15px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer">Hủy</button>
          <button type="button" onClick={save}
            className="h-[52px] rounded-2xl border-2 border-slate-900 bg-blue-600 text-[15px] font-black text-white shadow-[2px_2px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 cursor-pointer">
            {field === 'account' ? 'Lưu tên' : 'Lưu'}
          </button>
          {field === 'examDate' && profile.examDate && (
            <button type="button" onClick={() => { const message = onSave({ examDate: '' }); if (message) setError(message); else onClose(); }}
              className="h-11 text-[14px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer">Bỏ ngày thi</button>
          )}
        </div>
      </div>
    </div>
  );
}
