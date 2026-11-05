import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { MamMascot } from '@/shared/ui/MamMascot';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { summarizeSessionResult, type PartLoss } from '../lib/sessionResult';

const PART_TAG: Record<PartNumber, string> = {
  1: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  2: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  3: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  4: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  5: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  6: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  7: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
};
const PART_NAME: Record<PartNumber, string> = { 1: 'Mô tả tranh', 2: 'Hỏi đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };
const SOFT = 'rounded-2xl bg-[#F0F6EB] dark:bg-slate-800/60';
const HEADING = 'mb-1 text-[15px] font-extrabold text-slate-900 dark:text-white';

function PartLossRows({ losses }: { losses: PartLoss[] }) {
  return (
    <ul>
      {losses.map(loss => (
        <li key={loss.part} className="flex items-center gap-3 border-b border-[#E4ECDD] py-2.5 last:border-0 dark:border-slate-700">
          <span className={`min-w-[34px] rounded-lg px-1.5 py-1 text-center text-[11px] font-extrabold ${PART_TAG[loss.part]}`}>P{loss.part}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-slate-900 dark:text-slate-100">{PART_NAME[loss.part]}</span>
            <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-[#EDE7DF] dark:bg-slate-700" aria-hidden="true">
              <span className="block h-full rounded-full bg-[#E9967F]" style={{ width: `${loss.wrong / loss.total * 100}%` }} />
            </span>
          </span>
          <span className="whitespace-nowrap text-[14px] font-extrabold tabular-nums text-slate-900 dark:text-white">
            {loss.wrong} <span className="font-semibold text-slate-500 dark:text-slate-400">/ {loss.total}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  session: StudySession;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  targetScore?: number;
  onClose: () => void;
  /** No wrong-question list yet: reopen the test in its wrong-question grid. */
  onMarkWrong: () => void;
  /** Reading cards wait for their content: open them in the notebook. */
  onDetails: () => void;
  onReview: (mistakeIds: string[]) => void;
  /** Guests only: their data lives on this device, so the screen offers a Google sign-in to keep it safe. */
  onSignIn?: () => void;
}

/**
 * Shown right after a Full Test is saved: an honest reaction from Mầm, the score against the goal, where the
 * points were lost, and the one next step that leads toward reviewing those mistakes.
 */
export function SessionResultScreen({ session, sessions, mistakes, targetScore, onClose, onMarkWrong, onDetails, onReview, onSignIn }: Props) {
  const result = useMemo(() => summarizeSessionResult(session, sessions, mistakes, targetScore), [session, sessions, mistakes, targetScore]);
  const dialogRef = useModalA11y(true, onClose);
  const { goal } = result;

  const primary = result.step === 'mark' ? { label: 'Đánh dấu câu sai', run: onMarkWrong }
    : result.step === 'detail' ? { label: `Ghi chi tiết ${result.detailCount} câu sai`, run: onDetails }
    : result.step === 'review' ? { label: `Ôn ${result.reviewIds.length} câu sai`, run: () => onReview(result.reviewIds) }
    : { label: 'Xong', run: onClose };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-backdrop max-md:items-stretch max-md:p-0">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="session-result-title" tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] bg-[#FBFDF8] text-slate-900 shadow-[0_24px_60px_-26px_rgba(30,60,20,.45)] animate-sheet-up dark:bg-[#121A2B] dark:text-white sm:animate-modal-pop max-md:h-[100dvh] max-md:max-h-none max-md:rounded-none">
        <div className="flex shrink-0 items-center gap-2.5 px-5 pb-1 pt-4">
          <button type="button" onClick={onClose} aria-label="Đóng kết quả"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F0F6EB] text-slate-700 hover:bg-[#E3EEDB] dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="min-w-0 truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">{session.testName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-2 md:grid-rows-[1fr_auto]">
          <section className={`px-5 pb-2 text-center md:row-span-2 md:px-7 md:pb-7 ${result.mood === 'happy'
            ? 'bg-[radial-gradient(110%_70%_at_50%_12%,#FFF3D3,transparent_72%)] dark:bg-[radial-gradient(110%_70%_at_50%_12%,rgba(242,185,59,.16),transparent_72%)]'
            : 'bg-[radial-gradient(110%_70%_at_50%_12%,#DCEFD3,transparent_72%)] dark:bg-[radial-gradient(110%_70%_at_50%_12%,rgba(62,138,79,.22),transparent_72%)]'}`}>
            <MamMascot mood={result.mood} stage={result.stage} className="mx-auto -mb-1.5 block h-[146px] w-[132px] md:h-[166px] md:w-[150px]" />
            <h2 id="session-result-title" className="text-[24px] font-extrabold tracking-tight md:text-[28px]">{result.headline}</h2>
            <p className="mx-auto mt-0.5 max-w-[290px] text-[14px] leading-snug text-slate-500 dark:text-slate-400">{result.subline}</p>
            <p className="mt-3 flex items-baseline justify-center gap-1.5">
              <span className="text-[54px] font-extrabold leading-none tracking-tight tabular-nums md:text-[62px]">{result.score}</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">/ 990</span>
            </p>
            {result.listening !== undefined && result.reading !== undefined && (
              <p className="mt-1 flex justify-center gap-4 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <span>Listening <strong className="text-slate-900 dark:text-white">{result.listening}</strong></span>
                <span>Reading <strong className="text-slate-900 dark:text-white">{result.reading}</strong></span>
              </p>
            )}
            {goal && (
              <div className={`${SOFT} mt-4 px-4 py-3 text-left`}>
                <p className="mb-2 flex justify-between gap-2 text-[13px] font-semibold">
                  <span>Mục tiêu {goal.target}</span>
                  <span className="font-extrabold text-[#3E8A4F] dark:text-emerald-300">{goal.remaining ? `còn ${goal.remaining} điểm` : 'Đã đạt!'}</span>
                </p>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-[#DCE7D4] dark:bg-slate-700" role="img"
                  aria-label={goal.remaining ? `Còn ${goal.remaining} điểm tới mục tiêu ${goal.target}` : `Đã đạt mục tiêu ${goal.target}`}>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#8FD07E] to-[#3E8A4F]" style={{ width: `${goal.gainFromPercent ?? goal.fillPercent}%` }} />
                  {goal.gainFromPercent !== undefined && <span className="absolute inset-y-0 bg-[#F2B93B]" style={{ left: `${goal.gainFromPercent}%`, width: `${goal.fillPercent - goal.gainFromPercent}%` }} />}
                </div>
              </div>
            )}
          </section>

          <section className="px-5 pb-4 md:border-l md:border-[#E4ECDD] md:px-7 md:pt-6 dark:md:border-slate-700">
            {result.step === 'review' && result.categoryLosses.length > 0 && <>
              <h3 className={`${HEADING} mt-4 md:mt-0`}>Mất điểm nhiều nhất ở</h3>
              <ul>
                {result.categoryLosses.map(loss => (
                  <li key={loss.category} className="flex items-center gap-3 border-b border-[#E4ECDD] py-2.5 last:border-0 dark:border-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ERROR_CATEGORY_LABELS[loss.category].color }} aria-hidden="true" />
                    <span className="flex-1 text-[14px] font-semibold">{loss.label}</span>
                    <span className="text-[14px] font-extrabold tabular-nums">{loss.count} câu</span>
                  </li>
                ))}
              </ul>
            </>}
            {result.step !== 'review' && result.partLosses.length > 0 && <>
              <h3 className={`${HEADING} mt-4 md:mt-0`}>Sai nhiều nhất ở</h3>
              <PartLossRows losses={result.partLosses} />
            </>}
            {result.step === 'mark' && (
              <div className={`${SOFT} mt-4 px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300 ${result.partLosses.length ? '' : 'md:mt-0'}`}>
                <p className="mb-0.5 text-[14.5px] font-extrabold text-slate-900 dark:text-white">Muốn biết mất điểm ở đâu?</p>
                Bấm vào số các câu bạn làm sai. Mất khoảng 1 phút, và Mầm sẽ chỉ ra Part nào đang kéo điểm xuống.
              </div>
            )}
            {result.step === 'detail' && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                {result.detailCount} câu Reading sai đã vào Sổ tay. Ghi nội dung câu để ôn lại được.
              </p>
            )}
            {result.step === 'done' && !result.partLosses.length && (
              <p className="mt-4 text-[14px] font-semibold text-slate-700 dark:text-slate-300 md:mt-0">Không sai câu nào. Tuyệt vời!</p>
            )}
            {onSignIn && (
              <p className="mt-4 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                Kết quả đang chỉ lưu trên máy này.{' '}
                <button type="button" onClick={onSignIn} className="cursor-pointer font-bold text-[#3E8A4F] underline underline-offset-2 dark:text-emerald-300">
                  Đăng nhập để không mất khi đổi máy
                </button>
              </p>
            )}
          </section>

          <div className="sticky bottom-0 bg-gradient-to-t from-[#FBFDF8] from-70% to-transparent px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 dark:from-[#121A2B] md:static md:col-start-2 md:border-l md:border-[#E4ECDD] md:bg-none md:px-7 md:pb-7 dark:md:border-slate-700">
            <button type="button" onClick={primary.run}
              className="block w-full cursor-pointer rounded-[18px] bg-[#3E8A4F] px-4 py-4 text-[16px] font-extrabold text-white shadow-[0_6px_0_#2B6638] transition hover:brightness-105 active:translate-y-0.5 active:shadow-[0_4px_0_#2B6638]">
              {primary.label}
            </button>
            {result.step !== 'done' && (
              <button type="button" onClick={onClose}
                className="mx-auto mt-2 block min-h-10 cursor-pointer px-4 text-[13.5px] font-bold text-[#3E8A4F] dark:text-emerald-300 md:mx-0">
                Để sau
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
