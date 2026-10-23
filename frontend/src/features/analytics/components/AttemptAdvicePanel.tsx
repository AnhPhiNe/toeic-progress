import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, LogIn, Sparkles } from 'lucide-react';
import type { MistakeEntry, ReadingPartType, StudySession } from '@/shared/types';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { analyzeAttempt, analysisFingerprint, attemptAnalysisInput, readAnalysisCache, saveAnalysisCache } from '../services/attemptAnalysis';
import type { AttemptAnalysisReport } from '../services/attemptAnalysis';
import { AttemptAdviceModal } from './AttemptAdviceModal';
import { triggerHaptic } from '@/shared/lib/haptics';

interface Props {
  attempt: StudySession | null;
  mistakes: MistakeEntry[];
  ambiguousCount: number;
  onNavigateToMistakes?: (sources?: string[]) => void;
  onNavigateToTimer?: (part?: ReadingPartType) => void;
  onNavigateToPlan?: () => void;
}

export function AttemptAdvicePanel({ attempt, mistakes, onNavigateToMistakes, onNavigateToTimer, onNavigateToPlan }: Props) {
  const owner = getActiveAccountId();
  const [fingerprint, setFingerprint] = useState('');
  const [preparedScope, setPreparedScope] = useState('');
  const [saved, setSaved] = useState<{ fingerprint: string; generatedAt: string; report: AttemptAnalysisReport } | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [cacheNotice, setCacheNotice] = useState('');
  const [cacheSaved, setCacheSaved] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);

  // Changes to any selected fact invalidate both a cached report and in-flight responses.
  const snapshot = attempt ? JSON.stringify(attemptAnalysisInput(attempt, mistakes)) : '';
  const scope = `${owner ?? ''}\0${snapshot}`;
  const latest = useRef({ snapshot, owner });
  latest.current = { snapshot, owner };

  useEffect(() => {
    const run = ++sequence.current;
    setFingerprint('');
    setPreparedScope('');
    setSaved(null);
    setCacheSaved(false);
    setBusy(false);
    setError('');
    setCacheNotice('');
    if (attempt && owner) {
      void analysisFingerprint(attempt, mistakes).then(value => {
        if (sequence.current !== run || latest.current.snapshot !== snapshot || getActiveAccountId() !== owner) return;
        const cached = readAnalysisCache(owner, attempt.id);
        setFingerprint(value);
        setPreparedScope(scope);
        setSaved(cached);
        setCacheSaved(Boolean(cached));
      }).catch(() => {
        if (sequence.current === run) setError('Chưa chuẩn bị được dữ liệu phân tích trong trình duyệt này.');
      });
    }
    return invalidate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, owner]);

  useEffect(() => {
    setConsent(false);
  }, [owner]);

  const stale = preparedScope === scope && !!saved && saved.fingerprint !== fingerprint;
  const report = preparedScope === scope && saved ? saved.report : null;
  const linked = attempt ? attemptAnalysisInput(attempt, mistakes).notes : [];

  const generate = async () => {
    if (!attempt || !owner || !fingerprint || preparedScope !== scope || busy || !consent) return;
    const run = ++sequence.current;
    const current = () => run === sequence.current && latest.current.snapshot === snapshot && latest.current.owner === owner && getActiveAccountId() === owner;
    setBusy(true);
    setError('');
    setCacheNotice('');
    try {
      const result = await analyzeAttempt(attempt, mistakes, owner, current);
      if (!current()) return;
      const row = { attemptId: attempt.id, fingerprint, generatedAt: new Date().toISOString(), report: result };
      setSaved(row);
      const stored = saveAnalysisCache(owner, row);
      setCacheSaved(stored);
      if (!stored) setCacheNotice('Báo cáo đang hiển thị nhưng chưa lưu được trên trình duyệt.');
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : 'Chưa phân tích được. Dữ liệu vẫn được giữ.');
    } finally {
      if (current()) setBusy(false);
    }
  };

  const handleOpenModal = () => {
    triggerHaptic(8);
    setModalOpen(true);
  };

  return (
    <>
      <section
        aria-label="Chẩn đoán & Gợi ý ôn tập"
        className="rounded-2xl border-2 border-slate-900 bg-white p-3.5 sm:p-4 shadow-[2.5px_2.5px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#cbd5e1] transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          {/* Cột thông tin bên trái */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[1px_1px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14.5px] sm:text-base font-black text-slate-950 dark:text-white">
                  Chẩn đoán & Gợi ý ôn tập
                </h2>
                {report ? (
                  stale ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700">
                      Dữ liệu có thay đổi
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700">
                      ✓ Báo cáo có sẵn
                    </span>
                  )
                ) : owner && attempt ? (
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                    Chưa phân tích
                  </span>
                ) : null}
              </div>

              <p className="mt-0.5 text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 leading-normal max-w-2xl">
                {!attempt
                  ? 'Chọn một lần làm đã lưu để nhận chẩn đoán và gợi ý ôn tập.'
                  : report
                  ? `AI đã đối chiếu ${report.sampledNotes || linked.length} câu sai của đề: chỉ ra bẫy ETS và mẹo tối ưu điểm số.`
                  : owner
                  ? 'Chỉ ra bẫy ETS và chiến lược khắc phục tối ưu theo từng Part.'
                  : 'Đăng nhập và đồng bộ bài thi để nhận gợi ý ôn tập thông minh từ AI.'}
              </p>
            </div>
          </div>

          {/* Cột nút bấm bên phải */}
          <div className="shrink-0 flex items-center justify-end sm:justify-start">
            {!attempt ? (
              <button
                type="button"
                disabled
                className="inline-flex min-h-10 sm:min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-4 text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800/50"
              >
                Chọn lần làm đề
              </button>
            ) : !owner ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <LogIn size={14} aria-hidden="true" />
                Cần đăng nhập
              </span>
            ) : report ? (
              <button
                type="button"
                onClick={handleOpenModal}
                className="w-full sm:w-auto inline-flex min-h-10 sm:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs sm:text-sm font-black text-white shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300"
              >
                <Eye size={14} aria-hidden="true" />
                Xem Báo cáo & Lời khuyên ›
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenModal}
                className="w-full sm:w-auto inline-flex min-h-10 sm:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs sm:text-sm font-black text-white shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300"
              >
                <Sparkles size={14} aria-hidden="true" />
                Phân tích đề này với AI ›
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Modal Chẩn đoán & Gợi ý ôn tập */}
      <AttemptAdviceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        attempt={attempt}
        report={report}
        busy={busy}
        error={error}
        cacheNotice={cacheNotice}
        cacheSaved={cacheSaved}
        stale={stale}
        owner={owner}
        consent={consent}
        setConsent={setConsent}
        onGenerate={() => void generate()}
        linkedNotes={linked}
        onNavigateToMistakes={onNavigateToMistakes}
        onNavigateToTimer={onNavigateToTimer}
        onNavigateToPlan={onNavigateToPlan}
      />
    </>
  );
}
