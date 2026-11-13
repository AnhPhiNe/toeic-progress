import { useState } from 'react';
import type { PracticePartResult } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { TestNamePicker } from '@/shared/components/TestNamePicker';

type Part = PracticePartResult['part'];
const PARTS: Part[] = [1, 2, 3, 4, 5, 6, 7];
const INK = 'border-2 border-slate-900 dark:border-slate-300';
const FIELD = `${INK} bg-white text-slate-900 dark:bg-slate-950 dark:text-white focus:outline-none focus:ring-[3px] focus:ring-blue-300 dark:focus:ring-blue-700`;
const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

interface Props {
  rows: PracticePartResult[];
  setRows: React.Dispatch<React.SetStateAction<PracticePartResult[]>>;
  testName: string; setTestName: (v: string) => void; suggestions: string[];
  date: string; setDate: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  notes: string; setNotes: (v: string) => void;
  today: string;
  /** Open "Thêm chi tiết" at first render (editing a session or a restored draft that has a name or notes). */
  initialDetailOpen?: boolean;
}

export const DesktopPracticeBody = ({ rows, setRows, testName, setTestName, suggestions, date, setDate, duration, setDuration, notes, setNotes, today, initialDetailOpen = false }: Props) => {
  const [detailOpen, setDetailOpen] = useState(initialDetailOpen);
  const used = new Set(rows.map(r => r.part));

  const removePart = (part: Part) => setRows(prev => prev.length <= 1 ? prev : prev.filter(row => row.part !== part));
  const addPart = (part: Part) => {
    if (used.has(part)) { removePart(part); return; }
    setRows(prev => [...prev, { part, correct: 0, total: PART_MAX_QUESTIONS[`part${part}` as keyof typeof PART_MAX_QUESTIONS] }]);
  };
  const patch = (index: number, change: (row: PracticePartResult) => Partial<PracticePartResult>) =>
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...change(row) };
      next.total = Math.max(1, Math.round(next.total) || 1);
      next.correct = Math.min(next.total, Math.max(0, Math.round(next.correct) || 0));
      return next;
    }));

  const ring = (row: PracticePartResult, index: number, big: boolean) => {
    const size = big ? 200 : 150, stroke = big ? 18 : 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const share = row.total > 0 ? row.correct / row.total : 0;
    return (
      <div key={row.part} className={'rdp-card' + (big ? ' is-big' : '')}>
        {!big && <div className="rdp-cardh"><b>Part {row.part}</b>
          {rows.length > 1 && <button type="button" className="rdp-x" aria-label={`Bỏ Part ${row.part}`} title={`Bỏ Part ${row.part}`} onClick={() => removePart(row.part)}>×</button>}</div>}
        <div className="rdp-dial">
          <button type="button" className="rdp-pm" aria-label={`Giảm số câu đúng Part ${row.part}`} onClick={() => patch(index, r0 => ({ correct: r0.correct - 1 }))}>−</button>
          <div className="rdp-ring" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1ecff" strokeWidth={stroke} />
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={share >= 0.5 ? '#a78bfa' : '#b9a5fc'} strokeWidth={stroke} strokeLinecap="round" opacity={share > 0 ? 1 : 0}
                strokeDasharray={`${Math.max(0.001, share) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .3s' }} />
            </svg>
            <div className="rdp-c">
              <input type="number" min={0} max={row.total} step={1} inputMode="numeric" aria-label={`Số câu đúng Part ${row.part}`}
                value={row.correct} onChange={e => patch(index, () => ({ correct: Number(e.target.value) }))} onFocus={e => e.target.select()}
                className={NO_SPIN} />
              <small>câu đúng</small>
            </div>
          </div>
          <button type="button" className="rdp-pm" aria-label={`Tăng số câu đúng Part ${row.part}`} onClick={() => patch(index, r0 => ({ correct: r0.correct + 1 }))}>+</button>
        </div>
        <div className="rdp-tot">trên
          <button type="button" aria-label={`Giảm tổng số câu Part ${row.part}`} onClick={() => patch(index, r0 => ({ total: r0.total - 1 }))}>−</button>
          <input type="number" min={1} step={1} inputMode="numeric" aria-label={`Tổng số câu Part ${row.part}`} value={row.total}
            onChange={e => patch(index, () => ({ total: Number(e.target.value) }))} onFocus={e => e.target.select()} className={NO_SPIN} />
          <button type="button" aria-label={`Tăng tổng số câu Part ${row.part}`} onClick={() => patch(index, r0 => ({ total: r0.total + 1 }))}>+</button>
          câu
        </div>
      </div>
    );
  };

  return (
    <div className="rdp space-y-4">
      <div>
        <div className="rdp-lbl">Bạn vừa luyện Part nào?</div>
        <div role="group" aria-label="Part đã luyện" className="rdp-tiles">
          {PARTS.map(p => {
            const isUsed = used.has(p);
            return (
              <button key={p} type="button" aria-label={isUsed ? `Part ${p} đã chọn, bấm để bỏ` : `Thêm Part ${p}`} aria-pressed={isUsed} onClick={() => addPart(p)}
                className={isUsed ? 'is-on' : undefined}>{p}</button>
            );
          })}
        </div>
      </div>

      <div className={rows.length > 1 ? 'rdp-grid' : undefined}>
        {rows.map((row, index) => ring(row, index, rows.length === 1))}
      </div>

      <div className="flex items-center justify-between text-[13px] font-extrabold">
        <button type="button" className="rdp-time" onClick={() => setDetailOpen(true)}>⏱ {Math.round(duration)} phút</button>
        <button type="button" aria-expanded={detailOpen} onClick={() => setDetailOpen(o => !o)} className="cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          Thêm chi tiết {detailOpen ? '▴' : '▾'}
        </button>
      </div>

      {detailOpen && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label htmlFor="session-test-name" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Tên đề hoặc nguồn <span className="font-medium text-slate-400 dark:text-slate-500">(không bắt buộc)</span>
              </label>
              <TestNamePicker id="session-test-name" label="Tên đề hoặc nguồn" required={false} value={testName} onChange={setTestName} suggestions={suggestions} />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="session-date" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Ngày luyện</label>
              <input id="session-date" type="date" required max={today} value={date} onChange={e => setDate(e.target.value)}
                className={`w-full rounded-xl px-3 py-1.5 text-sm ${FIELD}`} />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="session-duration" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Thời gian làm (phút)</label>
              <input id="session-duration" type="number" min="0.01" max="1440" step="any" required value={duration} onChange={e => setDuration(Number(e.target.value))}
                className={`w-full rounded-xl px-3 py-1.5 text-sm ${FIELD}`} />
            </div>
          </div>
          <div>
            <label htmlFor="session-notes" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Ghi chú</label>
            <textarea id="session-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="vd: Part 7 bài đọc đôi quản lý thời gian tốt hơn..."
              className={`w-full rounded-xl px-3 py-2 text-sm ${FIELD}`} />
          </div>
        </div>
      )}
    </div>
  );
};
