import { useMemo, useState } from 'react';
import type { StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { PART_NAMES, ddmm, fullTests, partSize, wrongCountsByPart } from '../lib/journeyData';

interface Props {
  sessions: StudySession[];
  onOpenNotebook: (testName: string) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onOpenSessionLogger: () => void;
}

const XS = [130, 250, 370, 490, 660, 780, 900], W = 74, B = 430;

/** Từng Part tab (design/previews/mock-journey-tabs.html): wrong answers per Part of one test, worst in pink. */
export function PartsTab({ sessions, onOpenNotebook, onPractice, onOpenSessionLogger }: Props) {
  const withParts = useMemo(() => fullTests(sessions).filter(s => wrongCountsByPart(s)).reverse(), [sessions]);
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<PartNumber | null>(null);
  const test = withParts.find(s => s.id === pick) ?? withParts[0];

  if (!test) {
    return (
      <div className="jr-empty">
        <Soc state="think" size={110} />
        <p>Chưa có đề nào ghi câu sai theo Part. Ghi một đề kèm ảnh kết quả, Sóc sẽ chia câu sai theo từng Part.</p>
        <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
      </div>
    );
  }

  const idx = withParts.indexOf(test);
  const now = wrongCountsByPart(test)!;
  const prevTest = withParts[idx + 1];
  const prev = prevTest ? wrongCountsByPart(prevTest)! : null;
  const recent = withParts.slice(idx, idx + 4).reverse().map(s => wrongCountsByPart(s)!);
  const total = PART_NUMBERS.reduce((sum, p) => sum + now[p], 0);
  const worst = PART_NUMBERS.reduce((w, p) => (now[p] >= now[w] ? p : w), 1 as PartNumber);
  const maxV = Math.max(1, ...PART_NUMBERS.map(p => now[p]));
  const K = Math.min(17, 260 / maxV);
  const reading = worst >= 5 ? worst as 5 | 6 | 7 : null;
  const share = total ? Math.round(now[worst] / total * 100) : 0;

  return (
    <div>
      <div className="jr-hl">
        <div><small className="is-pink">Mất điểm ở đâu?</small>
          <h2>{total ? `Part ${worst} sai nhiều nhất: ${now[worst]} trong ${total} câu sai` : 'Đề này không sai câu nào!'}</h2></div>
        <label className="jr-dd">
          <span className="sr-only">Chọn đề</span>
          <select value={test.id} onChange={e => { setPick(e.target.value); setHover(null); }}>
            {withParts.map(s => <option key={s.id} value={s.id}>Đề {ddmm(s.date)} · {s.testName}</option>)}
          </select>
        </label>
      </div>
      <div className="jr-scene is-parts" onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 1064 640" role="img" aria-label={`Câu sai theo Part của đề ${ddmm(test.date)}`}>
          <path d="M0 545 Q200 520 420 540 T820 530 T1064 520 V640 H0Z" fill="#cdeed2" />
          <path d="M0 598 Q260 576 540 594 T1064 588 V640 H0Z" fill="#b6e3be" />
          <line x1="90" y1={B} x2="1010" y2={B} stroke="#c9d6cc" strokeWidth="2" />
          {PART_NUMBERS.map((p, i) => {
            const v = now[p], x = XS[i], h = Math.max(v * K, 22), isWorst = p === worst && v > 0;
            const c = isWorst ? '#ff7a9c' : p <= 4 ? '#1c8fe3' : '#46b35a';
            const r = Math.min(16, h - 2), L = x - W / 2, R = x + W / 2, tp = B - h, op = hover && hover !== p ? 0.3 : 1;
            const d = prev ? v - prev[p] : 0;
            return (
              <g key={p} className="jr-bar" onMouseEnter={() => setHover(p)} onFocus={() => setHover(p)} tabIndex={0} role="button" aria-label={`Part ${p}: ${v} câu sai`}>
                <rect x={L - 14} y={60} width={W + 28} height={B - 60 + 40} fill="transparent" />
                <path d={`M${L} ${B} V${tp + r} Q${L} ${tp} ${L + r} ${tp} H${R - r} Q${R} ${tp} ${R} ${tp + r} V${B}Z`} fill={c} opacity={op} />
                <text x={x} y={B - h - 14} fontWeight="900" fontSize={isWorst ? 34 : 26} fill={isWorst ? '#d9547a' : '#2f3a33'} textAnchor="middle" opacity={op}>{v}</text>
                <text x={x} y={B + 26} fontWeight="900" fontSize="15" fill="#2f3a33" textAnchor="middle">Part {p}</text>
                {d !== 0 && <g><rect x={x - 22} y={B + 36} width="44" height="22" rx="11" fill="#fff" /><text x={x} y={B + 52} fontWeight="900" fontSize="13" fill={d < 0 ? '#2f8a42' : '#c23c63'} textAnchor="middle">{d > 0 ? '+' : '−'}{Math.abs(d)}</text></g>}
              </g>
            );
          })}
          <path d={`M${XS[0] - W / 2} ${B + 68} V${B + 74} H${XS[3] + W / 2} V${B + 68}`} fill="none" stroke="#1269ad" strokeWidth="2" opacity=".5" />
          <text x={(XS[0] + XS[3]) / 2} y={B + 94} fontWeight="900" fontSize="14" fill="#1269ad" textAnchor="middle">Nghe</text>
          <path d={`M${XS[4] - W / 2} ${B + 68} V${B + 74} H${XS[6] + W / 2} V${B + 68}`} fill="none" stroke="#2f8a42" strokeWidth="2" opacity=".5" />
          <text x={(XS[4] + XS[6]) / 2} y={B + 94} fontWeight="900" fontSize="14" fill="#2f8a42" textAnchor="middle">Đọc</text>
        </svg>
        {hover && (() => {
          const i = hover - 1, leftPct = ((XS[i] + (i >= 5 ? -330 : 50)) / 1064) * 100;
          return (
            <div className="jr-tip" style={{ left: `${leftPct}%` }}>
              <b>Part {hover} · {PART_NAMES[hover]}</b>
              <div className="jr-tip-big">{now[hover]}<span> / {partSize(hover)} câu sai</span></div>
              {prev && <div>Đề trước: <b>{prev[hover]}</b></div>}
              {recent.length > 1 && <div>{recent.length} đề gần đây: {recent.map((r, k) => k === recent.length - 1 ? <b key={k}>{r[hover]}</b> : <span key={k}>{r[hover]} → </span>)}</div>}
              {now[hover] > 0 && <button type="button" className="jr-act2" onClick={() => onOpenNotebook(test.testName)}>Xem câu sai trong Sổ tay</button>}
            </div>
          );
        })()}
        <Soc state="idle" size={80} className="jr-soc" />
        <div className="jr-bub">
          {total ? <>Part {worst} chiếm <b>{share}%</b> số câu sai của đề này.</> : <>Đề này bạn không sai câu nào, quá đỉnh!</>}
          {reading && total > 0 && <button type="button" className="jr-act" onClick={() => onPractice(reading)}>Bấm giờ Part {reading}</button>}
        </div>
      </div>
    </div>
  );
}
