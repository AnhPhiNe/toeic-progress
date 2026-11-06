import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, BookOpen, X } from 'lucide-react';
import type { StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { ContainerScrollCue } from '@/shared/components/ScrollCue';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import { PART_MAX_QUESTIONS, getPracticeParts } from '@/shared/domain/etsScoring';
import { triggerHaptic } from '@/shared/lib/haptics';
import { skillSummary } from '../lib/skillSummary';

const PART_SHORT_TITLES: Record<number, string> = {
  1: 'Part 1 · Mô tả tranh',
  2: 'Part 2 · Hỏi & Đáp',
  3: 'Part 3 · Đoạn hội thoại',
  4: 'Part 4 · Bài nói ngắn',
  5: 'Part 5 · Hoàn thành câu',
  6: 'Part 6 · Điền đoạn văn',
  7: 'Part 7 · Đoạn đơn & đôi/ba'
};

interface SkillDetailModalProps {
  session: StudySession;
  initialSkill?: 'listening' | 'reading';
  onClose: () => void;
}

export function SkillDetailModal({
  session,
  initialSkill = 'listening',
  onClose
}: SkillDetailModalProps) {
  const [skill, setSkill] = useState<'listening' | 'reading'>(initialSkill);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ref = useModalA11y(true, onClose);

  const isListening = skill === 'listening';
  const isFull = session.sessionType === 'FULL_TEST';

  const handleSkillChange = (nextSkill: 'listening' | 'reading') => {
    triggerHaptic(8);
    setSkill(nextSkill);
  };

  // Tính toán dữ liệu Part cho Listening (Part 1-4) hoặc Reading (Part 5-7)
  const partData = useMemo(() => {
    if (isFull && session.partScores) {
      const parts = isListening ? [1, 2, 3, 4] : [5, 6, 7];
      return parts.map(num => {
        const key = `part${num}` as keyof typeof PART_MAX_QUESTIONS;
        const total = PART_MAX_QUESTIONS[key];
        const correct = session.partScores?.[key];
        const percent = correct !== undefined && total > 0 ? Math.round((correct / total) * 100) : 0;
        return {
          part: num,
          title: PART_SHORT_TITLES[num] ?? `Part ${num}`,
          correct,
          total,
          percent
        };
      });
    }

    // Với luyện Part
    const practice = getPracticeParts(session);
    const filter = isListening
      ? practice.filter(p => p.part >= 1 && p.part <= 4)
      : practice.filter(p => p.part >= 5 && p.part <= 7);

    return filter.map(p => {
      const percent = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0;
      return {
        part: p.part,
        title: PART_SHORT_TITLES[p.part] ?? `Part ${p.part}`,
        correct: p.correct,
        total: p.total,
        percent
      };
    });
  }, [isFull, isListening, session]);

  const summary = useMemo(() => skillSummary(session, skill), [session, skill]);

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 animate-backdrop ${PHONE_SHEET_BACKDROP}`}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết ${isListening ? 'Listening' : 'Reading'}: ${session.testName || 'Bài thi'}`}
        className={`flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-slate-100 dark:shadow-[4px_4px_0_0_#cbd5e1] animate-sheet-up sm:animate-modal-pop ${PHONE_SHEET_PANEL}`}
      >
        {/* Header: the test, not the skill — the tabs below say which skill is shown */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-slate-900 bg-slate-50 px-4 py-3.5 sm:px-5 dark:border-slate-300 dark:bg-[#162137]">
          <div className="min-w-0">
            <h3 id="skill-detail-title" className="truncate text-base font-black leading-tight">
              {session.testName || 'Bài thi'}
            </h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
              {session.date.split('-').reverse().join('/')} · {isFull ? 'Full Test' : 'Luyện Part'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết kỹ năng"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {/* Neo tabs: black frame, the chosen skill filled with its colour */}
        <div role="tablist" aria-label="Kỹ năng" className="mx-4 mt-4 grid shrink-0 grid-cols-2 overflow-hidden rounded-xl border-2 border-slate-900 sm:mx-5 dark:border-slate-300">
          {(['listening', 'reading'] as const).map(key => {
            const selected = skill === key;
            const Icon = key === 'listening' ? Headphones : BookOpen;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => handleSkillChange(key)}
                className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 text-[13.5px] font-extrabold transition-colors ${
                  key === 'reading' ? 'border-l-2 border-slate-900 dark:border-slate-300 ' : ''
                }${
                  selected
                    ? key === 'listening' ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-[#111A2C] dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                {key === 'listening' ? 'Listening' : 'Reading'}
                <span className={`text-xs font-semibold ${selected ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                  {key === 'listening' ? 'P1–4' : 'P5–7'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Thân cuộn Modal */}
        <div className="relative min-h-0 flex-1 flex flex-col">
          <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* Khối KPI 3 chỉ số (Neo-Brutalist cao cấp) */}
            <div className="rounded-xl border-2 border-slate-900 bg-white shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#162137] dark:shadow-none overflow-hidden">
              <div className="grid grid-cols-3 divide-x-2 divide-slate-900 dark:divide-slate-700 py-3">
                <div className="text-center px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Điểm
                  </span>
                  <p
                    className={`text-xl font-black mt-0.5 tabular-nums ${
                      isListening ? 'text-indigo-600 dark:text-indigo-400' : 'text-teal-600 dark:text-teal-400'
                    }`}
                  >
                    {summary.scaled ?? '—'}
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">/495</span>
                  </p>
                </div>
                <div className="text-center px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Số câu đúng
                  </span>
                  <p data-testid="skill-correct" className={(summary.correct === undefined ? "text-sm" : "text-xl") + " font-black text-slate-950 dark:text-white mt-0.5 tabular-nums"}>
                    {summary.correct ?? 'Chưa ghi'}
                    {summary.correct !== undefined && <span className="text-xs font-bold text-slate-600 dark:text-slate-300">/{summary.total}</span>}
                  </p>
                </div>
                <div className="text-center px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Chính xác
                  </span>
                  <p data-testid="skill-accuracy" className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {summary.accuracy === undefined ? '—' : `${summary.accuracy.toFixed(1)}%`}
                  </p>
                </div>
              </div>
            </div>

            {/* Danh sách Part (Bỏ card, thanh progress trực quan liền mạch) */}
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-black text-slate-900 dark:text-slate-100">
                  {partData.length} Part {isListening ? 'nghe' : 'đọc'}
                </h4>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {partData.some(p => p.correct !== undefined && p.percent < 65) ? 'Part dưới 65% tô cam' : isFull ? '' : 'Số câu thực tế'}
                </span>
              </div>

              {partData.length > 0 ? (
                partData.map((p, index) => {
                  const isWeak = p.correct !== undefined && p.percent < 65;
                  const barColor = isWeak
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : isListening
                    ? 'bg-indigo-600 dark:bg-indigo-500'
                    : 'bg-teal-600 dark:bg-teal-500';
                  const textColor = isWeak
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-700 dark:text-slate-300';

                  return (
                    <div
                      key={p.part}
                      className={`space-y-1.5 ${
                        index < partData.length - 1 ? 'pb-3 border-b border-slate-100 dark:border-slate-800' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-900 dark:text-white font-extrabold">{p.title}</span>
                        <span className={`font-black tabular-nums ${textColor}`}>
                          {p.correct !== undefined ? `${p.correct} / ${p.total} câu · ${p.percent}%` : 'Chưa ghi'}
                        </span>
                      </div>
                      <div
                        className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/80 dark:border-slate-700"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                          style={{ width: `${Math.min(100, p.percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                  Chưa ghi nhận số câu chi tiết cho kỹ năng này.
                </p>
              )}
            </div>
          </div>
          <ContainerScrollCue containerRef={bodyRef} />
        </div>

      </div>
    </div>,
    document.body
  );
}
