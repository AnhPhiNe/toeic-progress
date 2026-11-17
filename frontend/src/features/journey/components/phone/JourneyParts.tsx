import { useMemo, useState, type CSSProperties } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { ddmm, fullTests, partSize, wrongCountsByPart } from '../../lib/journeyData';
import { chestPlan, islandState, partAccuracy, partChests, type IslandState } from '../../lib/islands';
import { phoneIslands } from '../../lib/phoneJourney';
import { useSize } from './useSize';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onOpenSessionLogger: () => void;
}

const LOOK: Record<IslandState, { top: string; side: string; ink: string }> = {
  strong: { top: '#a8d672', side: '#7fb655', ink: '#2f8a42' },
  ok: { top: '#c6e58c', side: '#98bd56', ink: '#a87a00' },
  weak: { top: '#f2cf9f', side: '#d9ae74', ink: '#d6416a' }
};

/** Từng Part on phones (mock-phone-journey.html, "Bản bớt chữ" + "Khi chạm"): vertical island map and one panel. */
export function JourneyParts({ sessions, mistakes, onOpenNotebook, onPractice, onOpenSessionLogger }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const withParts = useMemo(() => fullTests(sessions).filter(s => wrongCountsByPart(s)).reverse(), [sessions]);
  const [pickTest, setPickTest] = useState<string | null>(null);
  const [sel, setSel] = useState<PartNumber | null>(null);
  const test = withParts.find(s => s.id === pickTest) ?? withParts[0];
  const now = test ? wrongCountsByPart(test) : null;
  const chests = useMemo(() => (test && now ? partChests(test, now, mistakes) : null), [test, now, mistakes]);
  const plan = useMemo(() => (chests ? chestPlan(chests) : { numbered: [], opened: [] }), [chests]);
  const islands = useMemo(() => phoneIslands(w, h), [w, h]);

  if (!test || !now || !chests) {
    return (
      <div ref={ref} className="jp-scene is-parts">
        <div className="jp-empty">
          <Soc state="think" size={110} />
          <p>Chưa có đề nào ghi câu sai theo Part. Ghi một đề kèm ảnh kết quả, Sóc sẽ chia câu sai theo từng Part.</p>
          <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
        </div>
      </div>
    );
  }

  const acc = (p: PartNumber) => partAccuracy(partSize(p), now[p]);
  const defaultPart = plan.numbered[0] ?? PART_NUMBERS.reduce((worst, p) => (acc(p) < acc(worst) ? p : worst), 1 as PartNumber);
  const shown: PartNumber = sel ?? defaultPart;
  const detail = chests[shown];
  const pct = acc(shown);

  return (
    <div ref={ref} className="jp-scene is-parts">
      <label className="jp-pick">
        <span>{test.testName}</span><i aria-hidden="true">▾</i>
        <select aria-label="Chọn đề" value={test.id} onChange={e => { setPickTest(e.target.value); setSel(null); }}>
          {withParts.map(s => <option key={s.id} value={s.id}>{s.testName} · {ddmm(s.date)}</option>)}
        </select>
      </label>

      {islands.map(({ part, x, y, w: iw }) => {
        const st = islandState(acc(part)), look = LOOK[st], on = part === shown;
        const rank = plan.numbered.indexOf(part);
        const ch = chests[part];
        const chest = rank >= 0 || ch.open;
        const style = { left: x, top: y, width: iw, height: iw * .5, '--top': look.top, '--side': look.side } as CSSProperties;
        return (
          <button key={part} type="button" className={'jp-isl' + (on ? ' is-on' : '') + (st === 'weak' ? ' is-sand' : '')} style={style}
            aria-pressed={on} aria-label={`Part ${part}: ${acc(part)}% đúng, ${ch.wrong} câu sai${rank >= 0 ? `, rương số ${rank + 1}` : ''}`}
            onClick={() => setSel(part)}>
            <s className="jp-isl__halo" />{on && <s className="jp-isl__ring" />}
            <s className="jp-isl__land" />
            <s className="jp-tree" style={{ left: '22%' }} /><s className="jp-tree is-b" style={{ left: '58%' }} />
            {chest && <s className={'jp-chest' + (ch.open ? ' is-open' : '')} style={{ left: '42%', top: '36%' }}>{!ch.open && <em>{rank + 1}</em>}</s>}
            <span className="jp-isl__lbl">Part {part} <b style={{ color: look.ink }}>{acc(part)}%</b></span>
          </button>
        );
      })}

      <div className="jp-panel">
        <div className="jp-panel__row is-base">
          <b className="jp-h">Part {shown}</b>
          {detail.wrong > 0 ? <span className="jp-wrong">{detail.wrong} câu sai</span> : <span className="jp-wrong is-zero">không sai câu nào</span>}
          <span className="jp-sub">{pct}% đúng</span>
        </div>
        <div className="jp-bar" role="img" aria-label={`${pct}% đúng`}><i style={{ width: `${pct}%` }} /></div>
        <div className="jp-btns">
          {detail.wrong > 0 && <button type="button" className="rd-btn jp-main" onClick={() => onOpenNotebook(test.testName, shown)}>Ôn {detail.wrong} câu sai</button>}
          {shown >= 5 && <button type="button" className="jp-ico" aria-label={`Bấm giờ Part ${shown}`} onClick={() => onPractice(shown as 5 | 6 | 7)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7" /><path d="M12 10.5v3.5l2 1.5M10 3h4" /></svg>
          </button>}
        </div>
      </div>
    </div>
  );
}
