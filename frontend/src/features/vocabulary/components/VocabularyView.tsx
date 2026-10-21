import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Customized, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { VocabLog } from '@/shared/data/dataBundle';
import type { NavTabId } from '@/shared/types';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { getTodayDateString, loadVocabLog } from '@/shared/data/storage';
import { useChartMotion } from '@/shared/hooks/useChartMotion';
import { uniqueTestNames } from '@/shared/domain/testNames';
import { formatVocabDate, groupVocabDays, summarizeVocabDays, validVocabDate, vocabDayIndex, vocabDaySignature, vocabPreset, vocabYAxis, type VocabDay, type VocabDetails, type VocabRange } from '../lib/vocabularyModel';
import { calendarDayIndex } from '@/shared/domain/dateRange';
import { VocabChartLabels } from './VocabChartLabels';
import { DateRangePicker } from '@/shared/components/DateRangePicker';
import { VocabEditModal } from './VocabEditModal';
import { PhoneVocabulary } from './PhoneVocabulary';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import './vocabulary.css';

interface Props {
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  sourceNames?: string[];
  dueMistakesCount?: number;
  totalMistakesCount?: number;
  onNavigateTab?: (tab: NavTabId) => void;
  onSaveVocab: (date: string, count: number, details?: VocabDetails) => void;
  onDeleteVocab?: (id: string) => void;
}

export function VocabularyView({ vocabLog, theme, sourceNames = [], dueMistakesCount, totalMistakesCount, onNavigateTab, onSaveVocab, onDeleteVocab }: Props) {
  const today = getTodayDateString();
  const isDark = theme === 'dark';
  const isPhone = useMediaQuery(PHONE_QUERY);
  const owner = useRef(getActiveAccountId());
  const days = useMemo(() => groupVocabDays(vocabLog), [vocabLog]);
  const total = days.length ? days[days.length - 1].cumulative : 0;
  const latestRecordedDay = days.length ? days[days.length - 1] : null;
  const sevenDaysAgo = new Date((calendarDayIndex(today) - 6) * 86400000).toISOString().slice(0, 10);
  const weekTotal = useMemo(() => {
    return days
      .filter(day => day.date >= sevenDaysAgo && day.date <= today)
      .reduce((sum, day) => sum + day.count, 0);
  }, [days, sevenDaysAgo, today]);
  const [range, setRange] = useState<VocabRange>(() => vocabPreset(today, 14));
  const selected = useMemo(() => days.filter(day => day.date >= range.from && day.date <= range.to), [days, range]);
  const summary = useMemo(() => summarizeVocabDays(selected), [selected]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(() => {
    try { return localStorage.getItem('toeic_vocab_history_open_v1') === 'true'; } catch { return false; }
  });
  const pageCount = Math.max(1, Math.ceil(selected.length / 5));
  const page = Math.min(historyPage, pageCount);
  const visible = [...selected].reverse().slice((page - 1) * 5, page * 5);
  useEffect(() => { setHistoryPage(current => Math.min(current, pageCount)); }, [pageCount]);

  const jumpToDate = (targetDate: string) => {
    const targetIdx = calendarDayIndex(targetDate);
    const todayIdx = calendarDayIndex(today);
    if (todayIdx - targetIdx + 1 <= 30) {
      setRange({ from: targetDate, to: today, preset: null });
    } else {
      const toDate = new Date((targetIdx + 13) * 86400000).toISOString().slice(0, 10);
      setRange({ from: targetDate, to: toDate > today ? today : toDate, preset: null });
    }
    setHistoryPage(1);
  };

  const [quickDate, setQuickDate] = useState(today);
  const [quickCount, setQuickCount] = useState(() => String(days.find(day => day.date === today)?.count ?? 20));
  const baseline = useRef(vocabDaySignature(vocabLog, today));
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<{ day: VocabDay; signature: string } | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);
  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [saved]);
  const existing = days.find(day => day.date === quickDate);
  const suggestions = useMemo(() => uniqueTestNames([...sourceNames, ...days.flatMap(day => day.sourceNames)]), [sourceNames, days]);

  const saveDay = (date: string, count: number, signature: string, details?: VocabDetails): string | null => {
    try {
      if (!validVocabDate(date) || date > today || !Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Nhập ngày hợp lệ và số từ nguyên từ 1 đến 10000.');
      if (owner.current !== getActiveAccountId()) throw new Error('Tài khoản đã thay đổi. Hãy mở lại trang.');
      if (signature !== vocabDaySignature(loadVocabLog(), date)) throw new Error('Ngày này vừa được sửa ở nơi khác. Chọn lại ngày trước khi cập nhật.');
      onSaveVocab(date, count, details);
      if (quickDate === date) { baseline.current = vocabDaySignature(loadVocabLog(), date); setQuickCount(String(count)); }
      setError(''); setSaved(quickDate === date);
      setFeedback(`Đã lưu ${count.toLocaleString('vi-VN')} từ cho ngày ${formatVocabDate(date)}.${date < range.from || date > range.to ? ' Ngày này nằm ngoài khoảng đang chọn.' : ''}`);
      return null;
    } catch (reason) { return reason instanceof Error ? reason.message : 'Chưa lưu được ghi nhận.'; }
  };
  const quickSave = (event: React.FormEvent) => { event.preventDefault(); const message = saveDay(quickDate, Number(quickCount), baseline.current); if (message) setError(message); };
  const chooseDate = (date: string) => { setQuickDate(date); setQuickCount(String(days.find(day => day.date === date)?.count ?? 20)); baseline.current = vocabDaySignature(vocabLog, date); setError(''); setSaved(false); };
  const removeDay = (day: VocabDay) => {
    if (!onDeleteVocab || !window.confirm(`Xóa ghi nhận ${day.count} từ ngày ${formatVocabDate(day.date)}?`)) return;
    try {
      if (owner.current !== getActiveAccountId()) throw new Error('Tài khoản đã thay đổi. Hãy mở lại trang.');
      if (vocabDaySignature(vocabLog, day.date) !== vocabDaySignature(loadVocabLog(), day.date)) throw new Error('Ngày này vừa được sửa ở nơi khác. Tải lại trang trước khi xóa.');
      onDeleteVocab(day.id);
      if (quickDate === day.date) { baseline.current = vocabDaySignature(loadVocabLog(), day.date); setQuickCount('20'); }
      setError(''); setFeedback(`Đã xóa ghi nhận ngày ${formatVocabDate(day.date)}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa xóa được ghi nhận.'); }
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(entries => setChartWidth(entries[0].contentRect.width));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const barMotion = useChartMotion(500);
  const plotted = useMemo(() => selected.map(day => ({ ...day, dayIndex: vocabDayIndex(day.date) })), [selected]);
  const firstDay = vocabDayIndex(range.from), lastDay = vocabDayIndex(range.to);
  const span = lastDay - firstDay + 1;
  const tickCount = Math.min(span, chartWidth < 500 ? 3 : 6);
  const dateTicks = [...new Set(Array.from({ length: tickCount }, (_, index) => firstDay + Math.round(index * (span - 1) / Math.max(1, tickCount - 1))))];
  const yAxis = vocabYAxis(selected);

  const editModal = editing && <VocabEditModal day={editing.day} suggestions={suggestions} onClose={closeEdit} onSave={(count, details) => {
    const message = saveDay(editing.day.date, count, editing.signature, details);
    if (!message) closeEdit();
    return message;
  }} />;
  const startEdit = (day: VocabDay) => setEditing({ day, signature: vocabDaySignature(vocabLog, day.date) });

  if (isPhone) return <>
    <PhoneVocabulary today={today} days={days} total={total} date={quickDate} count={quickCount} existing={existing} saved={saved} error={error} feedback={feedback}
      dueMistakesCount={dueMistakesCount} totalMistakesCount={totalMistakesCount} onNavigateTab={onNavigateTab}
      onDate={chooseDate} onCount={value => { setQuickCount(value); setSaved(false); }} onSubmit={quickSave} onEdit={startEdit} onDelete={onDeleteVocab ? removeDay : undefined} />
    {editModal}
  </>;

  return <div className="vocabulary-view">
    <header className="vocab-page-header">
      <div className="flex flex-wrap items-center gap-2 min-w-0"><h1 className="text-base sm:text-lg font-black">Từ vựng</h1><span className="vocab-total">{total.toLocaleString('vi-VN')} từ tích lũy</span><span className="hidden sm:inline-flex text-xs font-semibold text-slate-500 dark:text-slate-400">· 7 ngày qua: {weekTotal.toLocaleString('vi-VN')} từ</span></div>
      <form onSubmit={quickSave} className="vocab-quick-form"><input type="date" aria-label="Ngày học từ vựng" required min="0001-01-01" max={today} value={quickDate} onChange={event => chooseDate(event.target.value)} className="vocab-quick-date" /><div className="vocab-quick-quantity"><input type="number" aria-label="Số từ đã học" aria-describedby={existing ? 'vocab-update-help' : undefined} required min={1} max={10000} step={1} placeholder="VD: 20" value={quickCount} onChange={event => { setQuickCount(event.target.value); setSaved(false); }} className="vocab-quick-count" /><span className="text-xs font-bold">từ</span></div><button type="submit" className={`vocab-button is-save ${saved ? 'is-saved' : ''}`}><CheckCircle2 size={16} aria-hidden="true" />{saved ? 'Đã lưu!' : existing ? 'Cập nhật' : 'Lưu từ vựng'}</button>{existing && <p id="vocab-update-help" className="vocab-update-help">Cập nhật sẽ thay số cũ.</p>}</form>
    </header>
    {error && <p role="alert" className="vocab-error">{error}</p>}
    <section className="vocab-panel vocab-chart-panel" aria-label="Biểu đồ từ vựng">
      <div className="vocab-panel-header"><h2 className="text-sm sm:text-base font-black">Từ đã học theo ngày</h2><DateRangePicker value={range} today={today} onChange={value => { setRange(value); setHistoryPage(1); }} /></div>
      <div ref={chartRef} className="vocab-chart" role="img" aria-label={`${selected.length} ngày có ghi nhận trong khoảng ${formatVocabDate(range.from)} đến ${formatVocabDate(range.to)}.`}>
        {plotted.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={plotted} margin={{ top: 26, right: 16, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
          <XAxis dataKey="dayIndex" type="number" scale="linear" domain={[firstDay - 0.5, lastDay + 0.5]} ticks={dateTicks} tickFormatter={day => formatVocabDate(new Date(Number(day) * 86400000).toISOString().slice(0, 10)).slice(0, 5)} tick={{ fontSize: 12, fill: isDark ? '#cbd5e1' : '#475569' }} tickLine={false} axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }} allowDataOverflow />
          <YAxis domain={[0, yAxis.ceiling]} ticks={yAxis.ticks} tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip shared={false} cursor={false} content={({ active, payload }) => {
            const day = payload?.[0]?.payload as VocabDay | undefined;
            if (!active || !day) return null;
            return <div className="vocab-tooltip"><p className="font-bold">{formatVocabDate(day.date)}</p><p className="mt-1 font-black text-purple-700 dark:text-purple-300">{day.count.toLocaleString('vi-VN')} từ</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tổng tích lũy tới ngày này: {day.cumulative.toLocaleString('vi-VN')} từ</p></div>;
          }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={Math.max(0.5, Math.min(48, (chartWidth - 56) / span * 0.68))} isAnimationActive={barMotion.enabled} animationBegin={0} animationDuration={barMotion.duration} animationEasing="ease-out" onAnimationEnd={barMotion.finish}>
            {plotted.map(day => <Cell key={day.date} fill={day.date === today ? (isDark ? '#34d399' : '#059669') : (isDark ? '#a5a3ff' : '#6366f1')} stroke={isDark ? '#64748b' : '#0f172a'} strokeWidth={1.5} />)}
          </Bar><Customized component={<VocabChartLabels isDark={isDark} />} />
        </BarChart></ResponsiveContainer> : (
          <div className="vocab-empty flex flex-col items-center justify-center h-full py-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-violet-900/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-950/40 dark:text-violet-300 mb-2">
              <Calendar size={20} aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Chưa có ghi nhận trong khoảng này.
            </p>
            {latestRecordedDay ? (
              <>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Lần học gần nhất của bạn là <strong className="text-slate-800 dark:text-slate-200">{formatVocabDate(latestRecordedDay.date)} ({latestRecordedDay.count} từ)</strong>
                </p>
                <button
                  type="button"
                  onClick={() => jumpToDate(latestRecordedDay.date)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-xs font-black text-violet-700 shadow-[2px_2px_0_0_#0f172a] hover:bg-violet-50 active:translate-x-0.5 active:translate-y-0.5 dark:border-slate-300 dark:bg-slate-800 dark:text-violet-300 dark:shadow-[2px_2px_0_0_#cbd5e1]"
                >
                  <span>Xem khoảng ngày có dữ liệu ({formatVocabDate(latestRecordedDay.date).slice(0, 5)})</span>
                  <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Nhập số từ đã học ở phía trên để bắt đầu theo dõi tiến độ
              </p>
            )}
          </div>
        )}
      </div>
      <div className="vocab-stats-strip"><span className="text-xs text-slate-500 dark:text-slate-400">{formatVocabDate(range.from)} – {formatVocabDate(range.to)} · {selected.length} ngày có ghi nhận</span><div className="vocab-summary-values"><span>Kỷ lục: <strong>{summary.record ? `${summary.record.count.toLocaleString('vi-VN')} từ (${formatVocabDate(summary.record.date).slice(0, 5)})` : '—'}</strong></span><span><span>TB mỗi ngày ghi nhận</span>: <strong>{summary.average === null ? '—' : `${summary.average.toLocaleString('vi-VN')} từ/ngày`}</strong></span></div></div>
    </section>
    <details className="vocab-panel vocab-history-panel" open={historyOpen} onToggle={event => {
      const open = event.currentTarget.open;
      setHistoryOpen(open);
      try { localStorage.setItem('toeic_vocab_history_open_v1', String(open)); } catch { /* preference remains usable without storage */ }
    }}>
      <summary className="vocab-history-summary" aria-controls="vocab-history-content"><h2 className="text-sm sm:text-base font-black">Lịch sử ghi nhận</h2><span className="vocab-total">{selected.length} ngày</span><ChevronDown size={18} aria-hidden="true" /></summary>
      {historyOpen && <section id="vocab-history-content" className="vocab-history-content" aria-label="Lịch sử từ vựng">
      <table className="vocab-history-table"><caption className="sr-only">Lịch sử ghi nhận theo khoảng ngày đã chọn</caption><colgroup><col style={{ width: '16%' }} /><col style={{ width: '36%' }} /><col style={{ width: '16%' }} /><col style={{ width: '12%' }} /><col style={{ width: '20%' }} /></colgroup><thead><tr><th scope="col">Ngày</th><th scope="col">Nguồn học</th><th scope="col">Part</th><th scope="col">Số từ</th><th scope="col">Thao tác</th></tr></thead><tbody>
        {visible.length ? visible.map(day => <tr key={day.date} data-vocab-day={day.date}><td>{formatVocabDate(day.date)}</td><td>{day.sourceNames.length ? day.sourceNames.join(' · ') : <span className="text-slate-500 dark:text-slate-400">Chưa ghi nguồn</span>}</td><td><div className="vocab-parts">{day.parts.length ? day.parts.map(part => <span className="vocab-part" data-part={part} key={part}>P{part}</span>) : <span className="text-slate-500 dark:text-slate-400">—</span>}</div></td><td className="vocab-quantity">{day.count.toLocaleString('vi-VN')} từ</td><td><div className="vocab-row-actions"><button type="button" aria-label={`Sửa ghi nhận ngày ${formatVocabDate(day.date)}`} onClick={() => startEdit(day)} className="vocab-action"><Pencil size={14} aria-hidden="true" /><span>Sửa</span></button>{onDeleteVocab && <button type="button" aria-label={`Xóa ghi nhận ngày ${formatVocabDate(day.date)}`} onClick={() => removeDay(day)} className="vocab-action is-delete"><Trash2 size={14} aria-hidden="true" /><span>Xóa</span></button>}</div></td></tr>) : <tr><td colSpan={5} className="vocab-empty">Chưa có ghi nhận trong khoảng này.</td></tr>}
      </tbody></table>
      {pageCount > 1 && <nav aria-label="Trang lịch sử từ vựng" className="vocab-pagination"><button type="button" disabled={page === 1} onClick={() => setHistoryPage(page - 1)}><ChevronLeft size={16} aria-hidden="true" />Trước</button><span>Trang {page}/{pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setHistoryPage(page + 1)}>Sau<ChevronRight size={16} aria-hidden="true" /></button></nav>}
      </section>}
    </details>
    <p role="status" aria-live="polite" className="vocab-feedback">{feedback}</p>
    {editModal}
  </div>;
}
