import { useEffect, useMemo, useRef, useState } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { PART_NAMES, ddmm, fullTests, partSize, wrongCountsByPart } from '../lib/journeyData';
import { ISLAND_STATE_LABEL, chestPlan, islandState, partAccuracy, partChests, wrongTrend } from '../lib/islands';
import { PCT_COLOUR, buildMapParts } from '../lib/islandLook';
import { MAP_H, MIN_MAP_W, mapLayout } from '../lib/islandMap';
import { SceneStage } from './SceneStage';
import { IslandMap } from './IslandMap';
import { ChestIcon, PctLegend, WeatherIcon, partsHeadline } from './partsShared';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onOpenSessionLogger: () => void;
  gear?: readonly string[];
}

const TREND_TEXT = { down: 'câu sai đang giảm', up: 'câu sai đang tăng', flat: 'câu sai giữ nguyên' } as const;
const TREND_INK = { down: '#2f8a42', up: '#c23c63', flat: '#7a857e' } as const;
const HELP: Array<[string, string]> = [
  ['big', 'Đảo to là Part có nhiều câu'],
  ['lush', 'Nắng và cây rậm là Part vững'],
  ['sand', 'Mây mưa và cây thưa là Part cần ôn'],
  ['chest', 'Rương là chỗ nên ghé trước, ôn xong thì rương mở và trời quang']
];

/** Từng Part tab (design/previews/journey-v3/parts-islands-v3.html): one island per Part, weather by strength, chests on the Parts to visit first. */
export function PartsTab({ sessions, mistakes, onOpenNotebook, onPractice, onOpenSessionLogger, gear }: Props) {
  const withParts = useMemo(() => fullTests(sessions).filter(s => wrongCountsByPart(s)).reverse(), [sessions]);
  const [pick, setPick] = useState<string | null>(null);
  const [sel, setSel] = useState<PartNumber | null>(null);
  const [tip, setTip] = useState<PartNumber | null>(null);
  const [help, setHelp] = useState(false);
  const intent = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(intent.current), []);
  useEffect(() => {
    if (!help) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [help]);

  const test = withParts.find(s => s.id === pick) ?? withParts[0];
  const now = test ? wrongCountsByPart(test)! : null;
  const chests = useMemo(() => (test && now ? partChests(test, now, mistakes) : null), [test, now, mistakes]);
  const plan = useMemo(() => (chests ? chestPlan(chests) : { numbered: [], opened: [] }), [chests]);
  const mapParts = useMemo(() => (now && chests ? buildMapParts(now, chests, plan.numbered) : null), [now, chests, plan]);

  if (!test || !now || !chests || !mapParts) {
    return (
      <div className="jr-empty jr-empty--sea">
        <svg className="jr-empty__art" viewBox="0 0 880 340" aria-hidden="true">
          <defs><linearGradient id="jr-es" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor="#c3ebff" /><stop offset=".55" stopColor="#94d5f4" /><stop offset="1" stopColor="#65bce8" /></linearGradient></defs>
          <rect width="880" height="340" rx="28" fill="url(#jr-es)" />
          <g fill="#dff6ff" opacity=".55"><ellipse cx="145" cy="120" rx="76" ry="34" /><ellipse cx="730" cy="108" rx="88" ry="38" /><ellipse cx="185" cy="258" rx="68" ry="30" /><ellipse cx="705" cy="248" rx="78" ry="34" /></g>
          <g opacity=".42">
            <ellipse cx="145" cy="116" rx="50" ry="20" fill="#77ca83" /><ellipse cx="730" cy="104" rx="58" ry="24" fill="#f7dfae" />
            <ellipse cx="185" cy="252" rx="44" ry="18" fill="#77ca83" /><ellipse cx="705" cy="242" rx="52" ry="22" fill="#77ca83" />
          </g>
          <path d="M195 130 Q350 95 440 165 T670 118" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="3 12" strokeLinecap="round" opacity=".6" />
          <path d="M230 248 Q420 278 650 242" fill="none" stroke="#fff" strokeWidth="3.5" strokeDasharray="3 12" strokeLinecap="round" opacity=".5" />
        </svg>
        <div className="jr-empty__card">
          <Soc state="think" size={102} gear={gear} />
          <h2>Bản đồ 7 đảo TOEIC đang chờ đề đầu tiên</h2>
          <p>Ghi một đề kèm ảnh kết quả, Sóc sẽ hiện đảo nào đang vững và Part nào cần gỡ trước.</p>
          <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
        </div>
      </div>
    );
  }

  const idx = withParts.indexOf(test);
  const recent = withParts.slice(idx, idx + 4).reverse().map(s => wrongCountsByPart(s)!);
  const total = PART_NUMBERS.reduce((sum, p) => sum + now[p], 0);
  const acc = (p: PartNumber) => partAccuracy(partSize(p), now[p]);
  const defaultPart = plan.numbered[0] ?? PART_NUMBERS.reduce((w, p) => (acc(p) < acc(w) ? p : w), 1 as PartNumber);
  const shown: PartNumber = sel ?? defaultPart;
  const choose = (p: PartNumber) => { setSel(p); };
  const hoverIsland = (p: PartNumber) => { window.clearTimeout(intent.current); intent.current = window.setTimeout(() => choose(p), 110); };
  const leaveIsland = () => window.clearTimeout(intent.current);
  const openNotebook = (p: PartNumber) => onOpenNotebook(test.testName, p);

  const planRows = [
    ...plan.numbered.map((part, i) => ({ part, rank: i + 1 })),
    ...plan.opened.slice(0, 2).map(part => ({ part, rank: 0 }))
  ];
  const detail = chests[shown];
  const state = islandState(acc(shown));
  const look = PCT_COLOUR[state];
  const series = recent.map(r => r[shown]);
  const trend = wrongTrend(series);
  const lo = Math.min(...series), hi = Math.max(...series);
  const spark = series.map((v, i) => [8 + i * (80 / Math.max(1, series.length - 1)), hi === lo ? 15 : 26 - (v - lo) / (hi - lo) * 22] as const);

  return (
    <SceneStage height={MAP_H} minWidth={MIN_MAP_W} className="jr-sea">{W => {
      const L = mapLayout(W);
      return (<>
        <IslandMap device="desktop" L={L} height={MAP_H} parts={mapParts} plan={plan.numbered} shown={shown} ariaLabel={`Câu sai theo Part của đề ${ddmm(test.date)}`}
          onChoose={choose} onHover={hoverIsland} onLeave={leaveIsland} onOpenNotebook={openNotebook} tip={tip} onTip={setTip} />

        <div className="jr-card is-parts">
          <small className="jr-kick is-pink">Mất điểm ở đâu?</small>
          <h2>{partsHeadline(total, plan.numbered)}</h2>
          <label className="jr-dd">
            <span className="sr-only">Chọn đề</span>
            <select value={test.id} onChange={e => { setPick(e.target.value); setSel(null); setTip(null); }}>
              {withParts.map(s => <option key={s.id} value={s.id}>Đề {ddmm(s.date)} · {s.testName}</option>)}
            </select>
          </label>
        </div>

        <div className="jr-boat-soc" style={{ left: L.boat[0] - 34, top: L.boat[1] - 66 }}><span className="il-boat"><Soc state="hi" size={68} gear={gear} /></span></div>

        <div className="jr-side">
        <div className="jr-pn" aria-live="polite">
          <div className="jr-pn-h">
            <div><b>Part {shown}</b><small>{PART_NAMES[shown]} · {partSize(shown)} câu · {shown <= 4 ? 'Nghe' : 'Đọc'}</small></div>
            <span className="jr-tag" style={{ background: look.bg, color: look.ink }}><WeatherIcon state={state} cleared={detail.open} />{ISLAND_STATE_LABEL[state]}</span>
          </div>
          <div className="jr-pn-big"><strong className={detail.wrong === 0 ? 'is-zero' : undefined}>{detail.wrong}</strong><span>câu sai</span></div>
          <div className="jr-acc">
            <div className="jr-acc-bar"><i style={{ width: `${acc(shown)}%`, background: look.fill }} /></div>
            <p style={{ color: look.ink }}>{acc(shown)}% đúng</p>
          </div>
          {trend && (
            <div className="jr-trend">
              <svg viewBox="0 0 96 30" aria-hidden="true"><path d={`M${spark.map(p => `${p[0]} ${p[1]}`).join(' L')}`} fill="none" stroke={TREND_INK[trend]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {spark.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === spark.length - 1 ? 4.5 : 3} fill={i === spark.length - 1 ? TREND_INK[trend] : '#fff'} stroke={TREND_INK[trend]} strokeWidth="2" />)}</svg>
              <span><b style={{ color: TREND_INK[trend] }}>{TREND_TEXT[trend]}</b> qua {series.length} đề</span>
            </div>
          )}
          <div className="jr-pn-btns">
            {shown >= 5 && <button type="button" className="jr-btn" onClick={() => onPractice(shown as 5 | 6 | 7)}>Bấm giờ Part {shown}</button>}
            {detail.wrong > 0
              ? <button type="button" className={'jr-btn' + (shown >= 5 ? ' is-w' : '')} onClick={() => openNotebook(shown)}>Xem câu sai</button>
              : <p className="jr-clean">Part này không sai câu nào.</p>}
          </div>
        </div>
        {planRows.length > 0 && (
          <div className="jr-plan">
            <h4>Lộ trình của Sóc</h4>
            {planRows.map(({ part, rank }) => {
              const c = chests[part], done = c.open;
              return (
                <button key={part} type="button" className={'jr-plan-row' + (done ? ' is-done' : '') + (part === shown ? ' is-on' : '')}
                  aria-pressed={part === shown} onClick={() => choose(part)}>
                  <ChestIcon n={rank} open={done} size={40} />
                  <span className="jr-plan-txt">
                    <b>Part {part} · {PART_NAMES[part]}</b>
                    {!done && <span className="jr-plan-bar"><i style={{ width: `${c.wrong ? c.reviewed / c.wrong * 100 : 0}%` }} /></span>}
                    <small>{done ? 'Đã gỡ hết' : `Đã ôn ${c.reviewed}/${c.wrong} câu`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </div>

        <PctLegend className="is-desktop" />
        <button type="button" className="jr-help" aria-label="Chú thích bản đồ" aria-expanded={help} onClick={() => setHelp(h => !h)}>?</button>
        {help && (
          <div className="jr-helpbox" role="dialog" aria-label="Chú thích bản đồ">
            <b>Đọc bản đồ</b>
            {HELP.map(([k, t]) => <div key={k} className="jr-hrow">{legendIcon(k)}<span>{t}</span></div>)}
            <button type="button" className="jr-hx" aria-label="Đóng chú thích" onClick={() => setHelp(false)}>×</button>
          </div>
        )}
      </>);
    }}</SceneStage>
  );
}

function legendIcon(kind: string) {
  const top = kind === 'sand' ? '#f7dfae' : '#6cc479', side = kind === 'sand' ? '#cf9c62' : '#3f9450';
  return (
    <svg viewBox="0 0 34 26" width="34" height="26" aria-hidden="true">
      {kind === 'chest'
        ? <g transform="translate(17 15)"><rect x="-12" y="-4" width="24" height="14" rx="3" fill="#b8763e" /><path d="M-12 -4 Q0 -17 12 -4Z" fill="#d18f4e" /><rect x="-12" y="-6" width="24" height="4" fill="#ffc83d" /></g>
        : <><ellipse cx="17" cy="16" rx={kind === 'big' ? 16 : 13} ry={kind === 'big' ? 8 : 6} fill={side} /><ellipse cx="17" cy="13" rx={kind === 'big' ? 16 : 13} ry={kind === 'big' ? 8 : 6} fill={top} />
          {kind === 'lush' && <><circle cx="11" cy="9" r="5" fill="#3f9a50" /><circle cx="22" cy="8" r="5.5" fill="#56b265" /><circle cx="28" cy="4" r="3" fill="#ffc83d" /></>}
          {kind === 'sand' && <><path d="M8 7h14a4 4 0 0 0 0-8 6 6 0 0 0-11 1.2A3.5 3.5 0 0 0 8 7z" transform="translate(4 3)" fill="#a3aec0" /><path d="M15 15l-1 3M20 15l-1 3" stroke="#7fa6cf" strokeWidth="1.8" strokeLinecap="round" /></>}</>}
    </svg>
  );
}
