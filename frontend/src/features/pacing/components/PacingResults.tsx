import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';
import type { PacingRun } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';
import { formatClock, formatNumber, PRESETS, type PacingMode } from '@/features/pacing/lib/pacingModel';
import { isTooShortRun, runAccuracy, runLabel, runSeconds, runSpeed } from '@/features/pacing/lib/pacingStats';
import { pacingPrimary } from './PacingDialogs';

type Family = 'ALL' | 'PART_5' | 'PART_6' | 'PART_7' | 'FULL_READING' | 'POMODORO';
const FAMILIES: { id: Exclude<Family, 'ALL'>; label: string; modes: string[]; tag: string }[] = [
  { id: 'PART_5', label: 'Part 5', modes: ['PART_5'], tag: 'bg-indigo-200' },
  { id: 'PART_6', label: 'Part 6', modes: ['PART_6'], tag: 'bg-sky-200' },
  { id: 'PART_7', label: 'Part 7', modes: ['PART_7', 'PART_7_SINGLE', 'PART_7_MULTI'], tag: 'bg-amber-200' },
  { id: 'FULL_READING', label: 'Reading', modes: ['FULL_READING'], tag: 'bg-teal-200' },
  { id: 'POMODORO', label: 'Tập trung', modes: ['POMODORO'], tag: 'bg-rose-200' }
];
const CHART_WINDOW = 20;
const PAGE_SIZE = 5;
const familyOf = (run: PacingRun) => FAMILIES.find(family => family.modes.includes(run.partType ?? ''));
const chronological = (a: PacingRun, b: PacingRun) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const shortDate = (date: string) => date.split('-').reverse().slice(0, 2).join('/');
const speedText = (value: number) => value < .1 ? '<0,1' : formatNumber(value);
/** Target seconds per question of a family: the standard time of its full preset. */
const targetOf = (family: Exclude<Family, 'ALL' | 'POMODORO'>) => PRESETS[family as PacingMode].minutes * 60 / PRESETS[family as PacingMode].questions;

interface Props {
  runs: PacingRun[];
  initialMode: PacingMode;
  theme: 'light' | 'dark';
  onPractice: (mode: PacingMode) => void;
  onEdit: (run: PacingRun) => void;
  onDelete: (run: PacingRun) => void;
}

/** One page for past runs: a mode filter, the speed trend of that mode, then the runs themselves. */
export function PacingResults({ runs, initialMode, theme, onPractice, onEdit, onDelete }: Props) {
  const live = useMemo(() => runs.filter(run => !run.deletedAt), [runs]);
  const families = FAMILIES.filter(family => family.id !== 'POMODORO' || live.some(run => run.partType === 'POMODORO'));
  const startFamily = (FAMILIES.find(family => family.modes.includes(initialMode))?.id ?? 'PART_5') as Family;
  const [family, setFamily] = useState<Family>(startFamily === 'POMODORO' ? 'ALL' : startFamily);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [windowEnd, setWindowEnd] = useState(0); // runs hidden after the window, counted from the newest
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuId) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('[role="menu"], [aria-haspopup="menu"]')) setMenuId(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuId]);
  const choose = (next: Family) => { setFamily(next); setPage(1); setWindowEnd(0); setSelectedId(null); };

  const familyInfo = FAMILIES.find(item => item.id === family);
  const charted = family !== 'ALL' && family !== 'POMODORO';
  const trend = useMemo(() => !charted || !familyInfo ? [] : live
    .filter(run => familyInfo.modes.includes(run.partType ?? '') && runSpeed(run) !== null && !isTooShortRun(run))
    .sort(chronological), [live, charted, familyInfo]);
  const end = Math.max(0, trend.length - windowEnd);
  const windowRuns = trend.slice(Math.max(0, end - CHART_WINDOW), end);
  const data = windowRuns.map(run => ({ id: run.id, date: shortDate(run.date), name: run.testName?.trim() || runLabel(run), speed: Number(runSpeed(run)!.toFixed(1)), accuracy: runAccuracy(run), correct: run.correctAnswers, total: run.totalQuestions }));
  const target = charted ? targetOf(family as 'PART_5') : 0;
  const latest = trend[trend.length - 1];
  const best = trend.reduce<PacingRun | null>((min, run) => !min || runSpeed(run)! < runSpeed(min)! ? run : min, null);
  const graded = trend.map(runAccuracy).filter((value): value is number => value !== null);
  const averageAccuracy = graded.length ? graded.reduce((sum, value) => sum + value, 0) / graded.length : null;

  const listed = useMemo(() => live
    .filter(run => family === 'ALL' || familyInfo?.modes.includes(run.partType ?? ''))
    .filter(run => !query.trim() || [run.testName ?? '', run.presetName, run.date].some(text => testNameKey(text).includes(testNameKey(query))))
    .sort((a, b) => chronological(b, a)), [live, family, familyInfo, query]);
  const pages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = listed.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const isDark = theme === 'dark';
  const ink = isDark ? '#f1f5f9' : '#0f172a', text = isDark ? '#cbd5e1' : '#64748b', grid = isDark ? '#334155' : '#e2e8f0', line = isDark ? '#818cf8' : '#4f46e5';
  const maxSpeed = Math.max(target, ...data.map(row => row.speed));
  const minSpeed = Math.min(target, ...data.map(row => row.speed));
  // Even ticks a little beyond the data and the target, so the trend fills the chart instead of hugging zero.
  const step = maxSpeed - minSpeed > 40 ? 20 : maxSpeed - minSpeed > 16 ? 10 : maxSpeed - minSpeed > 6 ? 5 : 2;
  const domain: [number, number] = [Math.max(0, Math.floor((minSpeed - step / 2) / step) * step), Math.ceil((maxSpeed + step / 2) / step) * step];
  const ticks = Array.from({ length: Math.round((domain[1] - domain[0]) / step) + 1 }, (_, index) => domain[0] + index * step);

  const chip = (id: Family, label: string) => (
    <button key={id} type="button" aria-pressed={family === id} onClick={() => choose(id)}
      className={`min-h-9 cursor-pointer rounded-xl border-2 px-3 text-sm font-extrabold transition ${family === id ? 'border-slate-900 bg-indigo-100 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:bg-indigo-950 dark:shadow-none' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'}`}>
      {label}
    </button>
  );

  return (
    <section className="pacing-panel" aria-label="Kết quả luyện tập">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Chế độ kết quả" className="flex flex-wrap gap-1.5">
          {chip('ALL', 'Tất cả')}
          {families.map(item => chip(item.id, item.label))}
        </div>
        {live.length > 0 && <input type="search" aria-label="Tìm đề trong lịch sử" placeholder="Tìm tên đề…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}
          className="ml-auto min-h-10 w-full max-w-60 rounded-xl border-2 border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" />}
      </div>

      {charted && (
        <div className="mt-5 rounded-2xl border-2 border-slate-900 p-4 sm:p-5 dark:border-slate-300">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-black">{familyInfo?.label} · giây mỗi câu qua {windowRuns.length || 0} lượt gần nhất</h2>
            {trend.length > CHART_WINDOW && (
              <nav aria-label="Trang biểu đồ" className="flex items-center gap-1">
                <button type="button" disabled={end - CHART_WINDOW <= 0} onClick={() => setWindowEnd(value => value + CHART_WINDOW)}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-extrabold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-slate-800">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />Cũ hơn
                </button>
                <button type="button" disabled={windowEnd === 0} onClick={() => setWindowEnd(value => Math.max(0, value - CHART_WINDOW))}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-extrabold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-slate-800">
                  Mới hơn<ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
          {trend.length ? <>
            <dl className="mt-3 grid grid-cols-3 gap-2.5 sm:max-w-xl">
              {[
                ['Gần nhất', latest ? speedText(runSpeed(latest)!) : '—', 's/câu'],
                ['Tốt nhất', best ? speedText(runSpeed(best)!) : '—', 's/câu'],
                ['Chính xác TB', averageAccuracy === null ? '—' : formatNumber(Math.round(averageAccuracy)), averageAccuracy === null ? '' : '%']
              ].map(([label, value, unit]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="text-xl font-black tabular-nums">{value}<span className="ml-1 text-xs font-bold text-slate-500 dark:text-slate-400">{unit}</span></dd>
                </div>
              ))}
            </dl>
            <div role="img" className="mt-2" aria-label={`Giây mỗi câu ${familyInfo?.label}, mục tiêu ${formatNumber(target)} giây: ${data.map(row => `${row.date} ${speedText(row.speed)} giây`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
                  <XAxis dataKey="id" tickFormatter={id => data.find(row => row.id === id)?.date ?? ''} tick={{ fontSize: 12, fill: text }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis domain={domain} ticks={ticks} interval={0} tick={{ fontSize: 12, fill: text }} axisLine={false} tickLine={false} width={40} tickFormatter={value => `${value}s`} />
                  <ReferenceLine y={target} stroke="#10b981" strokeWidth={2} strokeDasharray="6 5"
                    label={{ value: `Mục tiêu ${formatNumber(target)}s`, position: 'insideBottomLeft', fill: isDark ? '#34d399' : '#047857', fontSize: 12, fontWeight: 800 }} />
                  <Tooltip cursor={{ stroke: grid }} content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as typeof data[number] | undefined;
                    if (!active || !row) return null;
                    return <div className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900"><p className="font-black">{row.name}</p><p>{row.date} · {speedText(row.speed)} s/câu</p><p>{row.accuracy === null ? 'Chưa chấm' : `${row.correct}/${row.total} đúng`}</p></div>;
                  }} />
                  <Line dataKey="speed" stroke={line} strokeWidth={3} isAnimationActive={false}
                    dot={props => {
                      const { cx, cy, index, payload } = props as { cx?: number; cy?: number; index?: number; payload?: { id: string } };
                      if (cx === undefined || cy === undefined) return <g key={index} />;
                      const strong = payload?.id === selectedId || (!selectedId && index === data.length - 1);
                      return <circle key={payload?.id ?? index} cx={cx} cy={cy} r={strong ? 7 : 4.5} fill={strong ? line : isDark ? '#111a2c' : '#fff'} stroke={line} strokeWidth={2.5} />;
                    }}
                    label={props => {
                      const { x, y, index } = props as { x?: number; y?: number; index?: number };
                      const row = index === undefined ? undefined : data[index];
                      if (!row || x === undefined || y === undefined || !(row.id === selectedId || (!selectedId && index === data.length - 1))) return <g key={index} />;
                      return <text key={`l-${index}`} x={x} y={y - 13} textAnchor="middle" fill={ink} fontSize={13} fontWeight={800}>{speedText(row.speed)}</text>;
                    }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </> : (
            <div className="py-8 text-center">
              <p className="font-extrabold">Chưa có lượt {familyInfo?.label} nào để vẽ biểu đồ.</p>
              <button type="button" className={`${pacingPrimary} mt-3`} onClick={() => onPractice((family === 'PART_7' ? 'PART_7' : family) as PacingMode)}>
                <Play className="h-4 w-4" aria-hidden="true" />Luyện {familyInfo?.label}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-slate-900 dark:border-slate-300">
        {rows.length ? <>
          <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_80px_40px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-extrabold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <span>Lượt</span><span className="text-right">Thời gian</span><span className="text-right">Tốc độ</span><span className="text-right">Đúng</span><span />
          </div>
          <ul aria-label="Các lượt luyện tập">
            {rows.map(run => {
              const seconds = runSeconds(run), speed = runSpeed(run), accuracy = runAccuracy(run);
              const info = familyOf(run);
              const isPomodoro = run.partType === 'POMODORO', isBreak = isPomodoro && run.presetId.includes('BREAK');
              const short = isTooShortRun(run);
              const title = run.testName?.trim() || runLabel(run);
              const tag = isPomodoro ? isBreak ? 'Nghỉ' : 'Tập trung' : runLabel(run);
              const fast = speed !== null && !short && info && info.id !== 'POMODORO' && speed <= targetOf(info.id as 'PART_5');
              const canEdit = !isPomodoro && Boolean(run.totalQuestions);
              const inChart = charted && windowRuns.some(item => item.id === run.id);
              return (
                <li key={run.id} data-run-id={run.id} aria-current={selectedId === run.id || undefined}
                  className={`relative grid grid-cols-[minmax(0,1fr)_90px_110px_80px_40px] items-center gap-3 border-t border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 ${selectedId === run.id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''} ${short ? 'opacity-60' : ''} ${inChart ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                  onClick={() => inChart && setSelectedId(current => current === run.id ? null : run.id)}>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className={`whitespace-nowrap rounded-md border-[1.5px] border-slate-900 px-1.5 text-[11px] font-extrabold text-slate-900 ${info?.tag ?? 'bg-slate-200'} ${isBreak ? '!bg-emerald-200' : ''}`}>{tag}</span>
                      <time dateTime={run.date}>{run.date.split('-').reverse().join('/')}</time>
                      {short && <span className="font-bold text-amber-700 dark:text-amber-400">· Quá ngắn, không tính</span>}
                    </p>
                  </div>
                  <span className="text-right font-extrabold tabular-nums">{seconds === null ? '—' : seconds < 60 ? `${formatNumber(Math.max(1, Math.round(seconds)))} s` : formatClock(seconds)}</span>
                  <span className={`text-right font-extrabold tabular-nums ${speed === null || short ? 'text-slate-500' : fast ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{speed === null ? '—' : `${speedText(speed)} s/câu`}</span>
                  <span className="text-right font-extrabold tabular-nums">{isPomodoro ? run.finishedNaturally ? 'Xong' : 'Dừng sớm' : accuracy === null ? <span className="font-semibold text-slate-500">Chưa chấm</span> : `${run.correctAnswers}/${run.totalQuestions}`}</span>
                  <div className="relative justify-self-end" onClick={event => event.stopPropagation()}>
                    <button type="button" aria-label={`Tùy chọn ${title}`} aria-haspopup="menu" aria-expanded={menuId === run.id} onClick={() => setMenuId(current => current === run.id ? null : run.id)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {menuId === run.id && (
                      <div role="menu" aria-label={`Tùy chọn ${title}`} onKeyDown={event => { if (event.key === 'Escape') setMenuId(null); }}
                        className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border-2 border-slate-900 bg-white py-1 text-sm font-bold shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900 dark:shadow-none">
                        {canEdit && <button type="button" role="menuitem" onClick={() => { setMenuId(null); onEdit(run); }} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Sửa kết quả</button>}
                        <button type="button" role="menuitem" onClick={() => { setMenuId(null); onDelete(run); }} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-rose-700 hover:bg-slate-100 dark:text-rose-400 dark:hover:bg-slate-800"><Trash2 className="h-4 w-4" aria-hidden="true" />Xóa lượt</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span role="status">{pages > 1 ? `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, listed.length)} / ${listed.length} lượt` : `${listed.length} lượt`}</span>
            {pages > 1 && <div className="flex items-center gap-2">
              <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className="min-h-9 cursor-pointer px-2 font-bold disabled:opacity-40">Trước</button>
              <span>{current}/{pages}</span>
              <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className="min-h-9 cursor-pointer px-2 font-bold disabled:opacity-40">Sau</button>
            </div>}
          </div>
        </> : (
          <div className="px-4 py-10 text-center">
            <p className="font-extrabold">{live.length ? 'Không có lượt khớp bộ lọc.' : 'Chưa có lượt luyện nào.'}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{live.length ? 'Thử chọn chế độ khác hoặc xóa từ khóa.' : 'Bấm giờ một bài để ghi thời gian và kết quả.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
