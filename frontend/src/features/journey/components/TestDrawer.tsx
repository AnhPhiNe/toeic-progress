import { useEffect, useRef } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { ddmm, notebookQuestions, testStory, wrongCountsByPart } from '../lib/journeyData';
import { TestTicket } from './TestTicket';

interface Props {
  session: StudySession;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  target: number;
  onClose: () => void;
  onOpenNotebook: (testName: string) => void;
  onEdit: (session: StudySession) => void;
  onDelete: (session: StudySession) => void;
}

const CAP = 16;
const shortName = (name: string) => name.replace(/^.*?(Test\s*\d+)$/i, '$1');

/** Test drawer (design/previews/mock-journey-tabs.html): ticket, Sóc's line, wrong questions per Part. */
export function TestDrawer({ session, sessions, mistakes, target, onClose, onOpenNotebook, onEdit, onDelete }: Props) {
  const story = testStory(session, sessions, target);
  const score = session.totalScore ?? 0;
  const byPart = session.wrongQuestions ? wrongQuestionsByPart(session.wrongQuestions) : null;
  const counts = wrongCountsByPart(session);
  const inNotebook = notebookQuestions(session, mistakes);
  const total = counts ? PART_NUMBERS.reduce((s, p) => s + counts[p], 0) : 0;
  const worst = counts ? PART_NUMBERS.reduce((w, p) => (counts[p] >= counts[w] ? p : w), 1 as PartNumber) : 7;
  const retake = Boolean(story.earlier) || (session.attemptNumber ?? 1) > 1;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const say = story.earlier
    ? <>Lần đầu làm đề này ({ddmm(story.earlier.date)}) bạn được <b>{story.earlier.totalScore}</b>. Lần này {score >= (story.earlier.totalScore ?? 0) ? 'hơn' : 'kém'} <b>{Math.abs(score - (story.earlier.totalScore ?? 0))} điểm</b>, dù đã gặp câu hỏi rồi.</>
    : story.kind === 'first' ? <>Đề đầu tiên của bạn. Sai nhiều là chuyện bình thường, mốc này để so với các đề sau nha.</>
    : story.kind === 'goal' ? <>Bạn đã chạm mục tiêu <b>{target}</b>! Muốn bay cao hơn thì đặt mục tiêu mới nha.</>
    : story.kind === 'rec' ? <>Kỷ lục mới, hơn đề trước <b>{story.delta} điểm</b>!</>
    : story.kind === 'down' ? <>Kém đề trước {Math.abs(story.delta)} điểm, chuyện thường thôi. Xem Part nào tụt ở dưới nha.</>
    : <>Hơn đề trước <b>{story.delta} điểm</b>, cứ giữ đà này.</>;

  return (
    <div className="rd jr-drwwrap" role="presentation">
      <div className="jr-dim" onClick={onClose} />
      <div className="jr-drw" role="dialog" aria-modal="true" aria-label={session.testName} tabIndex={-1} ref={panel}>
        <div className="jr-dtop"><span>{session.testName}</span><button type="button" className="jr-x" onClick={onClose} aria-label="Đóng">×</button></div>
        <TestTicket kind={story.kind} first={story.first} score={score} goal={target} delta={story.delta}
          listening={session.scaledListening} reading={session.scaledReading} date={ddmm(session.date)} test={shortName(session.testName)} retake={retake} />
        <div className="jr-say"><Soc state={story.kind === 'rec' || story.kind === 'goal' ? 'cheerC' : 'idle'} size={56} /><p>{say}</p></div>
        {counts ? <>
          <div className="jr-h5"><b>{total} câu sai</b>{inNotebook.size > 0 && <span><i className="jr-lg" />đã có trong Sổ tay</span>}</div>
          <div className="jr-sec">
            {PART_NUMBERS.map(p => {
              const qs = byPart?.[p] ?? [];
              const more = qs.length > CAP, shown = more ? qs.slice(0, CAP - 2) : qs;
              const color = p === worst && total ? '#ff7a9c' : p < 5 ? '#1c8fe3' : '#46b35a';
              return (
                <div key={p} className="jr-pr">
                  <b style={{ color }}>Part {p}</b>
                  <div className="jr-pq">
                    {byPart ? <>
                      {shown.map(q => <i key={q} className={inNotebook.has(q) ? 'is-nb' : undefined}>{q}</i>)}
                      {more && <button type="button" className="is-more" onClick={() => onOpenNotebook(session.testName)}>+{qs.length - shown.length} câu</button>}
                      {!qs.length && <span className="jr-none">không sai câu nào</span>}
                    </> : <span className="jr-none">{counts[p] ? 'chỉ có số câu, chưa ghi số thứ tự' : 'không sai câu nào'}</span>}
                  </div>
                  <span className="jr-pc">{counts[p]} câu</span>
                </div>
              );
            })}
          </div>
        </> : <p className="jr-none jr-pad">Đề này chỉ ghi điểm, chưa có câu sai. Bấm <b>Sửa điểm</b> để thêm.</p>}
        <div className="jr-foot">
          <button type="button" className="rd-btn" onClick={() => onOpenNotebook(session.testName)}>{worst >= 5 && total ? `Chụp trang chữa bài Part ${worst}` : 'Mở Sổ tay đề này'}</button>
          <div className="jr-lnks">
            <button type="button" className="jr-lnk" onClick={() => onEdit(session)}>Sửa điểm</button>
            <button type="button" className="jr-lnk is-del" onClick={() => { if (window.confirm(`Xoá bản ghi “${session.testName}” ngày ${ddmm(session.date)}?`)) onDelete(session); }}>Xoá</button>
          </div>
        </div>
      </div>
    </div>
  );
}
