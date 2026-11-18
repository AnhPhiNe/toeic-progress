import { useState } from 'react';
import type { WaitingTest } from '@/features/mistakes/lib/wrongDetail';
import './draft-wait.css';

/**
 * Sổ tay keeps number-only drafts out of its list: one pink row says how many questions wait, per test, and opens
 * Gỡ câu sai for that test (design/previews/mock-wrong-detail.html, frames 6 and 6b).
 */
export function DraftWaitRow({ tests, phone = false, onOpen }: { tests: WaitingTest[]; phone?: boolean; onOpen: (sessionId: string) => void }) {
  const [open, setOpen] = useState(!phone);
  if (!tests.length) return null;
  const waiting = tests.reduce((sum, test) => sum + test.waiting, 0);
  const names = (test: WaitingTest) => test.title + (tests.filter(other => other.title === test.title).length > 1 && test.attempt ? ` · ${test.attempt}` : '');
  const stack = <span className="wdw-stk" aria-hidden="true"><i /><i /><i /></span>;
  const bar = (test: WaitingTest) => (
    <span className="wdw-bar"><i><b style={{ width: `${test.total ? test.done / test.total * 100 : 0}%` }} /></i>đã ghi {test.done}/{test.total}</span>
  );
  if (tests.length === 1) {
    const test = tests[0];
    return (
      <button type="button" className={'wdw' + (phone ? ' is-phone' : '')} onClick={() => onOpen(test.sessionId)}
        aria-label={`${waiting} câu chờ ghi chi tiết, ${names(test)}. Gỡ câu sai`}>
        {stack}
        <span className="wdw-t"><b><em>{waiting} câu</em> chờ ghi chi tiết</b><small>{names(test)} · Part 5–7</small>{bar(test)}</span>
        {phone ? <span className="wdw-chev" aria-hidden="true">›</span> : <span className="rd-btn rd-btn--pink wdw-go">Gỡ câu sai ›</span>}
      </button>
    );
  }
  return (
    <div className={'wdw is-many' + (phone ? ' is-phone' : '')}>
      {stack}
      <span className="wdw-t"><b><em>{waiting} câu</em> chờ ghi chi tiết</b>
        <small>{tests.length} đề{phone ? '' : ` · ${tests.slice(0, 2).map(test => test.title).join(', ')}${tests.length > 2 ? '…' : ''}`}</small></span>
      <button type="button" className="wdw-tog" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Thu gọn ⌃' : `Xem ${tests.length} đề ⌄`}</button>
      {open && tests.map(test => (
        <button key={test.sessionId} type="button" className="wdw-sub" onClick={() => onOpen(test.sessionId)}
          aria-label={`${test.waiting} câu chờ ghi chi tiết, ${names(test)}. Gỡ câu sai`}>
          <span className="wdw-name">{names(test)}<small>{test.waiting} câu chờ · đã ghi {test.done}/{test.total}</small></span><em>Gỡ câu sai ›</em>
        </button>
      ))}
    </div>
  );
}
