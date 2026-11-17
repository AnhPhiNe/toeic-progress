import { useState, type CSSProperties } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { SCORE_REFERENCE_SOURCES, PRACTICE_SCORE_SOURCE } from '@/shared/domain/etsScoring';
import type { Journey } from '../lib/convert';

const COLORS = ['#7fa6e8', '#5b8fe6', '#3d8fe8', '#14b8a6', '#7c5ce0', '#b9b2d8'];

interface Props { journey: Journey; total: number; gear: readonly string[] }

/** "Hành trình CEFR": six stations on a line; Sóc stands at the learner's station and hops when it changes. */
export function ConvertJourney({ journey, total, gear }: Props) {
  const { stations, current } = journey;
  const here = Math.max(0, current);
  const [seen, setSeen] = useState(here);
  const [hops, setHops] = useState(0);
  if (seen !== here) { setSeen(here); setHops(n => n + 1); }
  const fill = current <= 0 ? 0 : (current / (stations.length - 1)) * 100;

  return (
    <section className="cv-route" aria-label="Hành trình CEFR">
      <div className="cv-route__h">
        <b>Hành trình CEFR</b><span>mỗi trạm là mốc tổng TOEIC tối thiểu</span>
        <small>Nguồn: <a href={PRACTICE_SCORE_SOURCE} target="_blank" rel="noopener noreferrer">IIBC</a> · <a href={SCORE_REFERENCE_SOURCES.toeic} target="_blank" rel="noopener noreferrer">ETS</a> · <a href={SCORE_REFERENCE_SOURCES.ielts} target="_blank" rel="noopener noreferrer">British Council</a> · <a href={SCORE_REFERENCE_SOURCES.vstep} target="_blank" rel="noopener noreferrer">ULIS–VNU</a></small>
      </div>
      <div className={'cv-st' + (current < 0 ? ' is-start' : '')} role="list" style={{ ['--i' as string]: here } as CSSProperties}>
        <div className="cv-st__line" aria-hidden="true"><i style={{ width: `${fill}%` }} /></div>
        {stations.map((st, index) => (
          <div key={st.cefr} role="listitem" className={`cv-rs is-${st.state}`} style={{ ['--c' as string]: COLORS[index] } as CSSProperties}
            aria-current={st.state === 'now' ? 'step' : undefined}>
            {st.state === 'next' && <span className="cv-gap">{total < (st.min ?? 0) ? `còn ${(st.min ?? 0) - total} điểm` : 'cần đủ ngưỡng Nghe & Đọc'}</span>}
            <span className="cv-rs__dot" aria-hidden="true">{st.state === 'past' ? '✓' : st.cefr}</span>
            <b>{st.state === 'past' ? `${st.cefr} · ${st.name}` : st.name}</b>
            <small>{st.min === null ? 'ngoài TOEIC' : `${st.min}+`}</small>
            <span className="cv-sr">{st.state === 'now' ? ' · Bạn ở đây' : st.state === 'past' ? ' · đã qua' : ''}</span>
          </div>
        ))}
        <div className={'cv-me' + (current < 0 ? ' is-start' : '')} aria-hidden="true">
          {current >= 0 && <span className="cv-me__tag">Bạn ở đây</span>}
          <span key={hops} className={'cv-me__hop' + (hops > 0 ? ' is-hop' : '')}><Soc state="idle" size={58} gear={gear} /></span>
        </div>
      </div>
    </section>
  );
}
