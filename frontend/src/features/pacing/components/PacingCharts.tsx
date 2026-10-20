import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PacingRun } from '@/shared/types';
import { formatNumber, localDate, PRESETS, type PacingMode } from '@/features/pacing/lib/pacingModel';
import { pacingChartRuns, pacingSpeedAxis, runAccuracy, runSeconds, runSpeed, type PacingChartScope } from '@/features/pacing/lib/pacingStats';
import { pacingPrimary } from './PacingDialogs';

const speedText = (value: number) => value < .1 ? '<0,1' : formatNumber(value);

export function PacingCharts({ runs, initialMode, theme, onPractice }: { runs: PacingRun[]; initialMode: PacingMode; theme: 'light' | 'dark'; onPractice: (mode: PacingMode) => void }) {
  const [mode, setMode] = useState<PacingMode>(initialMode === 'POMODORO' ? 'PART_5' : initialMode);
  const [scope, setScope] = useState<PacingChartScope>('TODAY');
  const [metric, setMetric] = useState<'speed' | 'accuracy'>('speed');
  const today = localDate(Date.now());
  const [page, setPage] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(500);
  const ordinals = useMemo(() => new Map(pacingChartRuns(runs, mode, 'ALL').map((run, index) => [run.id, index + 1])), [runs, mode]);
  const selected = useMemo(() => pacingChartRuns(runs, mode, scope, today), [runs, mode, scope, today]);
  const lastPage = Math.max(0, Math.ceil(selected.length / 10) - 1);
  const currentPage = Math.min(page ?? lastPage, lastPage);
  const data = useMemo(() => selected.slice(currentPage * 10, currentPage * 10 + 10).map(run => ({ id: run.id, ordinal: ordinals.get(run.id)!, date: run.date.split('-').reverse().join('/'), recordedTime: Number.isFinite(Date.parse(run.createdAt)) ? new Date(run.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '', name: run.testName?.trim() || PRESETS[mode].name,
    speed: runSpeed(run)!, seconds: runSeconds(run)!, accuracy: runAccuracy(run), correct: run.correctAnswers, total: run.totalQuestions })), [selected, currentPage, ordinals, mode]);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setChartWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [data.length, mode, scope]);
  const graded = data.filter(row => row.accuracy !== null).length, target = PRESETS[mode].minutes * 60 / PRESETS[mode].questions;
  const { ceiling, ticks: speedTicks } = useMemo(() => pacingSpeedAxis(selected), [selected]);
  const lastGraded = data.reduce((last, row, index) => row.accuracy === null ? last : index, -1);
  const isDark = theme === 'dark', text = isDark ? '#cbd5e1' : '#475569', ink = isDark ? '#f1f5f9' : '#0f172a', grid = isDark ? '#3b4b62' : '#d3deeb';
  const axis = { tick: { fontSize: 13, fontWeight: 500, fill: text }, axisLine: false, tickLine: false };
  const tickCount = Math.max(2, Math.floor((chartWidth - 120) / 70));
  const edgePadding = Math.max(24, (chartWidth - 60) / (Math.max(1, data.length) * 2));
  const tickIds = data.filter((_, index) => data.length <= tickCount || index % Math.ceil((data.length - 1) / (tickCount - 1)) === 0 || index === data.length - 1).map(row => row.id);
  const dateTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
    const row = data.find(item => item.id === payload?.value);
    if (!row || x === undefined || y === undefined) return <g />;
    return <text x={x} y={y + 13} textAnchor="middle" fill={text} fontSize={13} fontWeight={600}><tspan x={x}>{row.date.slice(0, 5)}</tspan><tspan x={x} dy={17} fontSize={12} fontWeight={500}>Lượt {row.ordinal}</tspan></text>;
  };
  const pointLabel = (kind: 'speed' | 'accuracy') => (props: unknown) => {
    const { index, viewBox } = props as { index?: number; viewBox?: { x?: number; y?: number; width?: number } };
    if (index === undefined || !viewBox || typeof viewBox.x !== 'number' || typeof viewBox.y !== 'number') return null;
    if (!(kind === 'speed' && data.length <= 5) && index !== (kind === 'speed' ? data.length - 1 : lastGraded)) return null;
    const row = data[index], value = kind === 'speed' ? speedText(row.speed) : row.accuracy === null ? '' : `${formatNumber(row.accuracy)}%`;
    return <text className="pacing-point-label" data-kind={kind} x={viewBox.x + (viewBox.width ?? 0) / 2} y={viewBox.y - 10} textAnchor="middle" fill={ink} fontSize={14}>{value}</text>;
  };
  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: typeof data[number] }[] }) => {
    const row = payload?.[0]?.payload;
    if (!active || !row) return null;
    return <div className="pacing-chart-tooltip"><strong>{row.name}</strong><p>Lượt {row.ordinal} · {row.date}</p>{row.recordedTime && <p>Ghi nhận lúc {row.recordedTime}</p>}<p>Thời gian: {formatNumber(row.seconds)} s</p><p>{speedText(row.speed)} s/câu</p><p>{row.accuracy === null ? 'Chưa chấm' : `${row.correct}/${row.total} đúng · ${formatNumber(row.accuracy)}%`}</p></div>;
  };
  return <section className="pacing-panel pacing-stats-panel" aria-label="Thống kê tốc độ"><div className="pacing-view-tools"><h2 className="text-lg font-black">Tốc độ & độ chính xác</h2><div className="pacing-stats-filters"><label><span className="sr-only">Chế độ</span><select aria-label="Chế độ thống kê" value={mode} onChange={event => { setMode(event.target.value as PacingMode); setPage(null); }} className="pacing-input">{Object.entries(PRESETS).filter(([key]) => key !== 'POMODORO').map(([key, config]) => <option value={key} key={key}>{config.name}</option>)}</select></label><label><span className="sr-only">Phạm vi</span><select aria-label="Phạm vi thống kê" value={scope} onChange={event => { setScope(event.target.value as PacingChartScope); setPage(null); }} className="pacing-input"><option value="TODAY">Hôm nay</option><option value="YESTERDAY">Hôm qua</option><option value="LAST_3_DAYS">3 ngày gần nhất</option><option value="LAST_7_DAYS">7 ngày gần nhất</option></select></label></div></div>
    {data.length ? <>
      {selected.length > 10 && <div className="pacing-stats-navigation"><span role="status">Đang xem {currentPage * 10 + 1}–{Math.min((currentPage + 1) * 10, selected.length)} / {selected.length} lượt</span><nav aria-label="Trang biểu đồ"><button type="button" className="pacing-settings" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trước</button><button type="button" className="pacing-settings" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Sau</button></nav></div>}
      <div className="pacing-chart" data-metric={metric} ref={chartRef}>
        <div className="pacing-chart-heading">
          <div className="pacing-metric-filter" role="group" aria-label="Chỉ số biểu đồ">
            <button type="button" aria-pressed={metric === 'speed'} onClick={() => setMetric('speed')}>Thời gian mỗi câu</button>
            <button type="button" aria-pressed={metric === 'accuracy'} onClick={() => setMetric('accuracy')}>Độ chính xác</button>
          </div>
          {metric === 'speed' ? <span className="pacing-chart-target" title="Mục tiêu gợi ý, không phải giới hạn bắt buộc">{target <= ceiling && <span aria-hidden="true" />}Mục tiêu ≤{formatNumber(target)} s/câu</span> : <span className="pacing-chart-meta" title="Lượt chưa chấm để khuyết, không tính là 0%">{graded}/{data.length} lượt đã chấm</span>}
        </div>
        {metric === 'speed' ? <div role="img" aria-label={`Thời gian mỗi câu (giây/câu, thấp hơn là nhanh hơn): ${data.map(row => `Lượt ${row.ordinal}, ${row.name}: ${speedText(row.speed)} s/câu`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={260}><BarChart data={data} margin={{ top: 28, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" /><XAxis dataKey="id" axisLine={false} tickLine={false} tick={dateTick} ticks={tickIds} interval={0} height={48} scale="point" padding={{ left: edgePadding, right: edgePadding }} /><YAxis {...axis} width={44} domain={[0, ceiling]} ticks={speedTicks} tickFormatter={formatNumber} />
            <Tooltip content={tooltip} filterNull={false} cursor={{ fill: isDark ? '#1e293b' : '#f1f5f9' }} />{target <= ceiling && <ReferenceLine y={target} stroke={text} strokeDasharray="3 4" />}
            <Bar dataKey="speed" radius={[5, 5, 0, 0]} fill={isDark ? '#60a5fa' : '#2563eb'} maxBarSize={44} isAnimationActive={false}><LabelList dataKey="speed" content={pointLabel('speed')} /></Bar>
          </BarChart></ResponsiveContainer>
        </div> : <div role="img" aria-label={`Độ chính xác: ${graded ? data.filter(row => row.accuracy !== null).map(row => `Lượt ${row.ordinal}, ${row.name}: ${formatNumber(row.accuracy!)}%`).join(', ') : 'Chưa có lượt đã chấm'}`}>
          {graded ? <ResponsiveContainer width="100%" height={260}><LineChart data={data} margin={{ top: 28, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" /><XAxis dataKey="id" axisLine={false} tickLine={false} tick={dateTick} ticks={tickIds} interval={0} height={48} scale="point" padding={{ left: edgePadding, right: edgePadding }} /><YAxis {...axis} width={44} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" />
            <Tooltip content={tooltip} filterNull={false} cursor={{ stroke: grid }} /><Line dataKey="accuracy" type="linear" connectNulls={false} stroke={isDark ? '#2dd4bf' : '#0f766e'} strokeWidth={3} dot={{ r: 4, fill: isDark ? '#111a2c' : '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}><LabelList dataKey="accuracy" content={pointLabel('accuracy')} /></Line>
          </LineChart></ResponsiveContainer> : <div className="pacing-chart-empty">Chưa có lượt đã chấm.</div>}
        </div>}
      </div>
      {(metric === 'speed' ? selected.length === 1 : selected.filter(run => runAccuracy(run) !== null).length === 1) && <p role="status" className="pacing-stats-note">{metric === 'speed' ? 'Chưa đủ lượt để theo dõi xu hướng.' : 'Độ chính xác cần thêm lượt đã chấm để theo dõi xu hướng.'}</p>}
    </> : <div className="pacing-empty"><strong>{ordinals.size ? scope === 'TODAY' ? 'Chưa có lượt luyện hôm nay.' : scope === 'YESTERDAY' ? 'Chưa có lượt luyện hôm qua.' : 'Không có lượt luyện trong khoảng ngày đã chọn.' : `Chưa có kết quả cho ${PRESETS[mode].name}.`}</strong>{ordinals.size && scope !== 'LAST_7_DAYS' ? <button type="button" className="pacing-settings mt-4" onClick={() => { setScope('LAST_7_DAYS'); setPage(null); }}>Xem 7 ngày gần nhất</button> : <button type="button" className={`${pacingPrimary} mt-4`} onClick={() => onPractice(mode)}>Luyện {PRESETS[mode].name}</button>}</div>}
  </section>;
}
