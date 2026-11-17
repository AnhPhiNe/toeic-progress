import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { PhoneSheet } from '@/app/components/phone';
import { usePhoneShell } from '@/app/components/phone/PhoneShellContext';
import { Soc } from '@/shared/ui/soc/Soc';
import {
  PRACTICE_SCORE_SOURCE, SCORE_REFERENCE_SOURCES, convertRawToListeningScore, convertRawToReadingScore, getConcordanceByToeic
} from '@/shared/domain/etsScoring';
import type { StudySession } from '@/shared/types';
import { buildJourney, clampCount, convertTests } from '../lib/convert';
import { buildBandBar } from '../lib/convertBand';
import { ScoreWheel } from './phone/ScoreWheel';
import './phone/convertPhone.css';

/**
 * Quy đổi điểm on phones (design/previews/mock-phone-convert2.html, option B2).
 * One screen: teal result on top, wheels in a white dock below. Logic is the desktop ConvertPage's.
 */
export interface ConvertPhoneProps {
  /** Same data ConvertPage (desktop) receives. */
  sessions?: StudySession[];
  /** The learner's goal total; 990 when none is set. */
  targetScore?: number;
  /** What Sóc wears. */
  gear?: readonly string[];
}

const NONE = '—';
const RECENT = 2;

export function ConvertPhone({ sessions, targetScore, gear = [] }: ConvertPhoneProps) {
  const { goTab } = usePhoneShell();
  const goal = Math.max(10, Math.min(990, targetScore || 990));
  const tests = useMemo(() => convertTests(sessions), [sessions]);
  const recent = tests.slice(0, RECENT);

  const [manual, setManual] = useState<{ listening: number; reading: number } | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const picked = tests.find(t => t.id === pickedId) ?? tests[0] ?? null;
  const listening = manual?.listening ?? picked?.listening ?? 85;
  const reading = manual?.reading ?? picked?.reading ?? 80;
  const selectedId = manual ? null : picked?.id ?? null;

  const setSkill = (skill: 'listening' | 'reading', value: number) =>
    setManual({ listening, reading, [skill]: clampCount(value) });

  const scaledListening = convertRawToListeningScore(listening);
  const scaledReading = convertRawToReadingScore(reading);
  const total = scaledListening + scaledReading;
  const tier = getConcordanceByToeic(scaledListening, scaledReading);
  const journey = useMemo(() => buildJourney(tier?.cefr ?? null), [tier?.cefr]);
  const band = buildBandBar(total, journey);
  const reached = total >= goal;

  const tiles: Array<{ k: string; v: string; c: string }> = [
    { k: 'CEFR', v: tier?.cefr ?? 'Dưới A1', c: '#14b8a6' },
    { k: 'IELTS', v: tier?.ielts ?? NONE, c: '#e0557f' },
    { k: 'VSTEP', v: tier?.vstep ?? NONE, c: '#2f8a42' },
    { k: 'TOEFL', v: tier?.toeflIbt ?? NONE, c: '#7c5ce0' }
  ];

  const back = () => { if (window.history.length > 1) window.history.back(); else goTab('dashboard'); };

  return (
    <div className="rd cvp">
      <section className="cvp__top" aria-label="Kết quả quy đổi">
        <header className="cvp__hd">
          <button type="button" className="cvp__bk" aria-label="Quay lại" onClick={back}><span><ChevronLeft size={20} strokeWidth={3} aria-hidden="true" /></span></button>
          <h1>Quy đổi điểm</h1>
          <button type="button" className="cvp__i" aria-label="Nguồn và cách ước tính" aria-haspopup="dialog" onClick={() => setInfoOpen(true)}><span><Info size={18} aria-hidden="true" /></span></button>
        </header>

        <div className="cvp__tot">
          <div>
            <small>TỔNG TOEIC</small>
            <b data-testid="estimated-total">{total}</b>
            <p>{reached ? `đã chạm mục tiêu ${goal}` : `còn ${goal - total} điểm tới mục tiêu ${goal}`}</p>
          </div>
          <Soc state="idle" size={110} gear={gear} />
        </div>

        <div className="cvp__tiles">
          {tiles.map(t => (
            <div key={t.k} className={'cvp__tile' + (t.v.length > 4 ? ' is-long' : '')} style={{ '--c': t.c } as CSSProperties}>
              <small>{t.k}</small><b>{t.v}</b>
            </div>
          ))}
        </div>

        <div className="cvp__bar">
          <div><span>{band.from}</span><span>{band.mid}</span><span>{band.to}</span></div>
          <div className="cvp__track" role="progressbar" aria-label="Vị trí trong bậc CEFR" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(band.ratio * 100)}>
            <i style={{ width: `${band.ratio * 100}%` }} />
            <u style={{ left: `${band.ratio * 100}%` }} />
          </div>
        </div>
      </section>

      <section className="cvp__dock" aria-label="Nhập số câu đúng">
        <div className="cvp__chips" role="group" aria-label="Lấy số câu từ đề đã làm">
          {recent.map(t => (
            <button type="button" key={t.id} className="cvp__chip" aria-pressed={selectedId === t.id}
              onClick={() => { setPickedId(t.id); setManual(null); }}>{t.name} · {t.dateLabel}</button>
          ))}
          <button type="button" className="cvp__chip" aria-pressed={manual !== null || tests.length === 0}
            onClick={() => setManual(m => m ?? { listening, reading })}>Tự nhập</button>
        </div>
        <div className="cvp__wheels">
          <ScoreWheel label="Nghe" points={`${scaledListening}đ`} color="#1c8fe3" value={listening} onChange={n => setSkill('listening', n)} />
          <ScoreWheel label="Đọc" points={`${scaledReading}đ`} color="#14b8a6" value={reading} onChange={n => setSkill('reading', n)} />
        </div>
        <p className="cvp__cap">Vuốt lên xuống để chọn số câu đúng</p>
      </section>

      {infoOpen && (
        <PhoneSheet title="Cách ước tính" onClose={() => setInfoOpen(false)}>
          <p className="cvp-note">Ước tính theo thang điểm luyện tập của IIBC 2023, chỉ để tham khảo. Mỗi bậc CEFR cần cả tổng điểm lẫn ngưỡng riêng của Nghe và Đọc.</p>
          <p className="cvp-note">Nguồn: <a href={PRACTICE_SCORE_SOURCE} target="_blank" rel="noopener noreferrer">IIBC</a> · <a href={SCORE_REFERENCE_SOURCES.toeic} target="_blank" rel="noopener noreferrer">ETS</a> · <a href={SCORE_REFERENCE_SOURCES.ielts} target="_blank" rel="noopener noreferrer">British Council</a> · <a href={SCORE_REFERENCE_SOURCES.vstep} target="_blank" rel="noopener noreferrer">ULIS–VNU</a></p>
        </PhoneSheet>
      )}
    </div>
  );
}
