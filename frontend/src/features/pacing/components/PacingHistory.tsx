import { useMemo, useState } from 'react';
import { History, Pencil, Play, Trash2 } from 'lucide-react';
import type { PacingRun } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';
import { formatClock, formatNumber, PRESETS } from '@/features/pacing/lib/pacingModel';
import { runAccuracy, runLabel, runSeconds, runSpeed } from '@/features/pacing/lib/pacingStats';
import { pacingPrimary } from './PacingDialogs';

function historyTime(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 1) return '<1 s';
  return seconds < 60 ? `${formatNumber(seconds)} s` : formatClock(seconds);
}
function historySpeed(speed: number | null) {
  return speed === null ? '—' : `${speed < .1 ? '<0,1' : formatNumber(speed)} s/câu`;
}

export function PacingHistory({ runs, onNew, onEdit, onDelete }: { runs: PacingRun[]; onNew: () => void; onEdit: (run: PacingRun) => void; onDelete: (run: PacingRun) => void }) {
  const [mode, setMode] = useState('ALL'), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const hasRuns = runs.some(run => !run.deletedAt);
  const selected = useMemo(() => runs.filter(run => !run.deletedAt && (mode === 'ALL' || run.partType === mode)
    && (!query.trim() || [run.testName ?? '', run.presetName, run.date].some(text => testNameKey(text).includes(testNameKey(query)))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)), [runs, mode, query]);
  const pages = Math.max(1, Math.ceil(selected.length / 5)), current = Math.min(page, pages), rows = selected.slice((current - 1) * 5, current * 5);
  return <section className="pacing-panel pacing-history-panel" aria-label="Lịch sử luyện tập"><div className="pacing-view-tools"><h2 className="flex items-center gap-2 text-lg font-black"><History className="h-5 w-5" aria-hidden="true" />Lịch sử luyện tập</h2><button type="button" className={pacingPrimary} onClick={onNew}><Play className="h-4 w-4" aria-hidden="true" />Luyện mới</button></div>
    {hasRuns && <div className="pacing-history-tools"><input type="search" aria-label="Tìm đề trong lịch sử" placeholder="Tìm tên đề, lượt luyện…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="pacing-input" /><select aria-label="Lọc chế độ lịch sử" value={mode} onChange={event => { setMode(event.target.value); setPage(1); }} className="pacing-input"><option value="ALL">Mọi chế độ</option>{Object.entries(PRESETS).map(([key, config]) => <option key={key} value={key}>{config.name}</option>)}</select></div>}
    {rows.length ? <><table className="pacing-history-table" aria-label="Các lượt luyện tập"><colgroup><col /><col className="pacing-history-time-col" /><col className="pacing-history-speed-col" /><col className="pacing-history-result-col" /><col className="pacing-history-actions-col" /></colgroup><thead><tr><th scope="col">Lượt luyện</th><th scope="col">Thời gian</th><th scope="col">Tốc độ</th><th scope="col">Kết quả</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map(run => {
      const seconds = runSeconds(run), accuracy = runAccuracy(run), speed = runSpeed(run);
      const label = runLabel(run), title = run.testName?.trim() || label;
      const isPomodoro = run.partType === 'POMODORO', isBreak = isPomodoro && run.presetId.includes('BREAK');
      const kind = isPomodoro ? isBreak ? 'break' : 'focus' : 'reading';
      const badge = isPomodoro ? isBreak ? 'Nghỉ' : 'Tập trung' : testNameKey(title) === testNameKey(label) ? 'Reading' : label;
      const result = isPomodoro ? run.finishedNaturally === true ? 'Hoàn thành' : run.finishedNaturally === false ? 'Kết thúc sớm' : '—' : accuracy === null ? 'Chưa chấm' : `${run.correctAnswers}/${run.totalQuestions}`;
      return <tr key={run.id}><td><p className="pacing-history-name">{title}</p><div className="pacing-history-meta"><span className="pacing-history-badge" data-kind={kind}>{badge}</span><time dateTime={run.date}>{run.date.split('-').reverse().join('/')}</time></div></td><td><span className="pacing-history-mobile-label" aria-hidden="true">Thời gian</span><span className="pacing-history-value">{historyTime(seconds)}</span></td><td><span className="pacing-history-mobile-label" aria-hidden="true">Tốc độ</span><span className="pacing-history-value">{historySpeed(speed)}</span></td><td><span className="pacing-history-mobile-label" aria-hidden="true">Kết quả</span><span className={isPomodoro || accuracy === null ? 'pacing-history-state' : 'pacing-history-value'}>{result}</span></td><td><div className="pacing-history-row-actions">{!isPomodoro && !!run.totalQuestions && <button type="button" onClick={() => onEdit(run)} aria-label={`Sửa kết quả ${title}`} className="pacing-icon"><Pencil className="h-4 w-4" aria-hidden="true" /></button>}<button type="button" onClick={() => onDelete(run)} aria-label={`Xóa lượt ${title}`} className="pacing-icon hover:!text-rose-600 dark:hover:!text-rose-400"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div></td></tr>;
    })}</tbody></table><div className="pacing-history-footer"><span role="status">{pages > 1 ? `${(current - 1) * 5 + 1}–${Math.min(current * 5, selected.length)} / ${selected.length} lượt` : `${selected.length} lượt`}</span>{pages > 1 && <div className="flex items-center gap-2"><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className="min-h-10 cursor-pointer px-2 font-semibold disabled:opacity-40">Trước</button><span>{current}/{pages}</span><button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className="min-h-10 cursor-pointer px-2 font-semibold disabled:opacity-40">Sau</button></div>}</div></> : <div className="pacing-empty"><strong>{hasRuns ? 'Không có lượt khớp bộ lọc.' : 'Chưa có lượt luyện nào.'}</strong><p>{hasRuns ? 'Thử chọn chế độ khác hoặc xóa từ khóa.' : 'Bắt đầu một bài để ghi thời gian và kết quả.'}</p></div>}
  </section>;
}
