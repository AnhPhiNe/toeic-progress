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
  const stepBtn = `grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[10px] bg-white text-lg font-extrabold hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 ${INK}`;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">Part đã luyện</div>
        <div role="group" aria-label="Part đã luyện" className={`grid grid-cols-7 overflow-hidden rounded-xl ${INK}`}>
          {PARTS.map((p, i) => {
            const isUsed = used.has(p);
            return (
              <button key={p} type="button" aria-label={isUsed ? `Part ${p} đã thêm, bấm để bỏ` : `Thêm Part ${p}`} aria-pressed={isUsed} onClick={() => addPart(p)}
                className={`py-2.5 text-sm font-extrabold transition ${i > 0 ? 'border-l-2 border-slate-900 dark:border-slate-300' : ''} ${
                  isUsed
                    ? 'cursor-pointer bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100'
                    : 'cursor-pointer bg-white text-slate-900 hover:bg-blue-100 hover:text-blue-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-blue-900 dark:hover:text-blue-100'
                }`}>
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {rows.map((row, index) => {
        const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
        return (
          <div key={row.part} className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-2xl px-3.5 py-3 ${INK}`}>
            <span className="rounded-[10px] border-2 border-slate-900 bg-blue-100 px-2.5 py-1.5 text-[13px] font-extrabold text-blue-700 dark:border-slate-300 dark:bg-blue-900 dark:text-blue-100">Part {row.part}</span>
            <div className="flex items-center justify-center gap-2.5">
              <button type="button" aria-label={`Giảm số câu đúng Part ${row.part}`} onClick={() => patch(index, r => ({ correct: r.correct - 1 }))} className={stepBtn}>−</button>
              <input type="number" min={0} max={row.total} step={1} inputMode="numeric" aria-label={`Số câu đúng Part ${row.part}`}
                value={row.correct} onChange={e => patch(index, () => ({ correct: Number(e.target.value) }))}
                onFocus={e => e.target.select()}
                className={`w-[74px] rounded-xl px-2 py-0.5 text-center text-[30px] font-extrabold leading-[1.1] tabular-nums ${NO_SPIN} ${FIELD}`} />
              <button type="button" aria-label={`Tăng số câu đúng Part ${row.part}`} onClick={() => patch(index, r => ({ correct: r.correct + 1 }))} className={stepBtn}>+</button>
              <span className="flex items-center gap-1 text-[15px] font-bold text-slate-500 dark:text-slate-400">
                /
                <input type="number" min={1} step={1} inputMode="numeric" aria-label={`Tổng số câu Part ${row.part}`}
                  value={row.total} onChange={e => patch(index, () => ({ total: Number(e.target.value) }))}
                  onFocus={e => e.target.select()}
                  className={`w-10 border-0 border-b-2 border-dotted border-slate-500 bg-transparent px-0 text-center font-bold tabular-nums text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-400 dark:text-slate-200 ${NO_SPIN}`} />
                câu
              </span>
            </div>
            <div className="text-right text-[13px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300">
              {pct}%<small className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">đúng</small>
            </div>
            {rows.length > 1
              ? <button type="button" aria-label={`Bỏ Part ${row.part}`} title={`Bỏ Part ${row.part}`} onClick={() => removePart(row.part)}
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border-2 border-transparent text-lg font-extrabold text-slate-500 hover:border-slate-900 hover:text-rose-700 focus-visible:border-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:border-slate-300 dark:hover:text-rose-300">×</button>
              : <span className="w-8" aria-hidden="true" />}
          </div>
        );
      })}

      <div className="flex items-center justify-between text-[13px] font-extrabold">
        <span />
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
