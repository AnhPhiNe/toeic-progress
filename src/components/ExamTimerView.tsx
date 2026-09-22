import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Timer, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  PlusCircle, 
  BookOpen, 
  Zap, 
  Flame, 
  Volume2, 
  VolumeX
} from 'lucide-react';
import { PacingRun, PacingPhaseResult } from '../types';
import { addPacingRun, getTodayDateString } from '../utils/storage';
import confetti from 'canvas-confetti';

interface ExamTimerViewProps {
  onOpenSessionLogger: (prefill?: { durationMinutes?: number }) => void;
  theme?: 'light' | 'dark';
}

type TimerPreset = 'FULL_TEST' | 'READING_SECTION' | 'PART5_SPEED' | 'PART7_MARATHON' | 'POMODORO';

interface PresetConfig {
  id: TimerPreset;
  name: string;
  badge: string;
  durationMinutes: number;
  icon: React.ElementType;
  description: string;
  phases: { name: string; startMinute: number; endMinute: number; tip: string }[];
}

const PRESETS: PresetConfig[] = [
  {
    id: 'FULL_TEST',
    name: 'Full Test Chuẩn ETS',
    badge: '120 Phút',
    durationMinutes: 120,
    icon: Timer,
    description: 'Mô phỏng áp lực 200 câu trong 2 tiếng: 45 phút Listening + 75 phút Reading',
    phases: [
      { name: 'Listening (Part 1 - 4)', startMinute: 0, endMinute: 45, tip: 'Đọc trước câu hỏi và đáp án trước khi băng đọc. Tô trực tiếp vào Answer Sheet!' },
      { name: 'Reading Part 5 (Câu 101 - 130)', startMinute: 45, endMinute: 57, tip: 'Tối đa 25-30s/câu. Gặp câu từ vựng khó: loại trừ nhanh và chọn, không dừng quá 45s!' },
      { name: 'Reading Part 6 (Câu 131 - 146)', startMinute: 57, endMinute: 65, tip: 'Đọc lướt cả câu chứa chỗ trống để nắm văn cảnh. Câu điền cả câu cần chú ý liên từ.' },
      { name: 'Reading Part 7 (Câu 147 - 200)', startMinute: 65, endMinute: 120, tip: '55 phút cho 54 câu. Đọc bài đơn trước (25p), bài kép/ba (30p). Quản lý năng lượng cao độ!' }
    ]
  },
  {
    id: 'READING_SECTION',
    name: 'Sprint Reading 75P',
    badge: '75 Phút',
    durationMinutes: 75,
    icon: BookOpen,
    description: 'Luyện 100 câu Reading liên tục không nghỉ, giải quyết triệt để nỗi sợ cháy giờ Part 7',
    phases: [
      { name: 'Part 5 (Câu 101 - 130)', startMinute: 0, endMinute: 12, tip: 'Dưới 12 phút cho 30 câu. Giữ tốc độ phản xạ cao.' },
      { name: 'Part 6 (Câu 131 - 146)', startMinute: 12, endMinute: 20, tip: '8 phút cho 16 câu. Đọc nhanh tiêu đề và đoạn đầu.' },
      { name: 'Part 7 Đơn (Câu 147 - 175)', startMinute: 20, endMinute: 45, tip: '25 phút cho 29 câu bài đơn. Tìm từ khóa quét (scanning).' },
      { name: 'Part 7 Kép & Ba (Câu 176 - 200)', startMinute: 45, endMinute: 75, tip: '30 phút cho 25 câu bài kép/ba. Chú ý liên kết chéo thông tin giữa các văn bản.' }
    ]
  },
  {
    id: 'PART5_SPEED',
    name: 'Tốc Độ Phản Xạ Part 5',
    badge: '12 Phút',
    durationMinutes: 12,
    icon: Zap,
    description: '30 câu ngữ pháp & từ vựng thần tốc. Tiêu chuẩn 990 là hoàn thành dưới 10-12 phút',
    phases: [
      { name: '10 Câu Đầu (101 - 110)', startMinute: 0, endMinute: 3.5, tip: 'Ngữ pháp cơ bản (từ loại, thì). Giải quyết dưới 20s/câu.' },
      { name: '10 Câu Giữa (111 - 120)', startMinute: 3.5, endMinute: 7.5, tip: 'Từ vựng thông dụng và cấu trúc liên từ.' },
      { name: '10 Câu Cuối (121 - 130)', startMinute: 7.5, endMinute: 12, tip: 'Câu hỏi phân hóa cao, từ vựng nâng cao. Bình tĩnh phân tích cấu trúc câu.' }
    ]
  },
  {
    id: 'PART7_MARATHON',
    name: 'Sức Bền Đọc Hiểu Part 7',
    badge: '55 Phút',
    durationMinutes: 55,
    icon: Flame,
    description: '54 câu đọc hiểu chuyên sâu. Thử thách khả năng tập trung và suy luận thông tin chéo',
    phases: [
      { name: 'Bài đọc đơn (147 - 175)', startMinute: 0, endMinute: 25, tip: 'Đọc lướt câu hỏi trước để định vị đoạn văn cần quét thông tin.' },
      { name: 'Đoạn kép & Ba (176 - 200)', startMinute: 25, endMinute: 55, tip: 'Câu hỏi suy luận (inference) thường yêu cầu kết nối ít nhất 2 bài đọc.' }
    ]
  },
  {
    id: 'POMODORO',
    name: 'Pomodoro Ôn Luyện',
    badge: '25 Phút',
    durationMinutes: 25,
    icon: Clock,
    description: '25 phút tập trung cao độ để chữa đề, phân tích bẫy vào Sổ tay hoặc học từ vựng',
    phases: [
      { name: 'Tập trung sâu 100%', startMinute: 0, endMinute: 25, tip: 'Không lướt điện thoại, không đa nhiệm. Hãy giải thích TẠI SAO đáp án đó sai vào sổ tay.' }
    ]
  }
];

export const ExamTimerView: React.FC<ExamTimerViewProps> = ({ onOpenSessionLogger }) => {
  const [selectedPreset, setSelectedPreset] = useState<TimerPreset>('FULL_TEST');
  const activePreset = useMemo(() => PRESETS.find(p => p.id === selectedPreset)!, [selectedPreset]);

  const [totalSeconds, setTotalSeconds] = useState(activePreset.durationMinutes * 60);
  const [secondsRemaining, setSecondsRemaining] = useState(activePreset.durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  /**
   * Mốc thời gian (giây đã trôi) tại lúc người học bấm "Xong pha này".
   * Đây là cách duy nhất biết được thời gian THẬT của từng pha: nếu chỉ để
   * đồng hồ chạy thì mọi pha luôn khớp kế hoạch và dữ liệu vô nghĩa.
   * Một cú bấm mỗi pha, không phải gõ con số nào.
   */
  const [phaseMarks, setPhaseMarks] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetEndTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Khởi tạo AudioContext theo hành vi người dùng tương tác để tránh bị trình duyệt chặn
  const initAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      // Audio context may be restricted
    }
  };

  // Web Audio chime generator
  const playSoundAlert = () => {
    if (!soundEnabledRef.current) return;
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // Audio fallback
    }
  };

  // Cập nhật lại thời gian khi đổi preset
  const handleSelectPreset = (preset: TimerPreset) => {
    setIsRunning(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedPreset(preset);
    const target = PRESETS.find(p => p.id === preset)!;
    setTotalSeconds(target.durationMinutes * 60);
    setSecondsRemaining(target.durationMinutes * 60);
    setPhaseMarks([]);
  };

  const handleToggleTimer = () => {
    initAudio();
    if (!isRunning) {
      targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
      setIsRunning(true);
    } else {
      targetEndTimeRef.current = null;
      setIsRunning(false);
    }
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsRemaining(totalSeconds);
    setPhaseMarks([]);
  };

  const handleAdjustTime = (seconds: number) => {
    setSecondsRemaining(prev => {
      const next = Math.max(0, prev + seconds);
      if (targetEndTimeRef.current !== null) {
        targetEndTimeRef.current = Date.now() + next * 1000;
      }
      return next;
    });
  };

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (targetEndTimeRef.current !== null) {
          const diff = Math.ceil((targetEndTimeRef.current - Date.now()) / 1000);
          if (diff <= 0) {
            setSecondsRemaining(0);
            setIsRunning(false);
            targetEndTimeRef.current = null;
            if (timerRef.current) clearInterval(timerRef.current);
            playSoundAlert();
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          } else {
            setSecondsRemaining(diff);
          }
        }
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Format time
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const formattedTime = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [hours, minutes, seconds]);

  const elapsedSeconds = totalSeconds - secondsRemaining;
  const elapsedMinutes = elapsedSeconds / 60;
  const progressPercent = totalSeconds > 0 ? ((elapsedSeconds / totalSeconds) * 100) : 0;

  // Xác định phase hiện tại
  const currentPhase = useMemo(() => {
    return activePreset.phases.find(
      p => elapsedMinutes >= p.startMinute && elapsedMinutes < p.endMinute
    ) || activePreset.phases[activePreset.phases.length - 1];
  }, [activePreset, elapsedMinutes]);

  const isUrgent = secondsRemaining > 0 && secondsRemaining <= 300; // < 5 phút
  const isFinished = secondsRemaining === 0;

  // Pha mà người học đang thực sự làm, theo số mốc đã đánh dấu
  const markedPhaseIndex = phaseMarks.length;
  const phaseBeingWorked = activePreset.phases[markedPhaseIndex] || null;
  const allPhasesMarked = markedPhaseIndex >= activePreset.phases.length;

  /**
   * Quy đổi các mốc đã bấm thành kết quả từng pha (kế hoạch vs thực tế).
   * Chỉ tính những pha đã được đánh dấu - không suy đoán phần còn lại.
   */
  const buildPhaseResults = (): PacingPhaseResult[] => {
    const results: PacingPhaseResult[] = [];
    let previousMark = 0;

    phaseMarks.forEach((markSeconds, index) => {
      const phase = activePreset.phases[index];
      if (!phase) return;
      const plannedMinutes = phase.endMinute - phase.startMinute;
      const actualMinutes = Math.round(((markSeconds - previousMark) / 60) * 10) / 10;
      results.push({
        name: phase.name,
        plannedMinutes,
        actualMinutes,
        overrunMinutes: Math.round((actualMinutes - plannedMinutes) * 10) / 10
      });
      previousMark = markSeconds;
    });

    return results;
  };

  const handleMarkPhaseDone = () => {
    if (allPhasesMarked) return;
    setPhaseMarks(prev => [...prev, elapsedSeconds]);
    playSoundAlert();
  };

  const handleUndoLastMark = () => {
    setPhaseMarks(prev => prev.slice(0, -1));
  };

  /**
   * Kết thúc lượt: lưu dữ liệu nhịp độ rồi mở form Nhập Điểm kèm thời gian
   * thật đã dùng. Trước đây màn hình này không ghi lại gì cả (SPEC 4.3).
   */
  const handleSubmitAndLog = () => {
    const actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const phases = buildPhaseResults();

    const run: PacingRun = {
      id: `pacing-${Date.now()}`,
      presetId: activePreset.id,
      presetName: activePreset.name,
      date: getTodayDateString(),
      plannedMinutes: activePreset.durationMinutes,
      actualMinutes,
      finishedNaturally: isFinished,
      phases,
      createdAt: new Date().toISOString()
    };

    addPacingRun(run);

    setIsRunning(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);

    // Chỉ Full Test mới điền sẵn thời gian cho form nhập điểm 200 câu
    onOpenSessionLogger(
      activePreset.id === 'FULL_TEST' ? { durationMinutes: actualMinutes } : undefined
    );
  };

  const phaseResultsSoFar = buildPhaseResults();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="ui-card p-5 sm:p-6 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 text-white rounded-2xl relative overflow-hidden shadow-xl border border-blue-500/20">
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
              <Timer className="w-3.5 h-3.5 animate-pulse" />
              <span>Phòng Thi Ảo & Bấm Giờ Chuẩn ETS</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Mô Phỏng Áp Lực Thời Gian Thi TOEIC
            </h2>
            <p className="text-xs sm:text-sm text-blue-200/80 max-w-xl">
              Quản lý nhịp độ làm bài là chìa khóa đạt 900+. Luyện phản xạ phân bổ thời gian chính xác cho từng Part.
            </p>
          </div>

          {/* Quick Primary Log CTA */}
          <button
            onClick={handleSubmitAndLog}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-[0.98] cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nộp Bài & Nhập Điểm (N)</span>
          </button>
        </div>
      </div>

      {/* Preset Mode Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {PRESETS.map(preset => {
          const Icon = preset.icon;
          const isSelected = preset.id === selectedPreset;
          const isLastSingle = preset.id === 'POMODORO';
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                isLastSingle ? 'col-span-2 sm:col-span-1' : ''
              } ${
                isSelected
                  ? 'bg-blue-50/90 dark:bg-blue-950/60 border-blue-400 dark:border-blue-600 shadow-2xs ring-1 ring-blue-500/30'
                  : 'bg-white dark:bg-[#121A2B] border-slate-300/90 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${
                  isSelected 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/80 text-blue-800 dark:text-blue-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {preset.badge}
                </span>
              </div>
              <div>
                <p className={`text-xs font-bold truncate ${
                  isSelected ? 'text-blue-950 dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'
                }`}>
                  {preset.name}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                  {preset.durationMinutes} phút
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Countdown Display Card */}
      <div className="ui-card p-6 sm:p-8 flex flex-col items-center justify-center relative">
        {/* Urgent Alert Banner */}
        {isUrgent && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-center space-x-2 py-1.5 px-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold animate-pulse">
            <AlertTriangle className="w-4 h-4" />
            <span>Còn dưới 5 phút! Hãy nhanh chóng hoàn thành và tô kín toàn bộ Answer Sheet!</span>
          </div>
        )}

        {isFinished && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-center space-x-2 py-1.5 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Hết giờ làm bài! Hãy bấm "Nộp Bài & Nhập Điểm" để ghi nhận và đối chiếu kết quả!</span>
          </div>
        )}

        {/* Digital Clock Display */}
        <div className="my-6 flex flex-col items-center">
          <div className={`font-mono text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight tabular-nums transition-colors ${
            isFinished
              ? 'text-emerald-600 dark:text-emerald-400'
              : isUrgent
              ? 'text-rose-600 dark:text-rose-400 animate-pulse'
              : 'text-slate-900 dark:text-white'
          }`}>
            {formattedTime}
          </div>

          <div className="flex items-center space-x-2 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Đã làm: {Math.floor(elapsedMinutes)} phút</span>
            <span>•</span>
            <span>Tổng: {activePreset.durationMinutes} phút</span>
            <span>•</span>
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              title={soundEnabled ? "Âm thanh báo giờ: Bật" : "Âm thanh báo giờ: Tắt"}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Progress Bar with Phase Markers */}
        <div className="w-full max-w-xl space-y-2 mb-6">
          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
            <div 
              className={`h-full transition-all duration-300 rounded-full ${
                isUrgent 
                  ? 'bg-rose-500' 
                  : 'bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600'
              }`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>

          {/* Phase Markers */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1 font-semibold">
            <span>Bắt đầu</span>
            <span>{Math.round(progressPercent)}% đã trôi qua</span>
            <span>Hoàn thành</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleAdjustTime(-60)}
            disabled={secondsRemaining <= 60}
            className="px-3 py-2 rounded-xl border border-slate-300/90 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
          >
            -1 phút
          </button>

          <button
            onClick={handleToggleTimer}
            className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition active:scale-[0.98] cursor-pointer ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>Tạm Dừng</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current ml-0.5" />
                <span>{secondsRemaining === totalSeconds ? 'Bắt Đầu Làm Bài' : 'Tiếp Tục'}</span>
              </>
            )}
          </button>

          <button
            onClick={handleResetTimer}
            className="p-3 rounded-xl border border-slate-300/90 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Đặt lại thời gian"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleAdjustTime(60)}
            className="px-3 py-2 rounded-xl border border-slate-300/90 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            +1 phút
          </button>
        </div>
      </div>

      {/* Đánh dấu nhịp thật: một cú bấm mỗi khi xong một pha (SPEC 4.3) */}
      <div className="ui-card p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">Ghi Nhịp Thật</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Bấm mỗi khi xong một phần để đo tốc độ thật so với kế hoạch
            </p>
          </div>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
            {markedPhaseIndex}/{activePreset.phases.length} phần
          </span>
        </div>

        {allPhasesMarked ? (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
            Đã ghi đủ {activePreset.phases.length} phần. Bấm "Nộp Bài & Nhập Điểm" để lưu lại nhịp độ lượt này.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleMarkPhaseDone}
              disabled={elapsedSeconds === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer min-w-0"
            >
              <span className="truncate">✓ Xong: {phaseBeingWorked?.name}</span>
            </button>
            {elapsedSeconds === 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Bắt đầu đồng hồ trước đã
              </span>
            )}
          </div>
        )}

        {phaseResultsSoFar.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {phaseResultsSoFar.map((r, i) => {
              const late = r.overrunMinutes > 0;
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-xs min-w-0">
                  <span className="text-slate-600 dark:text-slate-300 truncate min-w-0">{r.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap tabular-nums">
                    <span className="text-slate-400 dark:text-slate-500">
                      {r.actualMinutes}p / {r.plannedMinutes}p
                    </span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded-md ${
                        late
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'
                      }`}
                    >
                      {late ? '+' : ''}{r.overrunMinutes}p
                    </span>
                  </span>
                </div>
              );
            })}
            <button
              onClick={handleUndoLastMark}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition cursor-pointer"
            >
              Hoàn tác mốc vừa bấm
            </button>
          </div>
        )}
      </div>

      {/* Active Phase & Real-Time Strategy Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Part Milestone */}
        <div className="ui-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Giai đoạn làm bài hiện tại
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {currentPhase ? `${currentPhase.startMinute}p - ${currentPhase.endMinute}p` : ''}
            </span>
          </div>

          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{currentPhase?.name}</span>
          </h3>

          <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <span className="font-bold">Mẹo chiến thuật: </span>
            {currentPhase?.tip}
          </div>
        </div>

        {/* Phase Breakdown List */}
        <div className="ui-card p-5 space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Lộ trình phân bổ thời gian ({activePreset.name})
          </span>

          <div className="space-y-2 text-xs">
            {activePreset.phases.map((phase, idx) => {
              const isPassed = elapsedMinutes >= phase.endMinute;
              const isCurrent = elapsedMinutes >= phase.startMinute && elapsedMinutes < phase.endMinute;

              return (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-lg transition ${
                    isCurrent
                      ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : isPassed
                      ? 'text-slate-400 dark:text-slate-500 line-through opacity-75'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${
                      isCurrent ? 'bg-blue-600 animate-pulse' : isPassed ? 'bg-slate-300 dark:bg-slate-700' : 'bg-slate-400'
                    }`} />
                    <span>{phase.name}</span>
                  </div>
                  <span className="text-[11px] font-mono">
                    {phase.startMinute}' - {phase.endMinute}'
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};
