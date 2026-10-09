import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PacingRun } from '@/shared/types';
import { formatNumber, PRESETS, type PacingMode } from '@/features/pacing/lib/pacingModel';
import { pacingChartRuns, runAccuracy, runSpeed } from '@/features/pacing/lib/pacingStats';
import { pacingPrimary } from './PacingDialogs';

const speedText = (value: number) => value < .1 ? '<0,1' : formatNumber(value);

export function PacingCharts({ runs, initialMode, theme, onPractice }: { runs: PacingRun[]; initialMode: PacingMode; theme: 'light' | 'dark'; onPractice: (mode: PacingMode) => void }) {
  const [mode, setMode] = useState<PacingMode>(initialMode === 'POMODORO' ? 'PART_5' : initialMode);
  const [scope, setScope] = useState<'RECENT_5' | 'ALL' | 'FIRST_ONLY' | 'BEST_ONLY'>('RECENT_5');
  const ordinals = useMemo(() => new Map(pacingChartRuns(runs, mode, 'ALL').map((run, index) => [run.id, index + 1])), [runs, mode]);
  const selected = useMemo(() => pacingChartRuns(runs, mode, scope), [runs, mode, scope]);
  const data = useMemo(() => selected.map(run => ({ id: run.id, ordinal: ordinals.get(run.id)!, date: run.date.split('-').reverse().join('/'), name: run.testName?.trim() || PRESETS[mode].name,
    speed: runSpeed(run)!, accuracy: runAccuracy(run), correct: run.correctAnswers, total: run.totalQuestions })), [selected, ordinals, mode]);
  const graded = data.filter(row => row.accuracy !== null).length, target = PRESETS[mode].minutes * 60 / PRESETS[mode].questions;
  const maximum = data.reduce((max, row) => Math.max(max, row.speed), target);
  const step = Math.max(5, Math.ceil(maximum / 20) * 5), ceiling = Math.ceil(maximum / step) * step;
  const speedTicks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step);
  const lastGraded = data.reduce((last, row, index) => row.accuracy === null ? last : index, -1);
  const isDark = theme === 'dark', text = isDark ? '#cbd5e1' : '#64748b', ink = isDark ? '#f1f5f9' : '#0f172a', grid = isDark ? '#334155' : '#e2e8f0';
  const axis = { tick: { fontSize: 12, fill: text }, axisLine: false, tickLine: false };
  const tickLabel = (id: string) => `Lượt ${ordinals.get(id) ?? ''}`;
  const pointLabel = (kind: 'speed' | 'accuracy') => (props: unknown) => {
    const { index, viewBox } = props as { index?: number; viewBox?: { x?: number; y?: number; width?: number } };
    if (index === undefined || !viewBox || typeof viewBox.x !== 'number' || typeof viewBox.y !== 'number') return null;
    if (!(kind === 'speed' && data.length <= 5) && index !== (kind === 'speed' ? data.length - 1 : lastGraded)) return null;
    const row = data[index], value = kind === 'speed' ? speedText(row.speed) : row.accuracy === null ? '' : `${formatNumber(row.accuracy)}%`;
    return <text className="pacing-point-label" data-kind={kind} x={viewBox.x + (viewBox.width ?? 0) / 2} y={viewBox.y - 10} textAnchor={kind === 'accuracy' && data.length > 1 ? 'end' : 'middle'} fill={ink} fontSize={12}>{value}</text>;
  };
  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: typeof data[number] }[] }) => {
    const row = payload?.[0]?.payload;
    if (!active || !row) return null;
    return <div className="pacing-chart-tooltip"><strong>{row.name}</strong><p>Lượt {row.ordinal} · {row.date}</p><p>{speedText(row.speed)} s/câu</p><p>{row.accuracy === null ? 'Chưa chấm' : `${row.correct}/${row.total} đúng · ${formatNumber(row.accuracy)}%`}</p></div>;
  };
  return <section className="pacing-panel pacing-stats-panel" aria-label="Thống kê tốc độ"><div className="pacing-view-tools"><h2 className="text-lg font-black">Tốc độ & độ chính xác</h2><div className="pacing-stats-filters"><select aria-label="Part thống kê" value={mode} onChange={event => setMode(event.target.value as PacingMode)} className="pacing-input">{Object.entries(PRESETS).filter(([key]) => key !== 'POMODORO').map(([key, config]) => <option value={key} key={key}>{config.name}</option>)}</select><select aria-label="Phạm vi thống kê" value={scope} onChange={event => setScope(event.target.value as typeof scope)} className="pacing-input"><option value="RECENT_5">5 lượt gần nhất</option><option value="ALL">Tất cả lượt</option><option value="FIRST_ONLY">Lần đầu theo đề</option><option value="BEST_ONLY">Tốt nhất theo đề</option></select></div></div>
    {data.length ? <>
      <div className="pacing-charts">
        <div className="pacing-chart" role="img" aria-label={`Thời gian mỗi câu: ${data.map(row => `Lượt ${row.ordinal}, ${row.name}: ${speedText(row.speed)} s/câu`).join(', ')}`}>
          <h3>Thời gian mỗi câu</h3><p className="pacing-chart-target"><span aria-hidden="true" />Mục tiêu gợi ý ≤{formatNumber(target)} s/câu</p>
          <ResponsiveContainer width="100%" height={240}><BarChart data={data} margin={{ top: 28, right: 24, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={grid} /><XAxis dataKey="id" {...axis} tickFormatter={tickLabel} minTickGap={20} padding={{ left: 12, right: 12 }} /><YAxis {...axis} width={42} unit="s" domain={[0, ceiling]} ticks={speedTicks} />
            <Tooltip content={tooltip} filterNull={false} cursor={{ fill: isDark ? '#1e293b' : '#f1f5f9' }} /><ReferenceLine y={target} stroke={text} strokeDasharray="3 4" />
            <Bar dataKey="speed" radius={[5, 5, 0, 0]} fill={isDark ? '#60a5fa' : '#2563eb'} maxBarSize={30} isAnimationActive={false}><LabelList dataKey="speed" content={pointLabel('speed')} /></Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <div className="pacing-chart" role="img" aria-label={`Độ chính xác: ${graded ? data.filter(row => row.accuracy !== null).map(row => `Lượt ${row.ordinal}, ${row.name}: ${formatNumber(row.accuracy!)}%`).join(', ') : 'Chưa có lượt đã chấm'}`}>
          <h3>Độ chính xác</h3><p>{graded}/{data.length} lượt đã chấm</p>
          {graded ? <ResponsiveContainer width="100%" height={240}><LineChart data={data} margin={{ top: 28, right: 24, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={grid} /><XAxis dataKey="id" {...axis} tickFormatter={tickLabel} minTickGap={20} padding={{ left: 24, right: 24 }} /><YAxis {...axis} width={42} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" />
            <Tooltip content={tooltip} filterNull={false} cursor={{ stroke: grid }} /><Line dataKey="accuracy" type="linear" connectNulls={false} stroke={isDark ? '#2dd4bf' : '#0d9488'} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false}><LabelList dataKey="accuracy" content={pointLabel('accuracy')} /></Line>
          </LineChart></ResponsiveContainer> : <div className="pacing-chart-empty">Chưa có lượt đã chấm.</div>}
        </div>
      </div>
      {(data.length === 1 || graded === 1) && <p role="status" className="pacing-stats-note">{data.length === 1 ? 'Chưa đủ lượt để theo dõi xu hướng.' : 'Độ chính xác cần thêm lượt đã chấm để theo dõi xu hướng.'}</p>}
    </> : <div className="pacing-empty"><strong>Chưa có kết quả cho {PRESETS[mode].name}.</strong><button type="button" className={`${pacingPrimary} mt-4`} onClick={() => onPractice(mode)}>Luyện {PRESETS[mode].name}</button></div>}
  </section>;
}
