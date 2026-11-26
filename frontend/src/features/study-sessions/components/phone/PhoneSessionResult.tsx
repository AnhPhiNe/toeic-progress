import { useEffect, useMemo } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useCountUp } from '@/shared/hooks/useCountUp';
import { playChime } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { ShareCardButton } from '@/shared/components/ShareCardButton';
import { Soc } from '@/shared/ui/soc/Soc';
import { summarizeSessionResult } from '../../lib/sessionResult';
import { resultFacts } from './phoneLogLib';
import { isFirstFullTest } from '../../lib/firstStake';
import { FirstStakeCard } from '../FirstStakeCard';
import { AskAdviceRow } from '../AskAdviceRow';
import './phoneResult.css';

interface Props {
  session: StudySession;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  targetScore?: number;
  onClose: () => void;
  onMarkWrong: () => void;
  onDetails: () => void;
  onReview: (mistakeIds: string[]) => void;
  onSignIn?: () => void;
  onAskAdvice?: () => void;
}

/** Phone result after saving a Full Test: score, record, Sóc and the one next step. Sketch: design/previews/mock-phone-log.html */
export function PhoneSessionResult({ session, sessions, mistakes, targetScore, onClose, onMarkWrong, onDetails, onReview, onSignIn, onAskAdvice }: Props) {
  const result = useMemo(() => summarizeSessionResult(session, sessions, mistakes, targetScore), [session, sessions, mistakes, targetScore]);
  const facts = useMemo(() => resultFacts(session, sessions, targetScore), [session, sessions, targetScore]);
  const dialogRef = useModalA11y(true, onClose);
  const firstTest = useMemo(() => isFirstFullTest(sessions), [sessions]);
  const delta = facts.delta;
  const shownScore = useCountUp(typeof facts.score === 'number' ? facts.score : result.score, 600);
  useEffect(() => {
    playChime(facts.record ? 'levelup' : 'complete');
    triggerHaptic(12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const line = facts.record ? `Kỷ lục mới · ▲ ${delta}`
    : facts.first ? 'Bài đầu tiên, mốc để so sánh'
    : delta === null ? ''
    : delta > 0 ? `Tăng ${delta} điểm so với đề trước`
    : delta === 0 ? 'Bằng đề trước, giữ vững phong độ'
    : `Giảm ${-delta} điểm, không sao`;
  const next = result.step === 'mark' ? { label: '📷 Ghi câu sai ngay', run: onMarkWrong }
    : result.step === 'detail' ? { label: `Ghi chi tiết ${result.detailCount} câu sai`, run: onDetails }
    : result.step === 'review' ? { label: `Ôn ${result.reviewIds.length} câu sai`, run: () => onReview(result.reviewIds) }
    : null;

  return (
    <div className="rd plr" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="session-result-title" tabIndex={-1}>
      <span className="plr-rays" aria-hidden="true" />
      {firstTest ? (
        <div className="plr-first">
          <FirstStakeCard variant="card" score={facts.score} stair={facts.stair} remaining={facts.remaining} target={targetScore} onClose={onClose} />
        </div>
      ) : <>
      <div className="plr-top">
        <p className="plr-test">{session.testName}</p>
        <h2 id="session-result-title" className="plr-score">{typeof facts.score === 'number' ? shownScore : facts.score}<span className="sr-only"> điểm</span></h2>
        {line && <p className="plr-line">{line}</p>}
      </div>
      <Soc state={facts.record ? 'proud' : 'idle'} size={150} className="plr-soc" />
      <div className="plr-card">
        <p className="plr-row">
          {result.listening !== undefined && <span>Nghe {result.listening}</span>}
          {result.reading !== undefined && <span>Đọc {result.reading}</span>}
          {facts.stair && <span className="plr-stair">Bậc {facts.stair.index}/{facts.stair.total}</span>}
        </p>
        {facts.remaining !== null && targetScore
          ? <p className="plr-goal">{facts.remaining > 0 ? `Còn ${facts.remaining} điểm nữa là chạm cúp ${targetScore}.` : `Bạn đã chạm cúp ${targetScore}!`}</p>
          : null}
      </div>
      </>}
      {onAskAdvice && <AskAdviceRow onClick={onAskAdvice} className="plr-ask" />}
      <ShareCardButton data={{ total: result.score, listening: result.listening, reading: result.reading, testName: session.testName, subtitle: facts.record ? 'Kỷ lục mới' : undefined }} className="plr-share" />
      {onSignIn && <p className="plr-sign">Kết quả đang chỉ lưu trên máy này. <button type="button" onClick={onSignIn}>Đăng nhập để không mất khi đổi máy</button></p>}
      <div className="plr-acts">
        <button type="button" className={'plr-done' + (next ? '' : ' is-solo')} onClick={onClose}>Xong</button>
        {next && <button type="button" className="plr-next" onClick={next.run}>{next.label}</button>}
      </div>
    </div>
  );
}
