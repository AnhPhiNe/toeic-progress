import { useEffect, useMemo } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useCountUp } from '@/shared/hooks/useCountUp';
import { playChime } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { ShareCardButton } from '@/shared/components/ShareCardButton';
import { Soc } from '@/shared/ui/soc/Soc';
import './session-result.css';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneSessionResult } from './phone/PhoneSessionResult';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { summarizeSessionResult, type PartLoss } from '../lib/sessionResult';
import { isFirstFullTest } from '../lib/firstStake';
import { resultFacts } from './phone/phoneLogLib';
import { FirstStakeCard } from './FirstStakeCard';
import { AskAdviceRow } from './AskAdviceRow';

const PART_NAME: Record<PartNumber, string> = { 1: 'Mô tả tranh', 2: 'Hỏi đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };
const PART_INK: Record<PartNumber, [string, string]> = {
  1: ['#e6f1ff', '#2c5fd6'], 2: ['#e6f1ff', '#2c5fd6'], 3: ['#e6f1ff', '#2c5fd6'], 4: ['#e6f1ff', '#2c5fd6'],
  5: ['#e6f8ea', '#24894f'], 6: ['#e6f8ea', '#24894f'], 7: ['#e6f8ea', '#24894f']
};

function PartLossRows({ losses }: { losses: PartLoss[] }) {
  return (
    <ul className="sr-list">
      {losses.map(loss => (
        <li key={loss.part}>
          <span className="sr-tag" style={{ background: PART_INK[loss.part][0], color: PART_INK[loss.part][1] }}>P{loss.part}</span>
          <span className="sr-name">
            <b>{PART_NAME[loss.part]}</b>
            <span className="sr-bar" aria-hidden="true"><i style={{ width: `${loss.wrong / loss.total * 100}%` }} /></span>
          </span>
          <span className="sr-num">{loss.wrong}<small> / {loss.total} sai</small></span>
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
  /** Opens this test in Hành trình with Sóc's advice block in view; absent when the build has no backend. */
  onAskAdvice?: () => void;
}

/**
 * Shown right after a Full Test is saved: an honest reaction from Mầm, the score against the goal, where the
 * points were lost, and the one next step that leads toward reviewing those mistakes.
 */
export function SessionResultScreen(props: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  return isPhone ? <PhoneSessionResult {...props} /> : <DesktopSessionResult {...props} />;
}

function DesktopSessionResult({ session, sessions, mistakes, targetScore, onClose, onMarkWrong, onDetails, onReview, onSignIn, onAskAdvice }: Props) {
  const result = useMemo(() => summarizeSessionResult(session, sessions, mistakes, targetScore), [session, sessions, mistakes, targetScore]);
  const dialogRef = useModalA11y(true, onClose);
  const { goal } = result;
  const firstTest = useMemo(() => isFirstFullTest(sessions), [sessions]);
  const facts = useMemo(() => resultFacts(session, sessions, targetScore), [session, sessions, targetScore]);
  const shownScore = useCountUp(result.score, 600);
  useEffect(() => {
    playChime(facts.record ? 'levelup' : 'complete');
    triggerHaptic(12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primary = result.step === 'mark' ? { label: 'Đánh dấu câu sai', run: onMarkWrong }
    : result.step === 'detail' ? { label: `Ghi chi tiết ${result.detailCount} câu sai`, run: onDetails }
    : result.step === 'review' ? { label: `Ôn ${result.reviewIds.length} câu sai`, run: () => onReview(result.reviewIds) }
    : { label: 'Xong', run: onClose };

  return (
    <div className="rd sr-dim">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="session-result-title" tabIndex={-1} className="sr-box">
        <button type="button" onClick={onClose} aria-label="Đóng kết quả" className="sr-x">×</button>

        <section className={'sr-left' + (result.mood === 'happy' ? ' is-happy' : '')}>
          <span className="sr-rays" aria-hidden="true" />
          <p className="sr-test">{session.testName}</p>
          {firstTest
            ? <FirstStakeCard variant="panel" score={facts.score} stair={facts.stair} remaining={facts.remaining} target={targetScore} onClose={onClose} />
            : <>
          <Soc state={facts.record ? 'proud' : result.mood === 'happy' ? 'cheerC' : 'hi'} size={128} className="sr-soc" />
          <h2 id="session-result-title">{result.headline}</h2>
          <p className="sr-sub">{result.subline}</p>
          <p className="sr-score"><b>{shownScore}</b><span>/ 990</span></p>
          {result.listening !== undefined && result.reading !== undefined && (
            <p className="sr-lr"><span>Nghe <b>{result.listening}</b></span><span>Đọc <b>{result.reading}</b></span></p>
          )}
            </>}
          {goal && !firstTest && (
            <div className="sr-goal">
              <p><span>Mục tiêu {goal.target}</span><b>{goal.remaining ? `còn ${goal.remaining} điểm` : 'Đã đạt!'}</b></p>
              <div className="sr-goal-bar" role="img" aria-label={goal.remaining ? `Còn ${goal.remaining} điểm tới mục tiêu ${goal.target}` : `Đã đạt mục tiêu ${goal.target}`}>
                <i style={{ width: `${goal.gainFromPercent ?? goal.fillPercent}%` }} />
                {goal.gainFromPercent !== undefined && <i className="is-gain" style={{ left: `${goal.gainFromPercent}%`, width: `${goal.fillPercent - goal.gainFromPercent}%` }} />}
              </div>
            </div>
          )}
        </section>

        <section className="sr-right">
          <div className="sr-scroll">
            {result.step === 'review' && result.categoryLosses.length > 0 && <>
              <h3>Mất điểm nhiều nhất ở</h3>
              <ul className="sr-list">
                {result.categoryLosses.map(loss => (
                  <li key={loss.category}>
                    <span className="sr-dot" style={{ backgroundColor: ERROR_CATEGORY_LABELS[loss.category].color }} aria-hidden="true" />
                    <span className="sr-name"><b>{loss.label}</b></span>
                    <span className="sr-num">{loss.count}<small> câu</small></span>
                  </li>
                ))}
              </ul>
            </>}
            {result.step !== 'review' && result.partLosses.length > 0 && <>
              <h3>Sai nhiều nhất ở</h3>
              <PartLossRows losses={result.partLosses} />
            </>}
            {result.step === 'mark' && (
              <div className="sr-note">
                <b>Muốn biết mất điểm ở đâu?</b>
                Bấm vào số các câu bạn làm sai. Mất khoảng 1 phút, Sóc sẽ chỉ ra Part nào đang kéo điểm xuống.
              </div>
            )}
            {result.step === 'detail' && <p className="sr-p">{result.detailCount} câu Đọc sai đã vào Sổ tay. Chụp trang chữa bài để Sóc ghi nội dung giúp.</p>}
            {result.step === 'done' && !result.partLosses.length && <p className="sr-p is-strong">Không sai câu nào. Tuyệt vời!</p>}
            {onSignIn && (
              <p className="sr-sign">Kết quả đang chỉ lưu trên máy này. <button type="button" onClick={onSignIn}>Đăng nhập để không mất khi đổi máy</button></p>
            )}
          </div>
          {onAskAdvice && <AskAdviceRow onClick={onAskAdvice} />}
          <div className="sr-acts">
            <button type="button" onClick={primary.run} className="rd-btn sr-main">{primary.label}</button>
            <div className="sr-subacts">
              <ShareCardButton data={{ total: result.score, listening: result.listening, reading: result.reading, testName: session.testName, subtitle: facts.record ? 'Kỷ lục mới' : undefined }} className="sr-share" />
              {result.step !== 'done' && <button type="button" onClick={onClose} className="sr-later">Để sau</button>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
