import { useMemo, useState } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { PART_NAMES, ddmm, fullTests, partSize, wrongCountsByPart } from '../../lib/journeyData';
import { ISLAND_STATE_LABEL, chestPlan, islandState, partAccuracy, partChests } from '../../lib/islands';
import { PCT_COLOUR, buildMapParts } from '../../lib/islandLook';
import { ISLAND_CARD_CLEAR, ISLAND_PANEL_CLEAR, phoneBoat, phoneIslands } from '../../lib/phoneJourney';
import { phoneLayout, type Pt } from '../../lib/islandMap';
import { IslandMap } from '../IslandMap';
import { ChestIcon, PctLegend, WeatherIcon, partsHeadline } from '../partsShared';
import { useSize } from './useSize';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onOpenSessionLogger: () => void;
  gear?: readonly string[];
}

/** Từng Part on phones (design/previews/journey-v3/parts-islands-v3.html): short card, island map, one bottom sheet. */
export function JourneyParts({ sessions, mistakes, onOpenNotebook, onPractice, onOpenSessionLogger, gear }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const withParts = useMemo(() => fullTests(sessions).filter(s => wrongCountsByPart(s)).reverse(), [sessions]);
  const [pickTest, setPickTest] = useState<string | null>(null);
  const [sel, setSel] = useState<PartNumber | null>(null);
  const [tip, setTip] = useState<PartNumber | null>(null);
  const test = withParts.find(s => s.id === pickTest) ?? withParts[0];
  const now = test ? wrongCountsByPart(test) : null;
  const chests = useMemo(() => (test && now ? partChests(test, now, mistakes) : null), [test, now, mistakes]);
  const plan = useMemo(() => (chests ? chestPlan(chests) : { numbered: [], opened: [] }), [chests]);
  const mapParts = useMemo(() => (now && chests ? buildMapParts(now, chests, plan.numbered) : null), [now, chests, plan]);
  const layout = useMemo(() => {
    const is = phoneIslands(w, h);
    const pos = Object.fromEntries(is.map(i => [i.part, [i.x, i.y] as Pt])) as Record<PartNumber, Pt>;
    const radii = Object.fromEntries(is.map(i => [i.part, i.r])) as Record<PartNumber, number>;
    return phoneLayout(w, h, pos, radii, phoneBoat(w, h), [[0, 0, w, ISLAND_CARD_CLEAR], [0, h - ISLAND_PANEL_CLEAR, w, ISLAND_PANEL_CLEAR]]);
  }, [w, h]);

  if (!test || !now || !chests || !mapParts) {
    return (
      <div ref={ref} className="jp-scene is-parts">
        <div className="jp-empty">
          <Soc state="think" size={110} gear={gear} />
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
  const state = islandState(pct);
  const look = PCT_COLOUR[state];
  const rank = plan.numbered.indexOf(shown);
  const next = rank >= 0 ? plan.numbered[rank + 1] : undefined;
  const total = PART_NUMBERS.reduce((sum, p) => sum + now[p], 0);

  return (
    <div ref={ref} className="jp-scene is-parts">
      <IslandMap device="phone" L={layout} height={h} parts={mapParts} plan={plan.numbered} shown={shown} ariaLabel={`Câu sai theo Part của đề ${ddmm(test.date)}`}
        onChoose={setSel} onOpenNotebook={setSel} tip={tip} onTip={setTip} />
      <div className="jp-boat-soc" style={{ left: layout.boat[0] - 22, top: layout.boat[1] - 42 }}><span className="il-boat"><Soc state="hi" size={44} gear={gear} /></span></div>

      <div className="jp-card">
        <div className="jp-card__row">
          <small className="jr-kick is-pink">Mất điểm ở đâu?</small>
          <label className="jp-dd">
            <span>{ddmm(test.date)} · {test.testName}</span><i aria-hidden="true">▾</i>
            <select aria-label="Chọn đề" value={test.id} onChange={e => { setPickTest(e.target.value); setSel(null); setTip(null); }}>
              {withParts.map(s => <option key={s.id} value={s.id}>{ddmm(s.date)} · {s.testName}</option>)}
            </select>
          </label>
        </div>
        <h2>{partsHeadline(total, plan.numbered)}</h2>
      </div>

      <div className="jp-sheet" aria-live="polite">
        <div className="jp-sh-h">
          {rank >= 0 || detail.open
            ? <ChestIcon n={rank + 1} open={detail.open} size={40} />
            : <span className="jr-tag" style={{ background: look.bg, color: look.ink }}><WeatherIcon state={state} />{ISLAND_STATE_LABEL[state]}</span>}
          <div>
            <small>{rank >= 0 ? `Chặng ${rank + 1} · ` : ''}Part {shown} · {PART_NAMES[shown]}</small>
            <b>{detail.wrong > 0 ? `${detail.wrong} câu sai` : 'Không sai câu nào'} <span style={{ color: look.ink }}>· {pct}% đúng</span></b>
          </div>
        </div>
        {detail.wrong > 0 && <button type="button" className="rd-btn jp-main" onClick={() => onOpenNotebook(test.testName, shown)}>Xem {detail.wrong} câu sai Part {shown}</button>}
        {shown >= 5 && <button type="button" className="jp-textlink" onClick={() => onPractice(shown as 5 | 6 | 7)}>Bấm giờ Part {shown}</button>}
        <div className="jp-next">
          <span>{next ? `Sau đó: Part ${next} · ${chests[next].wrong} câu sai` : ''}</span>
          <PctLegend className="is-phone" withTitle={false} />
        </div>
      </div>
    </div>
  );
}
