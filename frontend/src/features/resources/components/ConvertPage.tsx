import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  PRACTICE_SCORE_SOURCE, convertRawToListeningScore, convertRawToReadingScore, getConcordanceByToeic
} from '@/shared/domain/etsScoring';
import type { StudySession } from '@/shared/types';
import { buildJourney, convertTests, fromShownCount, mrzLine, shortLevelName, toShownCount, clampCount, type InputMode } from '../lib/convert';
import { ConvertSkillCard } from './ConvertSkillCard';
import { ConvertJourney } from './ConvertJourney';
import './convert.css';

/** Quy đổi điểm, desktop (design/previews/mock-convert3.html): a passport book over the CEFR road. */
interface Props {
  sessions?: StudySession[];
  /** The learner's chosen goal total, or null/undefined when none is set. */
  targetScore?: number | null;
  /** What Sóc wears (same outfit as everywhere else). */
  gear?: readonly string[];
}

// The stage is drawn at this size and scaled to fit the window, like the other full pages.
const STAGE_W = 1120;
const STAGE_H = 790;

interface StampProps { shape: 'round' | 'box'; color: string; rotate: number; style: CSSProperties; label: string; value: string; note: string }
function Stamp({ shape, color, rotate, style, label, value, note }: StampProps) {
  return (
    <div className={'cv-stamp' + (shape === 'box' ? ' is-box' : '')} style={{ ...style, ['--c' as string]: color, ['--r' as string]: `${rotate}deg` } as CSSProperties}>
      <div><small>{label}</small><b>{value}</b><em>{note}</em></div>
    </div>
  );
}

export function ConvertPage({ sessions, targetScore, gear = [] }: Props) {
  const goal = typeof targetScore === 'number' && targetScore >= 10 ? Math.max(10, Math.min(990, targetScore)) : null;
  const tests = useMemo(() => convertTests(sessions), [sessions]);
  const recent = tests.slice(0, 2);
  const others = tests.slice(2);

  // The learner's own numbers win; otherwise the picked test, else the newest one, else a middling example.
  const [manual, setManual] = useState<{ listening: number; reading: number } | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mode, setMode] = useState<InputMode>('correct');
  const picked = tests.find(t => t.id === pickedId) ?? tests[0] ?? null;
  const listening = manual?.listening ?? picked?.listening ?? 85;
  const reading = manual?.reading ?? picked?.reading ?? 80;
  const selectedId = manual ? null : picked?.id ?? null;

  const setSkill = (skill: 'listening' | 'reading', next: number) => {
    const value = clampCount(next);
    setManual({ listening, reading, [skill]: value });
  };
  const onShown = (skill: 'listening' | 'reading') => (shown: number) => setSkill(skill, fromShownCount(shown, mode));
  const onStep = (skill: 'listening' | 'reading') => (delta: number) => {
    const current = skill === 'listening' ? listening : reading;
    setSkill(skill, fromShownCount(toShownCount(current, mode) + delta, mode));
  };
  const pick = (id: string) => { setPickedId(id); setManual(null); };

  const readingRef = useRef<HTMLInputElement>(null);
  const scaledListening = convertRawToListeningScore(listening);
  const scaledReading = convertRawToReadingScore(reading);
  const total = scaledListening + scaledReading;
  const tier = getConcordanceByToeic(scaledListening, scaledReading);
  const journey = useMemo(() => buildJourney(tier?.cefr ?? null), [tier?.cefr]);
  const reached = goal !== null && total >= goal;

  // Scale the fixed-size stage to the room the window gives it.
  const panelRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const fit = () => setScale(Math.max(0.5, Math.min(1.15, (panel.clientWidth - 40) / STAGE_W, (panel.clientHeight - 36) / STAGE_H)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const none = '—';
  const ielts = tier?.ielts ?? none;
  const vstep = tier?.vstep ?? none;
  const toefl = tier?.toeflIbt ?? none;
  const nextTier = journey.next;
  const nextNeed = nextTier ? `Sang ${nextTier.cefr} cần ${nextTier.min}+` : 'Cao nhất mà TOEIC đối chiếu';
  const stampKey = (name: string, value: string) => `${name}-${value}`;

  return (
    <div className="rd cv-page">
      <header className="cv-hd">
        <h1>Quy đổi điểm</h1>
        <p>Ước tính theo <a href={PRACTICE_SCORE_SOURCE} target="_blank" rel="noopener noreferrer">IIBC 2023</a> · chỉ để tham khảo</p>
      </header>

      <div className="cv-panel" ref={panelRef}>
        <div className="cv-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <div className="cv-book">
            <div className="cv-pg cv-pg--l">
              <div className="cv-kick">
                <h2>HỘ CHIẾU NGÔN NGỮ · TOEIC L&amp;R</h2>
                <div className="cv-mode" role="group" aria-label="Cách nhập số câu">
                  <button type="button" aria-pressed={mode === 'correct'} onClick={() => setMode('correct')}>Câu đúng</button>
                  <button type="button" aria-pressed={mode === 'wrong'} onClick={() => setMode('wrong')}>Câu sai</button>
                </div>
              </div>

              <section className="cv-top" aria-label="Tổng điểm dự kiến">
                <div>
                  <small>TỔNG ĐIỂM DỰ KIẾN</small>
                  <p><b data-testid="estimated-total">{total}</b><span> / 990</span></p>
                </div>
                {goal !== null ? (
                  <div className="cv-goal">
                    <span>Mục tiêu {goal} · {reached ? <>đã chạm <span aria-hidden="true">🎉</span></> : `còn ${goal - total}`}</span>
                    <div className="cv-goal__bar" role="progressbar" aria-label="Tiến độ tới mục tiêu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(total / goal * 100))}>
                      <i style={{ width: `${Math.min(100, total / goal * 100)}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="cv-goal"><span>Chưa đặt mục tiêu</span></div>
                )}
              </section>

              <div className="cv-pick" role="group" aria-label="Lấy số câu từ đề đã làm">
                <span className="cv-pick__lb">Lấy từ đề:</span>
                {recent.length === 0 && <span className="cv-pick__none">ghi điểm một đề đầy đủ để lấy nhanh ở đây</span>}
                {recent.map(t => (
                  <button type="button" key={t.id} className="cv-chip" aria-pressed={selectedId === t.id} onClick={() => pick(t.id)}
                    title={`${t.name} · Nghe ${t.listening}, Đọc ${t.reading}`}>
                    <span>{t.name}</span> · {t.dateLabel}
                  </button>
                ))}
                {others.length > 0 && (
                  <select className={'cv-chip cv-chip--sel' + (others.some(t => t.id === selectedId) ? ' is-on' : '')} aria-label="Chọn đề khác"
                    value={others.some(t => t.id === selectedId) ? selectedId ?? '' : ''} onChange={event => event.target.value && pick(event.target.value)}>
                    <option value="" disabled>Đề khác ▾</option>
                    {others.map(t => <option key={t.id} value={t.id}>{t.name} · {t.dateLabel}</option>)}
                  </select>
                )}
              </div>

              <ConvertSkillCard skill="listening" mode={mode} correct={listening} points={scaledListening}
                onShown={onShown('listening')} onStep={onStep('listening')} onEnter={() => readingRef.current?.focus()} />
              <ConvertSkillCard skill="reading" mode={mode} correct={reading} points={scaledReading} inputRef={readingRef}
                onShown={onShown('reading')} onStep={onStep('reading')} onEnter={() => readingRef.current?.blur()} />

              <p className="cv-mrz" aria-hidden="true">{mrzLine(scaledListening, scaledReading, total, tier?.cefr ?? null)}</p>
            </div>

            <section className="cv-pg cv-pg--r" aria-label="Thị thực tương đương">
              <h2>THỊ THỰC TƯƠNG ĐƯƠNG</h2>
              <Stamp key={stampKey('cefr', tier?.cefr ?? 'none')} shape="round" color="#14b8a6" rotate={-10} style={{ left: 44, top: 70, width: 170, height: 170 }}
                label="CEFR" value={tier?.cefr ?? 'Dưới A1'} note={tier ? shortLevelName(tier.cefrLevelName).toUpperCase() : 'CHƯA TỚI MỐC A1'} />
              <Stamp key={stampKey('ielts', ielts)} shape="box" color="#e0557f" rotate={8} style={{ left: 270, top: 60, width: 180, height: 130 }}
                label="IELTS" value={ielts} note="THAM KHẢO" />
              <Stamp key={stampKey('vstep', vstep)} shape="box" color="#2f8a42" rotate={-4} style={{ left: 60, top: 310, width: 170, height: 120 }}
                label="VSTEP" value={vstep} note={vstep === none ? 'CHƯA TỚI BẬC 3' : `${tier?.cefr} · VIỆT NAM`} />
              <Stamp key={stampKey('toefl', toefl)} shape="round" color="#7c5ce0" rotate={12} style={{ left: 280, top: 290, width: 170, height: 170 }}
                label="TOEFL iBT" value={toefl} note="THANG 1–6" />
              <p className="cv-foot"><span>Nghe &amp; Đọc cũng cần đạt ngưỡng riêng</span><span>{nextNeed}</span></p>
            </section>
          </div>

          <ConvertJourney journey={journey} total={total} gear={gear} />
        </div>
      </div>
    </div>
  );
}
