import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { formatVocabDate, type VocabDay, type VocabDetails } from '../lib/vocabularyModel';

interface Props { day: VocabDay; suggestions: string[]; onClose: () => void; onSave: (count: number, details: VocabDetails) => string | null }

export function VocabEditModal({ day, suggestions, onClose, onSave }: Props) {
  const ref = useModalA11y(true, onClose);
  const [count, setCount] = useState(String(day.count));
  const [source, setSource] = useState(day.sourceNames.join(' · '));
  const [parts, setParts] = useState(day.parts);
  const [error, setError] = useState('');
  const save = (event: React.FormEvent) => { event.preventDefault(); const message = onSave(Number(count), { sourceName: source, parts }); if (message) setError(message); };
  return createPortal(<div className="vocab-modal-overlay" onClick={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="vocab-edit-title" className="vocab-modal">
      <header className="vocab-modal-header"><div><h3 id="vocab-edit-title" className="text-lg font-black">Sửa ghi nhận</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ngày {formatVocabDate(day.date)}</p></div><button type="button" aria-label="Đóng ghi nhận" className="vocab-icon-button" onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={save} className="flex min-h-0 flex-col">
        <div className="vocab-modal-body">
          <label className="vocab-label">Số từ đã học<input type="number" min={1} max={10000} step={1} required value={count} onChange={event => setCount(event.target.value)} className="vocab-input" /></label>
          <label className="vocab-label">Nguồn học <span className="font-normal text-slate-500 dark:text-slate-400">(tùy chọn)</span><input type="text" maxLength={300} list="vocab-source-list" value={source} onChange={event => setSource(event.target.value)} placeholder="Tên đề, bài đọc hoặc tài liệu" className="vocab-input" /></label>
          <datalist id="vocab-source-list">{suggestions.map(name => <option key={name} value={name} />)}</datalist>
          <fieldset><legend className="vocab-label">Part <span className="font-normal text-slate-500 dark:text-slate-400">(tùy chọn, chọn được nhiều)</span></legend><div className="vocab-part-choices">{[1, 2, 3, 4, 5, 6, 7].map(part => <button type="button" key={part} aria-label={`Part ${part}`} aria-pressed={parts.includes(part)} onClick={() => setParts(current => current.includes(part) ? current.filter(value => value !== part) : [...current, part].sort((a, b) => a - b))}>P{part}</button>)}</div></fieldset>
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
        <footer className="vocab-modal-footer"><button type="button" className="vocab-button" onClick={onClose}>Hủy</button><button type="submit" className="vocab-button is-primary">Cập nhật</button></footer>
      </form>
    </div>
  </div>, document.body);
}
