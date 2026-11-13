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

  // A Part's question count is fixed (P1 6 … P7 54); learners count what they got wrong, usually the smaller number.
  const fullSize = (part: Part) => PART_MAX_QUESTIONS[`part${part}` as keyof typeof PART_MAX_QUESTIONS];
  const [adding, setAdding] = useState(false);
  const removePart = (part: Part) => setRows(prev => prev.length <= 1 ? prev : prev.filter(row => row.part !== part));
  const pickPart = (part: Part) => {
    if (adding) {
      setAdding(false);
      if (!used.has(part)) setRows(prev => [...prev, { part, correct: fullSize(part), total: fullSize(part) }]);
      return;
    }
    if (rows.length === 1 && rows[0].part === part) return;
    setRows([{ part, correct: fullSize(part), total: fullSize(part) }]);
  };
  const setWrong = (index: number, wrong: number) =>
    setRows(prev => prev.map((row, i) => i !== index ? row : { ...row, correct: row.total - Math.min(row.total, Math.max(0, Math.round(wrong) || 0)) }));

  const counter = (row: PracticePartResult, index: number, single: boolean) => {
    const wrong = row.total - row.correct;
    return (
      <div key={row.part} className={'rdw-card' + (single ? ' is-single' : '')}>
        {!single && (
          <div className="rdw-cardh"><b>Part {row.part}</b>
            <button type="button" className="rdp-x" aria-label={`Bỏ Part ${row.part}`} title={`Bỏ Part ${row.part}`} onClick={() => removePart(row.part)}>×</button>
          </div>
        )}
        {single && <div className="rdp-lbl">BẠN SAI MẤY CÂU?</div>}
        <div className="rdw-dial">
          <button type="button" className="rdw-pm" aria-label={`Bớt một câu sai Part ${row.part}`} disabled={wrong <= 0} onClick={() => setWrong(index, wrong - 1)}>−</button>
          <label className="rdw-num">
            <input type="number" min={0} max={row.total} step={1} inputMode="numeric" aria-label={`Số câu sai Part ${row.part}`}
              value={wrong} onChange={e => setWrong(index, Number(e.target.value))} onFocus={e => e.target.select()} className={NO_SPIN} />
            <small>câu sai · bấm số để gõ</small>
          </label>
          <button type="button" className="rdw-pm is-plus" aria-label={`Thêm một câu sai Part ${row.part}`} disabled={wrong >= row.total} onClick={() => setWrong(index, wrong + 1)}>+</button>
        </div>
      </div>
    );
  };

  const correct = rows.reduce((sum, row) => sum + row.correct, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const share = total ? correct / total : 0;
  const rc = 2 * Math.PI * 26;

  return (
    <div className="rdp space-y-4">
      <div role="group" aria-label="Part đã luyện" className={'rdw-parts' + (adding ? ' is-adding' : '')}>
        {PARTS.map(p => {
          const isUsed = used.has(p);
          return (
            <button key={p} type="button" aria-pressed={isUsed} onClick={() => pickPart(p)} disabled={adding && isUsed}
              aria-label={adding ? `Thêm Part ${p}` : `Part ${p}`} className={isUsed ? 'is-on' : undefined}>{p}</button>
          );
        })}
        <button type="button" className={'rdw-add' + (adding ? ' is-on' : '')} aria-pressed={adding} onClick={() => setAdding(a => !a)}
          title={adding ? 'Huỷ thêm Part' : 'Ghi thêm một Part trong cùng buổi'} aria-label={adding ? 'Huỷ thêm Part' : 'Thêm Part khác'}>{adding ? '×' : '+'}</button>
      </div>
      {adding && <p className="rdw-hint">Chọn Part muốn ghi thêm</p>}

      <div className={rows.length > 1 ? 'rdp-grid' : undefined}>
        {rows.map((row, index) => counter(row, index, rows.length === 1))}
      </div>

      <div className="rdw-res">
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#e9e2ff" strokeWidth="9" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="#a78bfa" strokeWidth="9" strokeLinecap="round" opacity={share > 0 ? 1 : 0}
            strokeDasharray={`${share * rc} ${rc}`} transform="rotate(-90 32 32)" />
          <text x="32" y="37" textAnchor="middle" fontWeight="900" fontSize="14" fill="#2f3a33">{Math.round(share * 100)}%</text>
        </svg>
        <div><b>{correct}/{total}</b><small>câu đúng</small></div>
        <button type="button" className="rdp-time" onClick={() => setDetailOpen(true)}>⏱ {Math.round(duration)} phút</button>
      </div>

      <div className="flex items-center justify-between text-[13px] font-extrabold">
        <span />
        <button type="button" aria-expanded={detailOpen} onClick={() => setDetailOpen(o => !o)} className="cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          {detailOpen ? 'Ẩn chi tiết ▴' : 'Thêm tên bài, ghi chú ▾'}
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
