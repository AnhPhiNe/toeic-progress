import { useLayoutEffect, useRef, useState } from 'react';
import type { StudySession, UserProfile } from '@/shared/types';
import { MetricToggle, SummitCard, useSummitData } from '../ScoreTab';
import { SummitScene } from '../SummitScene';
import { useSize } from './useSize';
import '../summit.css';

interface Props {
  sessions: StudySession[];
  profile: UserProfile;
  today: string;
  onOpenTest: (id: string) => void;
  onLog: () => void;
}

/** Điểm số on phones: the same illustrated mountain under the "Mình có kịp không?" card (no speech bubble). */
export function JourneyScore({ sessions, profile, today, onOpenTest, onLog }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const data = useSummitData(sessions, profile, today);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardBottom, setCardBottom] = useState(220);
  useLayoutEffect(() => {
    const el = cardRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const measure = () => setCardBottom(el.offsetTop + el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="sm-phone">
      <SummitScene variant="phone" W={w} H={h} points={data.T} hidden={data.hidden} target={data.target} latestIdx={data.latestIdx}
        ghost={data.counted < 2} cardBottom={cardBottom} onOpenTest={onOpenTest} onForce={data.force} />
      <div ref={cardRef} style={{ display: 'contents' }}>
        <SummitCard data={data} phone onLog={onLog} profileTarget={profile.targetScore} />
      </div>
      <MetricToggle metric={data.metric} onChange={data.setMetric} />
    </div>
  );
}
