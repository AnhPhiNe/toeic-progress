import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  Flame,
  BookOpen,
  Volume2,
  VolumeX,
  Trash2,
  TrendingUp,
  X,
  Sparkles,
  Timer,
  Compass,
  Coffee,
  Palmtree,
  Settings,
  BarChart3,
  History,
  Search,
  ChevronDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LabelList
} from 'recharts';
import { PacingRun, ReadingPartType, StudySession } from '@/shared/types';
import { loadPacingRuns, addPacingRun, deletePacingRun, getTodayDateString, addStudySession } from '@/shared/data/storage';
import confetti from 'canvas-confetti';

export interface ReadingPacingViewProps {
  onOpenSessionLogger?: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
  /** Gọi sau khi màn hình này tự ghi buổi học, để App đọc lại thay vì giữ state cũ */
  onSessionsChanged?: () => void;
  theme?: 'light' | 'dark';
  initialPart?: ReadingPartType;
}

export const TomatoIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3C12 4.5 10 5.5 8 5M12 3C12 4.5 14 5.5 16 5M12 1.5V4M10 5C11.5 6 12.5 6 14 5"
      stroke="#15803d"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <ellipse cx="12" cy="14" rx="8" ry="7" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.8" />
    <path d="M8.5 11C9 10 10 9.5 11 9.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const TomatoMascot: React.FC<{ className?: string }> = ({ className = 'w-16 h-16 sm:w-20 sm:h-20' }) => (
  <div className={`relative shrink-0 select-none ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
      <path
        d="M50 10 C50 18 42 22 30 20 C40 25 45 28 48 35 C52 28 57 25 67 20 C55 22 47 18 50 10 Z"
        fill="#15803d"
        stroke="#0f172a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M50 12 L50 25" stroke="#15803d" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M50 30 C20 30 12 48 12 65 C12 85 28 92 50 92 C72 92 88 85 88 65 C88 48 80 30 50 30 Z"
        fill="#f43f5e"
        stroke="#0f172a"
        strokeWidth="3"
      />
      <circle cx="38" cy="58" r="4" fill="#0f172a" />
      <circle cx="62" cy="58" r="4" fill="#0f172a" />
      <circle cx="40" cy="56" r="1.5" fill="#ffffff" />
      <circle cx="64" cy="56" r="1.5" fill="#ffffff" />
      <ellipse cx="30" cy="65" rx="4.5" ry="3" fill="#fda4af" opacity="0.9" />
      <ellipse cx="70" cy="65" rx="4.5" ry="3" fill="#fda4af" opacity="0.9" />
      <path d="M44 66 Q50 72 56 66" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 48 C24 40 32 36 40 36" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  </div>
);

interface PartConfig {
  id: ReadingPartType;
  name: string;
  fullName: string;
  topic: string;
  badge: string;
  icon: React.ElementType;
  defaultMinutes: number;
  totalQuestions: number;
  targetSecPerQuestion: number;
  colorDot: string;
  tip: string;
}

const PART_CONFIGS: PartConfig[] = [
  {
    id: 'POMODORO',
    name: 'Pomodoro',
    fullName: 'Pomodoro: 25 Phút Tập Trung Sâu',
    topic: 'Tập trung sâu',
    badge: '25 phút • Cà chua',
    icon: TomatoIcon,
    defaultMinutes: 25,
    totalQuestions: 0,
    targetSecPerQuestion: 0,
    colorDot: 'bg-rose-500',
    tip: 'Phương pháp Pomodoro: 25 phút tập trung sâu không gián đoạn, sau đó nghỉ ngắn 5 phút. Cứ 4 quả cà chua thì nghỉ dài 15-20 phút!'
  },
  {
    id: 'PART_5',
    name: 'Part 5',
    fullName: 'Part 5: 30 Câu Ngữ Pháp & Từ Vựng',
    topic: 'Ngữ pháp & Từ vựng',
    badge: '12 phút • 30 câu',
    icon: Zap,
    defaultMinutes: 12,
    totalQuestions: 30,
    targetSecPerQuestion: 24,
    colorDot: 'bg-amber-400',
    tip: 'Với câu hỏi từ loại (noun/adj/adv), tuyệt đối không dịch nghĩa cả câu! Nhìn 2 từ trước/sau chỗ trống để xác định ngữ pháp, tối đa 20s/câu.'
  },
  {
    id: 'PART_6',
    name: 'Part 6',
    fullName: 'Part 6: 16 Câu Điền Đoạn Văn',
    topic: 'Điền đoạn văn',
    badge: '8 phút • 16 câu',
    icon: Target,
    defaultMinutes: 8,
    totalQuestions: 16,
    targetSecPerQuestion: 30,
    colorDot: 'bg-sky-400',
    tip: 'Đọc câu đầu đoạn để bắt mạch văn cảnh toàn bài. Với câu điền cả câu, chú ý liên từ kết nối (However, Therefore) và thì của đoạn văn.'
  },
  {
    id: 'PART_7_SINGLE',
    name: 'Part 7A',
    fullName: 'Part 7A: 29 Câu Đoạn Đơn (147-175)',
    topic: 'Đoạn đơn 147-175',
    badge: '25 phút • 29 câu',
    icon: Flame,
    defaultMinutes: 25,
    totalQuestions: 29,
    targetSecPerQuestion: 51,
    colorDot: 'bg-orange-500',
    tip: 'Chiến thuật đoạn đơn: Đọc lướt câu hỏi trước để lấy từ khóa (tên riêng, số tiền, ngày tháng, địa điểm), sau đó quét nhanh bài đọc (scan). Không dịch từng chữ!'
  },
  {
    id: 'PART_7_MULTI',
    name: 'Part 7B',
    fullName: 'Part 7B: 25 Câu Đoạn Đôi & Ba (176-200)',
    topic: 'Đoạn đôi & ba 176-200',
    badge: '30 phút • 25 câu',
    icon: Flame,
    defaultMinutes: 30,
    totalQuestions: 25,
    targetSecPerQuestion: 72,
    colorDot: 'bg-orange-500',
    tip: 'Chiến thuật đoạn kép: Chú ý các câu hỏi chéo thông tin (cross-reference) nối giữa Email và Hóa đơn/Lịch trình. Dành trung bình 70-75s/câu.'
  },
  {
    id: 'PART_7',
    name: 'Part 7',
    fullName: 'Part 7: 54 Câu Đọc Hiểu Chuyên Sâu (147-200)',
    topic: 'Đọc hiểu chuyên sâu',
    badge: '55 phút • 54 câu',
    icon: Flame,
    defaultMinutes: 55,
    totalQuestions: 54,
    targetSecPerQuestion: 61,
    colorDot: 'bg-orange-500',
    tip: 'Chia làm 2 chặng: 25 phút đoạn đơn (147-175), 30 phút đoạn đôi/ba (176-200). Đọc câu hỏi trước để định vị từ khóa quét thông tin (scan).'
  },
  {
    id: 'FULL_READING',
    name: 'Full Reading',
    fullName: 'Full Reading: 100 Câu (Part 5 + 6 + 7)',
    topic: '75 phút Reading',
    badge: '75 phút • 100 câu',
    icon: BookOpen,
    defaultMinutes: 75,
    totalQuestions: 100,
    targetSecPerQuestion: 45,
    colorDot: 'bg-purple-400',
    tip: 'Nguyên tắc sống còn: Không dừng lại ở bất kỳ câu nào quá 60 giây. Nghi ngờ thì đánh dấu và đi tiếp, bảo vệ tối đa 54 câu Part 7!'
  }
];


export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}

const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
};

const POMODORO_SETTINGS_STORAGE_KEY = 'toeic_pomodoro_settings';

function loadPomodoroSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(POMODORO_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_POMODORO_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      workMinutes: Math.max(1, Math.min(180, Number(parsed.workMinutes) || 25)),
      shortBreakMinutes: Math.max(1, Math.min(60, Number(parsed.shortBreakMinutes) || 5)),
      longBreakMinutes: Math.max(1, Math.min(90, Number(parsed.longBreakMinutes) || 15)),
      longBreakInterval: Math.max(1, Math.min(12, Number(parsed.longBreakInterval) || 4)),
    };
  } catch {
    return DEFAULT_POMODORO_SETTINGS;
  }
}

function savePomodoroSettings(settings: PomodoroSettings) {
  try {
    localStorage.setItem(POMODORO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function formatTotalFocusTime(mins: number): string {
  if (mins <= 0) return '0 phút';
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours === 0) return `${mins} phút`;
  if (remainingMins === 0) return `${hours} giờ`;
  return `${hours}h ${remainingMins}p`;
}

export interface PomodoroSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PomodoroSettings;
  onSave: (settings: PomodoroSettings) => void;
}

export const PomodoroSettingsModal: React.FC<PomodoroSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [workMinutes, setWorkMinutes] = useState(settings.workMinutes);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(settings.shortBreakMinutes);
  const [longBreakMinutes, setLongBreakMinutes] = useState(settings.longBreakMinutes);
  const [longBreakInterval, setLongBreakInterval] = useState(settings.longBreakInterval);

  useEffect(() => {
    if (isOpen) {
      setWorkMinutes(settings.workMinutes);
      setShortBreakMinutes(settings.shortBreakMinutes);
      setLongBreakMinutes(settings.longBreakMinutes);
      setLongBreakInterval(settings.longBreakInterval);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setWorkMinutes(DEFAULT_POMODORO_SETTINGS.workMinutes);
    setShortBreakMinutes(DEFAULT_POMODORO_SETTINGS.shortBreakMinutes);
    setLongBreakMinutes(DEFAULT_POMODORO_SETTINGS.longBreakMinutes);
    setLongBreakInterval(DEFAULT_POMODORO_SETTINGS.longBreakInterval);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      workMinutes: Math.max(1, Math.min(180, Number(workMinutes) || 25)),
      shortBreakMinutes: Math.max(1, Math.min(60, Number(shortBreakMinutes) || 5)),
      longBreakMinutes: Math.max(1, Math.min(90, Number(longBreakMinutes) || 15)),
      longBreakInterval: Math.max(1, Math.min(12, Number(longBreakInterval) || 4)),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pomodoro-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-200/80 dark:border-slate-700 shadow-soft dark:shadow-none p-5 sm:p-6 space-y-5 relative">
        <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h3 id="pomodoro-settings-title" className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
              Cài Đặt Thời Gian Pomodoro
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* 1. Thời gian tập trung (Work) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>🍅</span> Thời gian tập trung (Work)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={workMinutes}
                  onChange={e => setWorkMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 text-center font-mono font-bold text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-300 dark:border-rose-800 outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="text-xs font-bold text-slate-500">phút</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[15, 20, 25, 30, 45, 50, 60].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setWorkMinutes(mins)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition cursor-pointer ${
                    workMinutes === mins
                      ? 'border-2 border-rose-500 bg-rose-500 text-white font-bold shadow-xs'
                      : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-900 font-bold'
                  }`}
                >
                  {mins}p
                </button>
              ))}
            </div>
          </div>

          {/* 2. Thời gian nghỉ ngắn (Short break) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>☕</span> Thời gian nghỉ ngắn (Short Break)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={shortBreakMinutes}
                  onChange={e => setShortBreakMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 text-center font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-300 dark:border-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-500">phút</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[3, 5, 10, 15].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setShortBreakMinutes(mins)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition cursor-pointer ${
                    shortBreakMinutes === mins
                      ? 'border-2 border-emerald-500 bg-emerald-500 text-white font-bold shadow-xs'
                      : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-900 font-bold'
                  }`}
                >
                  {mins}p
                </button>
              ))}
            </div>
          </div>

          {/* 3. Thời gian nghỉ dài (Long break) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>🌴</span> Thời gian nghỉ dài (Long Break)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={longBreakMinutes}
                  onChange={e => setLongBreakMinutes(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 text-center font-mono font-bold text-sm text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 rounded-lg border border-sky-300 dark:border-sky-800 outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-xs font-bold text-slate-500">phút</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[10, 15, 20, 30].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setLongBreakMinutes(mins)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition cursor-pointer ${
                    longBreakMinutes === mins
                      ? 'border-2 border-sky-500 bg-sky-500 text-white font-bold shadow-xs'
                      : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-900 font-bold'
                  }`}
                >
                  {mins}p
                </button>
              ))}
            </div>
          </div>

          {/* 4. Chu kỳ nghỉ dài (Interval) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>🔄</span> Nghỉ dài sau mỗi
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={longBreakInterval}
                  onChange={e => setLongBreakInterval(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 text-center font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-300 dark:border-indigo-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-500">phiên</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[2, 3, 4, 5, 6].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setLongBreakInterval(count)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition cursor-pointer ${
                    longBreakInterval === count
                      ? 'border-2 border-indigo-500 bg-indigo-500 text-white font-bold shadow-xs'
                      : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-900 font-bold'
                  }`}
                >
                  {count} phiên
                </button>
              ))}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-3 flex items-center justify-between border-t-2 border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
            >
              Khôi phục mặc định
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white border border-slate-200/80 shadow-soft hover:translate-x-[1px] hover:translate-y-[1px] transition cursor-pointer"
              >
                Lưu & Áp Dụng
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ReadingPacingView: React.FC<ReadingPacingViewProps> = ({
  onOpenSessionLogger,
  onSessionsChanged,
  initialPart = 'PART_5'
}) => {
  const [selectedPart, setSelectedPart] = useState<ReadingPartType>(initialPart);
  const [pomodoroPhase, setPomodoroPhase] = useState<'WORK' | 'SHORT_BREAK' | 'LONG_BREAK'>('WORK');
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(() => loadPomodoroSettings());
  const [isPomodoroSettingsOpen, setIsPomodoroSettingsOpen] = useState(false);
  const [isPomodoroFinishOpen, setIsPomodoroFinishOpen] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState<number>(() => {
    try {
      const today = getTodayDateString();
      const val = localStorage.getItem(`toeic_pomodoro_${today}`);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [totalFocusMinutes, setTotalFocusMinutes] = useState<number>(() => {
    try {
      const today = getTodayDateString();
      const val = localStorage.getItem(`toeic_pomodoro_minutes_${today}`);
      if (val !== null) return parseInt(val, 10);
      const pVal = localStorage.getItem(`toeic_pomodoro_${today}`);
      return (pVal ? parseInt(pVal, 10) : 0) * 25;
    } catch {
      return 0;
    }
  });

  const incrementPomodoro = useCallback((minsAdded: number = 25) => {
    const today = getTodayDateString();
    setCompletedPomodoros(prev => {
      const next = prev + 1;
      try {
        localStorage.setItem(`toeic_pomodoro_${today}`, String(next));
      } catch {
        // ignore
      }
      return next;
    });
    setTotalFocusMinutes(prev => {
      const next = prev + minsAdded;
      try {
        localStorage.setItem(`toeic_pomodoro_minutes_${today}`, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const isLongBreakDue = completedPomodoros > 0 && completedPomodoros % pomodoroSettings.longBreakInterval === 0;

  const cycleProgress = pomodoroPhase === 'WORK'
    ? completedPomodoros % pomodoroSettings.longBreakInterval
    : (completedPomodoros % pomodoroSettings.longBreakInterval || pomodoroSettings.longBreakInterval);

  const activeConfig = useMemo(
    () => PART_CONFIGS.find(p => p.id === selectedPart) || PART_CONFIGS[0],
    [selectedPart]
  );

  const getPomodoroButtonClass = useCallback(() => {
    if (pomodoroPhase === 'SHORT_BREAK') {
      return 'bg-emerald-500 hover:bg-emerald-400 text-white';
    }
    if (pomodoroPhase === 'LONG_BREAK') {
      return 'bg-sky-500 hover:bg-sky-400 text-white';
    }
    return 'bg-rose-500 hover:bg-rose-400 text-white';
  }, [pomodoroPhase]);

  // Timer states
  const [totalSeconds, setTotalSeconds] = useState(activeConfig.defaultMinutes * 60);
  const [secondsRemaining, setSecondsRemaining] = useState(activeConfig.defaultMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Tab states: 3 Tab chính phân định rõ ràng
  const [activeTab, setActiveTab] = useState<'cockpit' | 'history' | 'analytics'>('cockpit');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | ReadingPartType>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [chartPartFilter, setChartPartFilter] = useState<ReadingPartType>('PART_5');
  const [chartAttemptFilter, setChartAttemptFilter] = useState<'ALL' | 'FIRST_ONLY' | 'BEST_ONLY'>('ALL');

  // History runs state
  const [pacingRuns, setPacingRuns] = useState<PacingRun[]>(() => loadPacingRuns());

  // Modal result state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalActualSeconds, setModalActualSeconds] = useState(0);
  const [modalCorrectAnswers, setModalCorrectAnswers] = useState<number>(() => Math.round(activeConfig.totalQuestions * 0.8));
  const [modalTestName, setModalTestName] = useState('');

  // Refs for drift-free timestamp timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetEndTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Web Audio chime generator
  const initAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      // Audio context restricted or unavailable
    }
  }, []);

  const playSoundAlert = useCallback(() => {
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
  }, [initAudio]);

  // Sync initialPart from props
  useEffect(() => {
    if (initialPart && initialPart !== selectedPart) {
      handleSelectPart(initialPart);
    }
  }, [initialPart]);

  const handleSelectPomodoroPhase = useCallback((phase: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK', autoStart: boolean = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPomodoroPhase(phase);

    const mins = phase === 'WORK'
      ? pomodoroSettings.workMinutes
      : phase === 'SHORT_BREAK'
      ? pomodoroSettings.shortBreakMinutes
      : pomodoroSettings.longBreakMinutes;
    const secs = mins * 60;

    setTotalSeconds(secs);
    setSecondsRemaining(secs);

    if (autoStart) {
      initAudio();
      targetEndTimeRef.current = Date.now() + secs * 1000;
      setIsRunning(true);
      setIsPaused(false);
    } else {
      targetEndTimeRef.current = null;
      setIsRunning(false);
      setIsPaused(false);
    }
  }, [initAudio, pomodoroSettings.longBreakMinutes, pomodoroSettings.shortBreakMinutes, pomodoroSettings.workMinutes]);

  // Đổi Part chế độ
  const handleSelectPart = (partId: ReadingPartType) => {
    if (isRunning) {
      const confirmChange = window.confirm('Bạn đang trong lượt bấm giờ. Chuyển phần luyện sẽ làm mới đồng hồ. Bạn có chắc không?');
      if (!confirmChange) return;
    }
    setIsRunning(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedPart(partId);
    if (partId === 'POMODORO') {
      setPomodoroPhase('WORK');
      const newTotalSec = pomodoroSettings.workMinutes * 60;
      setTotalSeconds(newTotalSec);
      setSecondsRemaining(newTotalSec);
    } else {
      const target = PART_CONFIGS.find(p => p.id === partId) || PART_CONFIGS[0];
      const newTotalSec = target.defaultMinutes * 60;
      setTotalSeconds(newTotalSec);
      setSecondsRemaining(newTotalSec);
      setModalCorrectAnswers(Math.round(target.totalQuestions * 0.8));
    }
  };

  const handleSavePomodoroSettings = (newSettings: PomodoroSettings) => {
    setPomodoroSettings(newSettings);
    savePomodoroSettings(newSettings);
    setIsPomodoroSettingsOpen(false);

    // Cập nhật lại thời gian ngay lập tức nếu đang ở chế độ Pomodoro và chưa chạy
    if (selectedPart === 'POMODORO' && !isRunning) {
      const mins = pomodoroPhase === 'WORK'
        ? newSettings.workMinutes
        : pomodoroPhase === 'SHORT_BREAK'
        ? newSettings.shortBreakMinutes
        : newSettings.longBreakMinutes;
      const secs = mins * 60;
      setTotalSeconds(secs);
      setSecondsRemaining(secs);
    }
  };

  // Toggle Bắt đầu / Tạm dừng
  const handleToggleTimer = () => {
    initAudio();
    if (!isRunning) {
      const remaining = secondsRemaining <= 0 ? totalSeconds : secondsRemaining;
      if (secondsRemaining <= 0) {
        setSecondsRemaining(totalSeconds);
      }
      targetEndTimeRef.current = Date.now() + remaining * 1000;
      setIsRunning(true);
      setIsPaused(false);
    } else {
      targetEndTimeRef.current = null;
      setIsRunning(false);
      setIsPaused(true);
    }
  };

  // Làm lại từ đầu
  const handleResetTimer = () => {
    setIsRunning(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsRemaining(totalSeconds);
  };

  // Khi người dùng bấm "Xong Bài & Nhập Điểm" hoặc hoàn thành chu kỳ Pomodoro
  const handleFinishSession = useCallback(() => {
    const elapsed = Math.max(1, totalSeconds - secondsRemaining);
    setIsRunning(false);
    setIsPaused(false);
    targetEndTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);

    if (selectedPart === 'POMODORO') {
      if (pomodoroPhase === 'WORK') {
        incrementPomodoro(pomodoroSettings.workMinutes);
        const pomoRun: PacingRun = {
          id: `pacing-pomodoro-${Date.now()}`,
          presetId: 'POMODORO',
          presetName: 'Phiên Pomodoro',
          date: getTodayDateString(),
          plannedMinutes: pomodoroSettings.workMinutes,
          actualMinutes: pomodoroSettings.workMinutes,
          finishedNaturally: true,
          phases: [],
          createdAt: new Date().toISOString(),
          partType: 'POMODORO',
          testName: 'Tập trung chuyên sâu',
          totalQuestions: 0,
          correctAnswers: 0,
          actualSeconds: pomodoroSettings.workMinutes * 60,
          speedSecPerQuestion: 0,
          accuracyPercent: 100
        };
        const updated = addPacingRun(pomoRun);
        setPacingRuns(updated);

        // Tự động đồng bộ vào StudySession để tính Streak và số phút học trong tuần
        const pomoSession: StudySession = {
          id: `session-pomodoro-${Date.now()}`,
          skillType: 'LR',
          sessionType: 'PART_PRACTICE',
          testName: 'Pomodoro: Tập trung chuyên sâu',
          date: getTodayDateString(),
          durationMinutes: pomodoroSettings.workMinutes,
          notes: `Hoàn thành 1 chu kỳ Pomodoro ${pomodoroSettings.workMinutes} phút`,
          createdAt: new Date().toISOString()
        };
        addStudySession(pomoSession);
        onSessionsChanged?.();
      }
      setSecondsRemaining(totalSeconds);
      setIsPomodoroFinishOpen(true);
      playSoundAlert();
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } else {
      setModalActualSeconds(elapsed);
      setModalCorrectAnswers(Math.round(activeConfig.totalQuestions * 0.8));
      setIsModalOpen(true);
      playSoundAlert();
    }
  }, [activeConfig.totalQuestions, incrementPomodoro, onSessionsChanged, playSoundAlert, pomodoroPhase, pomodoroSettings.workMinutes, secondsRemaining, selectedPart, totalSeconds]);

  // Phím tắt Space để Xong Bài nhanh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Không bắt phím space khi đang focus vào ô input
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'button') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) {
          handleFinishSession();
        } else if (!isModalOpen && !isPomodoroFinishOpen && !isPomodoroSettingsOpen) {
          handleToggleTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFinishSession, isModalOpen, isPomodoroFinishOpen, isPomodoroSettingsOpen, isRunning]);

  // Timer loop chạy timestamp drift-free
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (targetEndTimeRef.current !== null) {
          const diff = Math.ceil((targetEndTimeRef.current - Date.now()) / 1000);
          if (diff <= 0) {
            setSecondsRemaining(0);
            setIsRunning(false);
            setIsPaused(false);
            targetEndTimeRef.current = null;
            if (timerRef.current) clearInterval(timerRef.current);
            playSoundAlert();
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            if (selectedPart === 'POMODORO') {
              if (pomodoroPhase === 'WORK') {
                incrementPomodoro(pomodoroSettings.workMinutes);
                const pomoRun: PacingRun = {
                  id: `pacing-pomodoro-${Date.now()}`,
                  presetId: 'POMODORO',
                  presetName: 'Phiên Pomodoro',
                  date: getTodayDateString(),
                  plannedMinutes: pomodoroSettings.workMinutes,
                  actualMinutes: pomodoroSettings.workMinutes,
                  finishedNaturally: true,
                  phases: [],
                  createdAt: new Date().toISOString(),
                  partType: 'POMODORO',
                  testName: 'Tập trung chuyên sâu',
                  totalQuestions: 0,
                  correctAnswers: 0,
                  actualSeconds: pomodoroSettings.workMinutes * 60,
                  speedSecPerQuestion: 0,
                  accuracyPercent: 100
                };
                const updated = addPacingRun(pomoRun);
                setPacingRuns(updated);

                // Tự động đồng bộ vào StudySession để tính Streak và số phút học trong tuần
                const pomoSession: StudySession = {
                  id: `session-pomodoro-${Date.now()}`,
                  skillType: 'LR',
                  sessionType: 'PART_PRACTICE',
                  testName: 'Pomodoro: Tập trung chuyên sâu',
                  date: getTodayDateString(),
                  durationMinutes: pomodoroSettings.workMinutes,
                  notes: `Hoàn thành 1 chu kỳ Pomodoro ${pomodoroSettings.workMinutes} phút`,
                  createdAt: new Date().toISOString()
                };
                addStudySession(pomoSession);
                onSessionsChanged?.();
              }
              setIsPomodoroFinishOpen(true);
            } else {
              setModalActualSeconds(totalSeconds);
              setModalCorrectAnswers(Math.round(activeConfig.totalQuestions * 0.8));
              setIsModalOpen(true);
            }
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
  }, [activeConfig.totalQuestions, incrementPomodoro, isRunning, onSessionsChanged, playSoundAlert, pomodoroPhase, pomodoroSettings.workMinutes, selectedPart, totalSeconds]);

  // Định dạng hiển thị đồng hồ
  const elapsedSeconds = Math.max(0, totalSeconds - secondsRemaining);
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedTime = `${pad(minutes)}:${pad(seconds)}`;

  // Tiến trình %
  const progressPercent = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;
  const isUrgent = secondsRemaining > 0 && secondsRemaining <= 120; // < 2 phút

  // Lưu lượt luyện từ Modal
  const handleSaveModalResult = () => {
    const safeCorrect = Math.max(0, Math.min(activeConfig.totalQuestions, Number(modalCorrectAnswers) || 0));
    const actualSec = Math.max(1, modalActualSeconds);
    const speed = Math.round((actualSec / activeConfig.totalQuestions) * 10) / 10;
    const accuracy = Math.round((safeCorrect / activeConfig.totalQuestions) * 1000) / 10;

    const newRun: PacingRun = {
      id: `pacing-${Date.now()}`,
      presetId: selectedPart,
      presetName: activeConfig.fullName,
      date: getTodayDateString(),
      plannedMinutes: activeConfig.defaultMinutes,
      actualMinutes: Math.max(1, Math.round(actualSec / 60)),
      finishedNaturally: actualSec >= totalSeconds,
      phases: [],
      createdAt: new Date().toISOString(),
      partType: selectedPart,
      testName: modalTestName.trim() || undefined,
      totalQuestions: activeConfig.totalQuestions,
      correctAnswers: safeCorrect,
      actualSeconds: actualSec,
      speedSecPerQuestion: speed,
      accuracyPercent: accuracy
    };

    const updated = addPacingRun(newRun);
    setPacingRuns(updated);

    // Tự động đồng bộ vào StudySession để duy trì Streak, Dashboard checkmark và Kế hoạch tuần
    const partMap: Record<ReadingPartType, number | undefined> = {
      PART_5: 5,
      PART_6: 6,
      PART_7_SINGLE: 7,
      PART_7_MULTI: 7,
      PART_7: 7,
      FULL_READING: undefined,
      POMODORO: undefined,
      CUSTOM: undefined
    };
    const targetPart = partMap[selectedPart];
    const durationMins = Math.max(1, Math.round(actualSec / 60));

    const newSession: StudySession = {
      id: `session-pacing-${Date.now()}`,
      skillType: 'LR',
      // Sprint Reading không có điểm L/R nên không được tính là Full Test
      sessionType: 'PART_PRACTICE',
      testName: modalTestName.trim()
        ? `[Tốc độ] ${modalTestName.trim()}`
        : `[Luyện tốc độ] ${activeConfig.name}`,
      date: getTodayDateString(),
      durationMinutes: durationMins,
      practiceParts: targetPart ? [{
        part: targetPart as any,
        correct: safeCorrect,
        total: activeConfig.totalQuestions
      }] : undefined,
      notes: `Luyện tốc độ: ${speed}s/câu • Đúng ${safeCorrect}/${activeConfig.totalQuestions} (${accuracy}%)`,
      createdAt: new Date().toISOString()
    };
    addStudySession(newSession);
    onSessionsChanged?.();

    setIsModalOpen(false);
    handleResetTimer();
    setActiveTab('history');

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6']
    });
  };

  // Xóa 1 bản ghi lịch sử
  const handleDeleteRun = (id: string) => {
    const confirmDelete = window.confirm('Bạn có chắc muốn xóa lượt luyện tập này khỏi lịch sử không?');
    if (!confirmDelete) return;
    const updated = deletePacingRun(id);
    setPacingRuns(updated);
  };

  // Phân loại lượt chạy: Tách riêng Reading và Pomodoro
  const readingPacingRuns = useMemo(() => {
    return pacingRuns.filter(r => r.partType !== 'POMODORO' && (r.totalQuestions || 0) > 0 && (r.actualSeconds !== undefined || r.actualMinutes !== undefined || r.speedSecPerQuestion !== undefined));
  }, [pacingRuns]);

  const pomodoroRuns = useMemo(() => {
    return pacingRuns.filter(r => r.partType === 'POMODORO');
  }, [pacingRuns]);


  // Đếm số lượt theo từng Part (gồm cả Pomodoro)
  const partRunCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: pacingRuns.length,
      POMODORO: pomodoroRuns.length
    };
    for (const p of PART_CONFIGS) {
      if (p.id !== 'POMODORO') {
        counts[p.id] = readingPacingRuns.filter(r => r.partType === p.id).length;
      }
    }
    return counts;
  }, [pacingRuns, pomodoroRuns, readingPacingRuns]);

  // Danh sách lượt đã lọc & sắp xếp cho Tab 2 (History Log)
  const filteredPacingRuns = useMemo(() => {
    return pacingRuns
      .filter(run => {
        if (historyFilter !== 'ALL') {
          if (run.partType !== historyFilter) return false;
        }
        if (historySearch.trim()) {
          const q = historySearch.toLowerCase().trim();
          const matchTest = (run.testName || '').toLowerCase().includes(q);
          const matchPart = (run.presetName || '').toLowerCase().includes(q);
          const matchDate = (run.date || '').includes(q);
          if (!matchTest && !matchPart && !matchDate) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime();
        const timeB = new Date(b.createdAt || b.date).getTime();
        return timeB - timeA;
      });
  }, [pacingRuns, historyFilter, historySearch]);

  // Helper lấy thông tin lượt thi và so sánh với lần làm trước đó
  const getRunAttemptInfo = useCallback((run: PacingRun) => {
    const key = `${run.partType}-${(run.testName || 'Luyện tập').trim().toLowerCase()}`;
    const allMatches = readingPacingRuns
      .filter(r => `${r.partType}-${(r.testName || 'Luyện tập').trim().toLowerCase()}` === key)
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime();
        const timeB = new Date(b.createdAt || b.date).getTime();
        return timeA - timeB;
      });

    const attemptIndex = allMatches.findIndex(m => m.id === run.id);
    const attemptNumber = attemptIndex >= 0 ? attemptIndex + 1 : 1;
    const isRetest = attemptNumber > 1;
    const previousRun = isRetest ? allMatches[attemptIndex - 1] : null;

    let speedDiff: number | null = null;
    let correctDiff: number | null = null;

    if (previousRun) {
      const curSpeed = run.speedSecPerQuestion || 0;
      const prevSpeed = previousRun.speedSecPerQuestion || 0;
      if (curSpeed > 0 && prevSpeed > 0) {
        speedDiff = Math.round((curSpeed - prevSpeed) * 10) / 10;
      }
      if (run.correctAnswers !== undefined && previousRun.correctAnswers !== undefined) {
        correctDiff = run.correctAnswers - previousRun.correctAnswers;
      }
    }

    // Thời gian chi tiết (giờ:phút · ngày/tháng)
    let timeLabel = '';
    if (run.createdAt) {
      try {
        const d = new Date(run.createdAt);
        if (!isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const mon = String(d.getMonth() + 1).padStart(2, '0');
          timeLabel = `${hh}:${mm} · ${day}/${mon}`;
        }
      } catch {
        // fallback
      }
    }
    if (!timeLabel) {
      timeLabel = formatOnlyDate(run.date, run.createdAt);
    }

    return {
      attemptNumber,
      isRetest,
      previousRun,
      speedDiff,
      correctDiff,
      timeLabel
    };
  }, [readingPacingRuns]);

  // Lọc lượt làm bài theo bộ lọc (Tất cả / Chỉ lần đầu / Lần tốt nhất)
  const chartFilteredRuns = useMemo(() => {
    if (chartAttemptFilter === 'ALL') {
      return readingPacingRuns;
    }

    const grouped = new Map<string, PacingRun[]>();
    const sorted = [...readingPacingRuns].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.date).getTime();
      const timeB = new Date(b.createdAt || b.date).getTime();
      return timeA - timeB;
    });

    sorted.forEach(r => {
      const key = `${r.partType}-${(r.testName || 'Luyện tập').trim().toLowerCase()}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(r);
    });

    const result: PacingRun[] = [];

    if (chartAttemptFilter === 'FIRST_ONLY') {
      grouped.forEach(runs => {
        if (runs.length > 0) {
          result.push(runs[0]);
        }
      });
    } else if (chartAttemptFilter === 'BEST_ONLY') {
      grouped.forEach(runs => {
        if (runs.length > 0) {
          const best = runs.reduce((top, cur) => {
            const topTotal = top.totalQuestions || 30;
            const curTotal = cur.totalQuestions || 30;
            const topAcc = top.accuracyPercent ?? (topTotal > 0 ? (top.correctAnswers || 0) / topTotal * 100 : 0);
            const curAcc = cur.accuracyPercent ?? (curTotal > 0 ? (cur.correctAnswers || 0) / curTotal * 100 : 0);
            if (curAcc !== topAcc) {
              return curAcc > topAcc ? cur : top;
            }
            const topSpeed = top.speedSecPerQuestion || 999;
            const curSpeed = cur.speedSecPerQuestion || 999;
            return curSpeed < topSpeed ? cur : top;
          }, runs[0]);
          result.push(best);
        }
      });
    }

    return result.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.date).getTime();
      const timeB = new Date(b.createdAt || b.date).getTime();
      return timeB - timeA;
    });
  }, [readingPacingRuns, chartAttemptFilter]);



  // Dữ liệu cho Biểu đồ Combo 2 Trục Y: Khi chọn 1 Part cụ thể (Part 5 / Part 6 / Part 7)
  const chartSingleSpeedData = useMemo(() => {
    const activePart: ReadingPartType = chartPartFilter || 'PART_5';
    const sourceRuns = [...chartFilteredRuns]
      .filter(r => r.partType === activePart)
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime();
        const timeB = new Date(b.createdAt || b.date).getTime();
        return timeA - timeB;
      })
      .slice(-15);

    const pCfg = PART_CONFIGS.find(p => p.id === activePart);
    const target = pCfg?.targetSecPerQuestion || (activePart === 'PART_5' ? 24 : activePart === 'PART_6' ? 30 : 61);
    const defaultTotalQ = pCfg?.totalQuestions || (activePart === 'PART_5' ? 30 : activePart === 'PART_6' ? 16 : 54);

    return sourceRuns.map((r, idx) => {
      const totalQ = r.totalQuestions || defaultTotalQ;
      const actualSec = r.actualSeconds ?? (r.actualMinutes ? r.actualMinutes * 60 : 0);
      const computedSpeed = r.speedSecPerQuestion !== undefined && r.speedSecPerQuestion !== null
        ? r.speedSecPerQuestion
        : (totalQ > 0 ? Math.round((actualSec / totalQ) * 10) / 10 : 0);
      const computedAccuracy = r.accuracyPercent !== undefined && r.accuracyPercent !== null
        ? r.accuracyPercent
        : (totalQ > 0 && r.correctAnswers !== undefined ? Math.round((r.correctAnswers / totalQ) * 1000) / 10 : 0);

      const info = getRunAttemptInfo(r);

      // Tên đề rút gọn cho trục X
      let shortTestName = (r.testName && r.testName !== pCfg?.name && r.testName !== 'Luyện tập')
        ? r.testName.trim()
        : `Đề #${idx + 1}`;
      if (shortTestName.length > 14) {
        shortTestName = shortTestName.slice(0, 12) + '…';
      }

      // Ngày rút gọn (DD/MM) cho dòng 2 của trục X
      let dateShort = '';
      if (r.date) {
        const parts = r.date.split('-');
        if (parts.length === 3) {
          dateShort = `${parts[2]}/${parts[1]}`;
        } else {
          dateShort = r.date;
        }
      } else if (r.createdAt) {
        try {
          const d = new Date(r.createdAt);
          if (!isNaN(d.getTime())) {
            dateShort = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
        } catch {
          // fallback
        }
      }

      // Nhãn trục X: Hiển thị tên bài test + lần làm nếu làm lại
      let xLabel = `#${idx + 1}`;
      if (r.testName && r.testName !== pCfg?.name && r.testName !== 'Luyện tập') {
        const shortName = r.testName.length > 20 ? r.testName.slice(0, 18) + '…' : r.testName;
        xLabel = info.isRetest ? `${shortName} (#${info.attemptNumber})` : shortName;
      } else if (info.isRetest) {
        xLabel = `#${idx + 1} (#${info.attemptNumber})`;
      }

      return {
        id: r.id,
        runLabel: xLabel,
        rawIndex: idx + 1,
        testName: r.testName || pCfg?.name || 'Luyện tập',
        testShortName: shortTestName,
        attemptNumber: info.attemptNumber || 1,
        dateShort,
        partName: pCfg?.name || r.presetName || 'Part',
        partType: r.partType,
        speed: computedSpeed,
        target,
        accuracy: computedAccuracy,
        correctAnswers: r.correctAnswers ?? 0,
        totalQuestions: totalQ,
        date: r.date,
        createdAt: r.createdAt,
        attemptInfo: info
      };
    });
  }, [chartFilteredRuns, chartPartFilter, getRunAttemptInfo]);






  // Định dạng chỉ ngày (DD/MM/YYYY) không hiển thị giờ để bảng luôn tinh gọn
  const formatOnlyDate = (dateStr: string, createdAt?: string) => {
    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    }
    if (createdAt) {
      try {
        const d = new Date(createdAt);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      } catch {
        // fallback
      }
    }
    return dateStr || '';
  };

  // Helper style badge cho Tooltip biểu đồ theo từng Part
  const getPartBadgeClass = (partType?: string) => {
    switch (partType) {
      case 'PART_5':
        return 'bg-amber-100 text-amber-900 border-amber-300/60 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/60';
      case 'PART_6':
        return 'bg-sky-100 text-sky-900 border-sky-300/60 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-700/60';
      case 'PART_7':
      case 'PART_7_SINGLE':
      case 'PART_7_MULTI':
        return 'bg-orange-100 text-orange-900 border-orange-300/60 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700/60';
      case 'POMODORO':
        return 'bg-rose-100 text-rose-900 border-rose-300/60 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60';
      default:
        return 'bg-purple-100 text-purple-900 border-purple-300/60 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700/60';
    }
  };

  // Helper lấy thông tin màu sắc và style của từng Part cho Biểu đồ
  const getPartTheme = (partType?: string) => {
    switch (partType) {
      case 'PART_5':
        return {
          stroke: '#f59e0b',
          fill: '#f59e0b',
          name: 'Part 5',
          target: 24,
          dotClass: 'bg-amber-400',
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300/60 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/60',
        };
      case 'PART_6':
        return {
          stroke: '#0284c7',
          fill: '#0284c7',
          name: 'Part 6',
          target: 30,
          dotClass: 'bg-sky-500',
          badgeClass: 'bg-sky-100 text-sky-900 border-sky-300/60 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-700/60',
        };
      case 'PART_7_SINGLE':
        return {
          stroke: '#ea580c',
          fill: '#ea580c',
          name: 'Part 7A (Đoạn đơn)',
          target: 51,
          dotClass: 'bg-orange-500',
          badgeClass: 'bg-orange-100 text-orange-900 border-orange-300/60 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700/60',
        };
      case 'PART_7_MULTI':
        return {
          stroke: '#ea580c',
          fill: '#ea580c',
          name: 'Part 7B (Đoạn đôi/ba)',
          target: 72,
          dotClass: 'bg-orange-500',
          badgeClass: 'bg-orange-100 text-orange-900 border-orange-300/60 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700/60',
        };
      case 'PART_7':
        return {
          stroke: '#ea580c',
          fill: '#ea580c',
          name: 'Part 7 (Full)',
          target: 61,
          dotClass: 'bg-orange-500',
          badgeClass: 'bg-orange-100 text-orange-900 border-orange-300/60 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700/60',
        };
      case 'POMODORO':
        return {
          stroke: '#f43f5e',
          fill: '#f43f5e',
          name: 'Pomodoro',
          target: 0,
          dotClass: 'bg-rose-500',
          badgeClass: 'bg-rose-100 text-rose-900 border-rose-300/60 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60',
        };
      default:
        return {
          stroke: '#8b5cf6',
          fill: '#8b5cf6',
          name: 'Full Reading',
          target: 45,
          dotClass: 'bg-purple-500',
          badgeClass: 'bg-purple-100 text-purple-900 border-purple-300/60 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700/60',
        };
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 pb-10 animate-fade-in">
      {/* KHUNG MASTER CARD DUY NHẤT: CHẾ ĐỘ ZEN FOCUS TỐI GIẢN */}
      <div className="w-full bg-white dark:bg-[#111A2C] rounded-3xl border-2 border-slate-900 dark:border-slate-200 shadow-[3.5px_3.5px_0px_0px_#0f172a] dark:shadow-[3.5px_3.5px_0px_0px_#cbd5e1] overflow-hidden min-h-[560px] flex flex-col transition-all duration-200">
        
        {/* THANH TAB HEADER: CHUYỂN ĐỔI BÀN LUYỆN TẬP VS LỊCH SỬ & THỐNG KÊ */}
        <div className="px-5 py-3 border-b-2 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="bg-slate-200/90 dark:bg-slate-900 p-1 rounded-xl border-2 border-slate-900 dark:border-slate-700 flex gap-1 flex-wrap">
              <button
                onClick={() => setActiveTab('cockpit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'cockpit'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Timer className="w-3.5 h-3.5" />
                <span>Bàn Luyện Tập</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5 text-blue-500" />
                <span>Lịch Sử Luyện Tập</span>
                {pacingRuns.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200 rounded-full font-black ml-0.5 border border-blue-300 dark:border-blue-700">
                    {pacingRuns.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
                <span>Thống Kê & Biểu Đồ</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="px-3 py-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] hover:-translate-y-0.5 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title={soundEnabled ? 'Âm thanh cảnh báo: Đang Bật' : 'Âm thanh cảnh báo: Đang Tắt'}
            >
              {soundEnabled ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-bold hidden sm:inline">Âm báo: Bật</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] font-bold hidden sm:inline">Âm báo: Tắt</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: BÀN LUYỆN TẬP (ZEN COCKPIT) */}
        {activeTab === 'cockpit' && (
          <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between animate-in fade-in duration-200">
            {/* 1. THANH CHỌN CHẾ ĐỘ ĐỒNG NHẤT CÙNG HÀNG (UNIFIED SINGLE-ROW DOCK) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  <span>Chọn Chế Độ Luyện Reading Hoặc Tập Trung</span>
                </span>
                <span className="hidden sm:inline">ETS Standards • 75 Phút</span>
              </div>

              {/* Dock duy nhất: 4 Part ETS + vạch chia + 2 Chế độ mở rộng */}
              <div className="w-full rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 p-1.5 flex items-center gap-1.5 select-none shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] flex-wrap sm:flex-nowrap">
                {/* Part 5 */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('PART_5')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedPart === 'PART_5'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black -translate-y-0.5'
                      : 'border-2 border-slate-300 dark:border-slate-700 bg-amber-50/70 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 text-amber-950 dark:text-amber-200 font-bold hover:border-slate-400'
                  }`}
                  title="Part 5 (12 phút • 30 câu)"
                >
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
                  <span className="truncate">Part 5</span>
                </button>

                {/* Part 6 */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('PART_6')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedPart === 'PART_6'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-sky-400 text-slate-950 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black -translate-y-0.5'
                      : 'border-2 border-slate-300 dark:border-slate-700 bg-sky-50/70 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-900/50 text-sky-950 dark:text-sky-200 font-bold hover:border-slate-400'
                  }`}
                  title="Part 6 (8 phút • 16 câu)"
                >
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500 shrink-0" />
                  <span className="truncate">Part 6</span>
                </button>

                {/* Part 7A: Đơn */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('PART_7_SINGLE')}
                  className={`flex-1 sm:flex-[1.1] py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedPart === 'PART_7_SINGLE'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-orange-400 text-slate-950 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black -translate-y-0.5'
                      : 'border-2 border-slate-300 dark:border-slate-700 bg-orange-50/70 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/50 text-orange-950 dark:text-orange-200 font-bold hover:border-slate-400'
                  }`}
                  title="7A: Đoạn đơn (25 phút • 29 câu)"
                >
                  <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 shrink-0" />
                  <span className="truncate">7A: Đơn</span>
                </button>

                {/* Part 7B: Đôi / Ba */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('PART_7_MULTI')}
                  className={`flex-1 sm:flex-[1.1] py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedPart === 'PART_7_MULTI' || selectedPart === 'PART_7'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-rose-400 text-slate-950 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black -translate-y-0.5'
                      : 'border-2 border-slate-300 dark:border-slate-700 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 text-rose-950 dark:text-rose-200 font-bold hover:border-slate-400'
                  }`}
                  title="7B: Đôi / Ba (30 phút • 25 câu)"
                >
                  <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
                  <span className="truncate">7B: Đôi/Ba</span>
                </button>

                {/* Vạch ngăn cách dọc tinh tế */}
                <div className="hidden sm:block w-[2px] h-7 bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0"></div>

                {/* Full Reading */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('FULL_READING')}
                  className={`flex-1 sm:flex-initial py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                    selectedPart === 'FULL_READING'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-purple-400 text-slate-950 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] font-black -translate-y-0.5'
                      : 'border-slate-300 dark:border-slate-700 bg-purple-50/70 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/50 text-purple-950 dark:text-purple-200 hover:border-slate-400'
                  }`}
                  title="Full Reading (75 phút • 100 câu)"
                >
                  <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="truncate">Full 75p</span>
                </button>

                {/* Pomodoro */}
                <button
                  type="button"
                  onClick={() => handleSelectPart('POMODORO')}
                  className={`flex-1 sm:flex-initial py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                    selectedPart === 'POMODORO'
                      ? 'border-2 border-slate-900 dark:border-slate-200 bg-red-500 text-white shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] -translate-y-0.5'
                      : 'border-red-200 dark:border-red-900/60 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 hover:border-red-400'
                  }`}
                  title="Phương pháp Pomodoro (25 phút tập trung)"
                >
                  <TomatoIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">Pomodoro</span>
                </button>
              </div>
            </div>

            {/* Đồng hồ số và trạng thái nhịp */}
            <div className="py-2 sm:py-3 text-center relative">
              {/* Pomodoro Phase Selector + Nút Cài Đặt Thời Gian Tùy Ý */}
              {selectedPart === 'POMODORO' && (
                <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-soft dark:shadow-none">
                    <button
                      type="button"
                      onClick={() => handleSelectPomodoroPhase('WORK')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        pomodoroPhase === 'WORK'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>🍅</span>
                      <span>Tập trung ({pomodoroSettings.workMinutes}p)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPomodoroPhase('SHORT_BREAK')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        pomodoroPhase === 'SHORT_BREAK'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Coffee className="w-3.5 h-3.5" />
                      <span>Nghỉ ngắn ({pomodoroSettings.shortBreakMinutes}p)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPomodoroPhase('LONG_BREAK')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        pomodoroPhase === 'LONG_BREAK'
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Palmtree className="w-3.5 h-3.5" />
                      <span>Nghỉ dài ({pomodoroSettings.longBreakMinutes}p)</span>
                      {isLongBreakDue && pomodoroPhase !== 'WORK' && pomodoroPhase !== 'LONG_BREAK' && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-400 text-slate-950 font-bold shadow-xs">
                          Tới lượt!
                        </span>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPomodoroSettingsOpen(true)}
                    className="p-2 sm:px-3 sm:py-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-soft dark:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer flex items-center gap-1.5 font-bold text-xs"
                    title="Cài đặt thời gian Pomodoro tùy ý"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline font-bold">Cài đặt</span>
                  </button>
                </div>
              )}

              {/* Urgent banner if under 2 min */}
              {isUrgent && isRunning && (
                <div className="mb-3 py-1 px-4 bg-rose-500 text-white text-xs font-bold text-center inline-flex items-center justify-center gap-2 rounded-xl animate-pulse">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Còn dưới 2 phút! Khẩn trương hoàn thành và chọn đáp án câu cuối!</span>
                </div>
              )}

              {/* Status bar (Chỉ cho Part 5, 6, 7, Full Reading - ẩn khi ở Pomodoro để tránh thông tin thừa) */}
              {selectedPart !== 'POMODORO' && (
                <div className="flex items-center justify-center mb-2">
                  <div
                    className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border-2 border-slate-900 dark:border-slate-300 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] mb-2 flex-wrap justify-center transition-colors ${
                      selectedPart === 'PART_5'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-slate-950 dark:text-amber-200'
                        : selectedPart === 'PART_6'
                        ? 'bg-sky-100 dark:bg-sky-950/60 text-slate-950 dark:text-sky-200'
                        : selectedPart === 'PART_7_SINGLE'
                        ? 'bg-orange-100 dark:bg-orange-950/60 text-slate-950 dark:text-orange-200'
                        : selectedPart === 'PART_7_MULTI' || selectedPart === 'PART_7'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-slate-950 dark:text-rose-200'
                        : 'bg-purple-100 dark:bg-purple-950/60 text-slate-950 dark:text-purple-200'
                    }`}
                  >
                    {/* Phần nội dung bài thi */}
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 relative">
                        {isRunning && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRunning ? 'bg-emerald-500' : isPaused ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                      </span>
                      <span className="font-black text-xs sm:text-sm">
                        {activeConfig.totalQuestions} câu {activeConfig.topic}
                      </span>
                    </div>

                    <span className="text-slate-400 dark:text-slate-600">•</span>

                    {/* Thẻ Mục Tiêu */}
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide">
                      <span>🎯</span>
                      <span>Mục tiêu ≤ {activeConfig.targetSecPerQuestion}s / câu</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Digital Clock with Tomato Mascot */}
              <div className="flex items-center justify-center gap-3 sm:gap-6 py-2 sm:py-3">
                {selectedPart === 'POMODORO' && (
                  <TomatoMascot
                    className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 ${
                      isRunning ? 'animate-bounce duration-1000' : ''
                    }`}
                  />
                )}
                <div
                  className={`font-black text-7xl sm:text-8xl md:text-9xl tracking-tight select-none tabular-nums transition-colors ${
                    secondsRemaining === 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isUrgent
                      ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {formattedTime}
                </div>
              </div>

              {/* Tactical Segmented Progress bar */}
              <div className="w-full max-w-lg mx-auto mt-2">
                <div className="relative bg-slate-100 dark:bg-slate-800 rounded-2xl h-4 sm:h-5 border-2 border-slate-900 dark:border-slate-200 overflow-hidden shadow-inner p-0.5">
                  <div
                    className={`h-full rounded-xl transition-all duration-300 ${
                      selectedPart === 'POMODORO'
                        ? pomodoroPhase === 'SHORT_BREAK'
                          ? 'bg-emerald-500'
                          : pomodoroPhase === 'LONG_BREAK'
                          ? 'bg-sky-500'
                          : 'bg-rose-500'
                        : isUrgent
                        ? 'bg-rose-500'
                        : selectedPart === 'PART_7' || selectedPart === 'PART_7_SINGLE' || selectedPart === 'PART_7_MULTI'
                        ? 'bg-orange-500 dark:bg-orange-400'
                        : selectedPart === 'PART_6'
                        ? 'bg-sky-500 dark:bg-sky-400'
                        : selectedPart === 'FULL_READING'
                        ? 'bg-purple-500 dark:bg-purple-400'
                        : 'bg-amber-400 dark:bg-amber-300'
                    }`}
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                  {/* Vạch khía phân đoạn 25%, 50%, 75% */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none px-4">
                    <div className="w-0.5 h-full bg-slate-900/20 dark:bg-white/20" />
                    <div className="w-0.5 h-full bg-slate-900/20 dark:bg-white/20" />
                    <div className="w-0.5 h-full bg-slate-900/20 dark:bg-white/20" />
                  </div>
                </div>
                <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5 px-1">
                  <span>Đã qua: {pad(Math.floor(elapsedSeconds / 60))}:{pad(elapsedSeconds % 60)}</span>
                  <span>Còn lại: {Math.max(0, Math.round(100 - progressPercent))}%</span>
                </div>
              </div>

              {/* Pomodoro Session indicator - Phương án B (2-Chip Badge) */}
              {selectedPart === 'POMODORO' && (
                <div className="mt-3.5 flex justify-center">
                  <div className="inline-flex flex-wrap items-center justify-center gap-2.5 px-4 py-1.5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] text-xs font-black text-slate-800 dark:text-slate-200 select-none">
                    <span className="flex items-center gap-1.5 font-black text-rose-600 dark:text-rose-400">
                      <span>🍅</span>
                      <span>Hôm nay:</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm select-none">
                      {Array.from({ length: pomodoroSettings.longBreakInterval }).map((_, i) => (
                        <span
                          key={i}
                          className={
                            i < cycleProgress
                              ? 'scale-110 transition-transform'
                              : 'opacity-25 grayscale'
                          }
                          title={`Quả cà chua ${i + 1} / ${pomodoroSettings.longBreakInterval}`}
                        >
                          🍅
                        </span>
                      ))}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-950 dark:text-rose-200 font-black text-xs border border-rose-300">
                      {completedPomodoros} quả
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-200 dark:bg-amber-900/60 text-slate-950 dark:text-amber-200 font-black text-xs flex items-center gap-1 border border-slate-900/20">
                      <span>⚡</span>
                      <span>{formatTotalFocusTime(totalFocusMinutes)} tập trung</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons (Căn giữa đẹp & không còn huy hiệu Space) */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              {!isRunning && !isPaused ? (
                <button
                  onClick={handleToggleTimer}
                  className={`w-full sm:w-64 py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#0f172a] active:translate-y-0 active:shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedPart === 'POMODORO'
                      ? getPomodoroButtonClass()
                      : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {selectedPart === 'POMODORO'
                      ? pomodoroPhase === 'WORK'
                        ? 'Bắt Đầu Tập Trung'
                        : pomodoroPhase === 'LONG_BREAK'
                        ? 'Bắt Đầu Nghỉ Dài'
                        : 'Bắt Đầu Nghỉ Ngắn'
                      : 'Bắt Đầu Làm Bài'}
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleToggleTimer}
                    className="w-full sm:w-44 py-3.5 px-5 rounded-2xl font-black text-xs sm:text-sm bg-amber-300 hover:bg-amber-200 text-slate-950 border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>Tạm Dừng</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Tiếp Tục</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleFinishSession}
                    className={`w-full sm:w-60 py-3.5 px-5 rounded-2xl font-black text-xs sm:text-sm border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#0f172a] active:translate-y-0 active:shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      selectedPart === 'POMODORO'
                        ? getPomodoroButtonClass()
                        : 'bg-blue-400 hover:bg-blue-300 text-slate-950'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{selectedPart === 'POMODORO' ? 'Hoàn Thành Chu Kỳ' : 'Xong Bài & Nhập Điểm'}</span>
                  </button>

                  <button
                    onClick={handleResetTimer}
                    className="p-3.5 rounded-2xl font-black text-slate-700 dark:text-slate-200 hover:text-slate-950 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-200 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] hover:-translate-y-0.5 transition-all flex items-center justify-center cursor-pointer"
                    title="Làm lại từ đầu"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* DYNAMIC CONTEXTUAL STRATEGY BANNER (1 Mẹo Ngữ Cảnh Động Theo Part) */}
            {selectedPart !== 'POMODORO' ? (
              <div
                className={`p-4 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] flex items-start gap-3 transition-all duration-300 mt-2 ${
                  isRunning ? 'opacity-40 hover:opacity-100' : ''
                } ${
                  selectedPart === 'PART_5'
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : selectedPart === 'PART_6'
                    ? 'bg-sky-50 dark:bg-sky-950/30'
                    : selectedPart === 'PART_7_SINGLE'
                    ? 'bg-orange-50 dark:bg-orange-950/30'
                    : selectedPart === 'PART_7_MULTI' || selectedPart === 'PART_7'
                    ? 'bg-rose-50 dark:bg-rose-950/30'
                    : 'bg-purple-50 dark:bg-purple-950/30'
                }`}
              >
                <span
                  className={`p-2 rounded-xl border border-slate-900 shrink-0 font-black text-sm ${
                    selectedPart === 'PART_5'
                      ? 'bg-amber-400 text-slate-950'
                      : selectedPart === 'PART_6'
                      ? 'bg-sky-400 text-slate-950'
                      : selectedPart === 'PART_7_SINGLE'
                      ? 'bg-orange-400 text-slate-950'
                      : selectedPart === 'PART_7_MULTI' || selectedPart === 'PART_7'
                      ? 'bg-rose-400 text-slate-950'
                      : 'bg-purple-400 text-slate-950'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-slate-950 dark:text-white text-xs sm:text-sm">
                      {activeConfig.fullName}
                    </h4>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-950 text-white dark:bg-slate-800 dark:text-amber-300 border border-slate-900/20">
                      Target: ≤ {activeConfig.targetSecPerQuestion}s/câu
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {activeConfig.tip}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={`p-4 rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-rose-50 dark:bg-rose-950/30 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] flex items-start gap-3 transition-all duration-300 mt-2 ${
                  isRunning ? 'opacity-40 hover:opacity-100' : ''
                }`}
              >
                <span className="p-2 rounded-xl bg-red-500 text-white border border-slate-900 shrink-0 font-black text-sm">
                  <TomatoIcon className="w-4 h-4" />
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-slate-950 dark:text-white text-xs sm:text-sm">
                      Phương Pháp Pomodoro: 25 Phút Tập Trung Sâu
                    </h4>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-950 text-rose-300 border border-slate-900/20">
                      Cà chua 25 phút
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {activeConfig.tip}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LỊCH SỬ LUYỆN TẬP (NHẬT KÝ CHI TIẾT - PHẲNG & TINH GIẢN) */}
        {activeTab === 'history' && (
          <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col animate-in fade-in duration-200">
            {/* Thanh công cụ 1 dòng siêu gọn */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
              {/* Pills lọc tối giản */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Tất cả ({partRunCounts.ALL || 0})
                </button>
                {PART_CONFIGS.map(p => {
                  const isSelected = historyFilter === p.id;
                  const count = partRunCounts[p.id] || 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setHistoryFilter(p.id)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? p.id === 'POMODORO'
                            ? 'bg-rose-500 text-white font-bold border border-slate-200/80 shadow-xs'
                            : p.id === 'PART_5'
                            ? 'bg-amber-300 text-slate-950 font-bold border border-slate-200/80 shadow-xs'
                            : p.id === 'PART_6'
                            ? 'bg-sky-300 text-slate-950 font-bold border border-slate-200/80 shadow-xs'
                            : p.id === 'FULL_READING'
                            ? 'bg-purple-300 text-slate-950 font-bold border border-slate-200/80 shadow-xs'
                            : 'bg-orange-400 text-slate-950 font-bold border border-slate-200/80 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p.id === 'POMODORO' && <span>🍅</span>}
                      <span>{p.id === 'FULL_READING' ? 'Full' : p.name}</span>
                      <span className="font-mono text-[10px] opacity-75">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Tìm kiếm & CTA Luyện mới */}
              <div className="flex items-center gap-2 ml-auto">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Tìm đề thi..."
                    className="pl-7 pr-3 py-1 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 w-36 sm:w-44 focus:w-52 transition-all outline-none text-slate-900 dark:text-white"
                  />
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setActiveTab('cockpit')}
                  className="px-3.5 py-1 rounded-xl font-bold text-xs bg-emerald-400 hover:bg-emerald-300 text-slate-900 border border-slate-200/80 shadow-soft hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Luyện Mới</span>
                </button>
              </div>
            </div>

            {/* Danh sách bản ghi: Dạng bảng 7 cột siêu tinh gọn, tuyệt đối không card lồng card */}
            {filteredPacingRuns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  Chưa có lượt luyện tập nào
                  {historyFilter !== 'ALL' ? ` trong phần ${historyFilter}` : ''}.
                </p>
                <p className="mt-1 text-slate-400">
                  Hãy bấm <b>Luyện Mới</b> để rèn luyện tốc độ ngay!
                </p>
                <button
                  onClick={() => setActiveTab('cockpit')}
                  className="mt-4 px-5 py-2 rounded-xl font-bold text-xs bg-emerald-400 text-slate-900 border border-slate-200/80 shadow-soft cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Bắt Đầu Làm Bài</span>
                </button>
              </div>
            ) : (
              <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-soft dark:shadow-[3px_3px_0px_0px_#334155] max-h-[540px] overflow-y-auto">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b-2 border-slate-900 dark:border-slate-700 text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                        <th className="py-3 px-3 w-28 whitespace-nowrap">Ngày Luyện</th>
                        <th className="py-3 px-3 min-w-[160px]">Đề Thi & Phần Luyện</th>
                        <th className="py-3 px-2.5 w-24 text-center whitespace-nowrap">Thời Gian</th>
                        <th className="py-3 px-2.5 w-24 text-center whitespace-nowrap">Tốc Độ TB</th>
                        <th className="py-3 px-2.5 w-24 text-center whitespace-nowrap">Số Câu Đúng</th>
                        <th className="py-3 px-2.5 w-28 text-center whitespace-nowrap">Tỉ Lệ Đúng</th>
                        <th className="py-3 px-3 w-24 text-right whitespace-nowrap">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredPacingRuns.map(run => {
                        // Dòng phiên Pomodoro
                        if (run.partType === 'POMODORO') {
                          return (
                            <tr
                              key={run.id}
                              className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition group"
                            >
                              <td className="py-3.5 px-3 font-mono text-xs text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                                {formatOnlyDate(run.date, run.createdAt)}
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-rose-500 text-white border border-slate-200/80 shrink-0 shadow-xs flex items-center gap-1">
                                    <span>🍅</span> Pomo
                                  </span>
                                  <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                    {run.testName || 'Tập trung chuyên sâu'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-2.5 text-center font-mono text-base font-bold text-rose-600 dark:text-rose-400 tracking-tight whitespace-nowrap">
                                {run.actualMinutes}:00
                              </td>
                              <td className="py-3.5 px-2.5 text-center text-slate-300 dark:text-slate-600 font-mono text-base font-bold whitespace-nowrap">
                                —
                              </td>
                              <td className="py-3.5 px-2.5 text-center text-slate-300 dark:text-slate-600 font-mono text-base font-bold whitespace-nowrap">
                                —
                              </td>
                              <td className="py-3.5 px-2.5 text-center text-slate-300 dark:text-slate-600 font-mono text-base font-bold whitespace-nowrap">
                                —
                              </td>
                              <td className="py-3.5 px-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleDeleteRun(run.id)}
                                  className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title="Xóa lượt này"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        // Dòng bài thi Reading
                        const partConfig = PART_CONFIGS.find(p => p.id === run.partType) || PART_CONFIGS[0];
                        const totalQ = run.totalQuestions || partConfig.totalQuestions;
                        const correctQ = run.correctAnswers ?? 0;
                        const actualSec = run.actualSeconds ?? run.actualMinutes * 60;
                        const speed = run.speedSecPerQuestion || (totalQ > 0 ? Math.round((actualSec / totalQ) * 10) / 10 : 0);
                        const accuracy = run.accuracyPercent || (totalQ > 0 ? Math.round((correctQ / totalQ) * 1000) / 10 : 0);
                        const actualMinFormatted = `${pad(Math.floor(actualSec / 60))}:${pad(actualSec % 60)}`;

                        const partShort = run.partType === 'PART_5' ? 'P5' : run.partType === 'PART_6' ? 'P6' : run.partType === 'PART_7_SINGLE' ? '7A' : run.partType === 'PART_7_MULTI' ? '7B' : run.partType === 'PART_7' ? 'P7' : 'Full';
                        const partBg = run.partType === 'PART_5' ? 'bg-amber-300 text-slate-950' : run.partType === 'PART_6' ? 'bg-sky-300 text-slate-950' : run.partType === 'PART_7_SINGLE' ? 'bg-orange-300 text-slate-950' : run.partType === 'PART_7_MULTI' ? 'bg-orange-400 text-slate-950' : run.partType === 'PART_7' ? 'bg-orange-400 text-slate-950' : 'bg-purple-300 text-slate-950';

                        return (
                          <tr
                            key={run.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition group"
                          >
                            <td className="py-3.5 px-3 font-mono text-xs text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                              {formatOnlyDate(run.date, run.createdAt)}
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border border-slate-200/80 dark:border-slate-700 shrink-0 shadow-xs ${partBg}`}>
                                  {partShort}
                                </span>
                                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                  {run.testName || 'Luyện đề tự do'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-2.5 text-center font-mono text-base font-bold text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                              {actualMinFormatted}
                            </td>
                            <td className="py-3.5 px-2.5 text-center font-mono text-base font-bold text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                              {speed}s <span className="text-xs font-bold text-slate-400">/câu</span>
                            </td>
                            <td className="py-3.5 px-2.5 text-center font-mono text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {correctQ} <span className="text-xs font-bold text-slate-400 dark:text-slate-500">/ {totalQ}</span>
                            </td>
                            <td className="py-3.5 px-2.5 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-mono font-bold border whitespace-nowrap ${
                                accuracy >= 80
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : accuracy >= 60
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                  : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                              }`}>
                                {accuracy}%
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (run.partType) handleSelectPart(run.partType);
                                    setActiveTab('cockpit');
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                                  title="Luyện lại Part này"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRun(run.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title="Xóa lượt này"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: THỐNG KÊ & BIỂU ĐỒ (NEOBRUTALISM DASHBOARD: BENTO CARDS + HIGH-CONTRAST DUAL CHARTS + TEST BREAKDOWN) */}
        {activeTab === 'analytics' && (
          <div className="p-4 sm:p-6 space-y-4 flex-1 flex flex-col animate-in fade-in duration-200">
            {/* 1. THANH HEADER: TIÊU ĐỀ + CHỌN PART + LỌC LƯỢT LÀM */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-slate-900 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse border border-slate-900"></span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    Hiệu Suất Tốc Độ &amp; Độ Chính Xác
                  </h3>
                  {chartSingleSpeedData.length > 0 && (
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700">
                      Đã luyện {chartSingleSpeedData.length} đề
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Phân tích tương quan giữa phản xạ làm đề (s/câu) và phong độ làm đúng qua từng bài test
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Segmented Pill chọn Part */}
                <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80 dark:border-slate-700 shadow-soft dark:shadow-none">
                  {[
                    { id: 'PART_5', label: 'Part 5' },
                    { id: 'PART_6', label: 'Part 6' },
                    { id: 'PART_7_SINGLE', label: '7A (Đơn)' },
                    { id: 'PART_7_MULTI', label: '7B (Đôi/ba)' },
                    { id: 'PART_7', label: 'Part 7' }
                  ].map(p => {
                    const isSelected = chartPartFilter === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setChartPartFilter(p.id as any)}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dropdown Lọc lượt làm */}
                <div className="relative">
                  <select
                    value={chartAttemptFilter}
                    onChange={e => setChartAttemptFilter(e.target.value as any)}
                    className="appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-1.5 pr-7 outline-none hover:border-slate-700 cursor-pointer shadow-soft dark:shadow-none"
                    title="Lọc loại lượt thi"
                  >
                    <option value="ALL">Tất cả lượt làm</option>
                    <option value="FIRST_ONLY">Chỉ lần đầu</option>
                    <option value="BEST_ONLY">Lần tốt nhất</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* 3. KHU VỰC 2 BIỂU ĐỒ SONG SONG (SỬA LỖI BẸP CỘT, LỖI CẮT CHỮ VÀ MẢNG XANH CHE CHẮN) */}
            {chartSingleSpeedData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-xs neo-card bg-slate-50 dark:bg-slate-800/40 p-6">
                <Zap className="w-8 h-8 mb-2 opacity-50 text-amber-500 animate-bounce" />
                <p className="font-extrabold text-slate-700 dark:text-slate-300 text-sm">Chưa có đủ dữ liệu cho {PART_CONFIGS.find(p => p.id === chartPartFilter)?.name || 'Part'}.</p>
                <p className="text-xs text-slate-400 mt-1">Hãy hoàn thành 1 bài luyện tập để hệ thống hiển thị biểu đồ phân tích trực quan!</p>
              </div>
            ) : (
              (() => {
                const curCfg = PART_CONFIGS.find(p => p.id === chartPartFilter);
                const curTarget = curCfg?.targetSecPerQuestion || (chartPartFilter === 'PART_5' ? 24 : chartPartFilter === 'PART_6' ? 30 : chartPartFilter === 'PART_7_SINGLE' ? 51 : chartPartFilter === 'PART_7_MULTI' ? 72 : 61);
                const curTotalQ = curCfg?.totalQuestions || (chartPartFilter === 'PART_5' ? 30 : chartPartFilter === 'PART_6' ? 16 : chartPartFilter === 'PART_7_SINGLE' ? 29 : chartPartFilter === 'PART_7_MULTI' ? 25 : 54);
                const targetCorrect = Math.round(curTotalQ * 0.8);
                const themeInfo = getPartTheme(chartPartFilter);

                // Speed max domain
                const maxSpeed = Math.max(...chartSingleSpeedData.map(d => d.speed), curTarget);
                const speedYMax = Math.max(Math.ceil((maxSpeed * 1.3) / 5) * 5, 30);

                // Accuracy Y ticks
                const rightTicks = curTotalQ === 30
                  ? [0, 6, 12, 18, 24, 30]
                  : curTotalQ === 16
                  ? [0, 4, 8, 12, 16]
                  : curTotalQ === 29
                  ? [0, 6, 12, 18, 24, 29]
                  : curTotalQ === 25
                  ? [0, 5, 10, 15, 20, 25]
                  : [0, 10, 20, 30, 40, 54];

                // Custom 2-line tick component with overflow protection
                const renderCustomXAxisTick = (props: any) => {
                  const { x, y, payload } = props;
                  const item = chartSingleSpeedData[payload?.index];
                  if (!item) return <g />;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text
                        x={0}
                        y={13}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={800}
                        fill="#0f172a"
                        className="dark:fill-slate-100"
                      >
                        {item.testShortName} <tspan fill="#d97706" fontWeight="bold">(#{item.attemptNumber})</tspan>
                      </text>
                      <text
                        x={0}
                        y={25}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill="#64748b"
                        className="dark:fill-slate-400"
                      >
                        {item.dateShort}
                      </text>
                    </g>
                  );
                };

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      
                      {/* PANEL TRÁI: BIỂU ĐỒ TỐC ĐỘ PHẢN XẠ (SPEED ONLY - SLATE MINIMAL) */}
                      <div className="bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 pb-3 flex flex-col space-y-1.5 transition-all">
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-md border border-slate-400 dark:border-slate-500 inline-block" style={{ backgroundColor: themeInfo.stroke }}></span>
                            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">⏱️ Tốc độ phản xạ (s/câu)</span>
                          </div>
                          <span className="text-[10px] font-extrabold text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800/80 shadow-2xs">
                            Chuẩn ETS: ≤ {curTarget}s
                          </span>
                        </div>

                        <div className="w-full h-72 pt-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartSingleSpeedData} margin={{ top: 20, right: 25, left: -10, bottom: 6 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                              <XAxis
                                dataKey="runLabel"
                                height={38}
                                interval={0}
                                tickLine={false}
                                tick={renderCustomXAxisTick}
                                padding={{ left: 50, right: 50 }}
                              />
                              <YAxis
                                unit="s"
                                domain={[0, speedYMax]}
                                tick={{ fontSize: 10.5, fill: '#d97706', fontWeight: 700 }}
                                tickLine={false}
                              />
                              <ReferenceLine
                                y={curTarget}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.8}
                                label={{ value: `ETS ≤${curTarget}s`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight', fontWeight: 'bold' }}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const d = payload[0].payload;
                                    const isTargetMet = d.speed > 0 && d.speed <= d.target;
                                    const info = d.attemptInfo;
                                    const badgeStyle = getPartBadgeClass(d.partType);
                                    return (
                                      <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl text-xs space-y-2 min-w-[210px] border border-slate-700">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${badgeStyle}`}>
                                              {d.partName}
                                            </span>
                                            <span className="font-bold text-amber-300 truncate max-w-[100px]">{d.testName}</span>
                                          </div>
                                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                                            {info?.isRetest ? `Lần ${info.attemptNumber}` : 'Lần 1'} · {d.dateShort}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between pt-0.5">
                                          <span className="text-slate-300">Tốc độ:</span>
                                          <div className="flex items-center gap-1">
                                            <span className="font-mono font-bold text-amber-400 text-sm">{d.speed}s</span>
                                            <span className="text-[10px] text-slate-400">/câu</span>
                                            <span className={`w-2 h-2 rounded-full ${isTargetMet ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                                          <span>Chuẩn ETS:</span>
                                          <span>≤ {d.target}s / câu</span>
                                        </div>
                                        {info?.isRetest && info?.speedDiff !== null && (
                                          <div className="pt-1.5 border-t border-slate-800 text-[10.5px] flex justify-between text-slate-300">
                                            <span>So với Lần 1:</span>
                                            <span className="font-bold text-amber-400">
                                              {info.speedDiff <= 0 ? `Nhanh hơn ${Math.abs(info.speedDiff)}s` : `Chậm hơn ${info.speedDiff}s`}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar
                                dataKey="speed"
                                minPointSize={24}
                                fill={themeInfo.stroke}
                                stroke="#475569"
                                strokeWidth={1}
                                radius={[5, 5, 0, 0]}
                                maxBarSize={44}
                                name="Tốc độ (s/câu)"
                              >
                                <LabelList
                                  dataKey="speed"
                                  position="top"
                                  offset={6}
                                  formatter={(val: any) => val > 0 ? `${val}s` : ''}
                                  style={{ fontSize: 10, fontWeight: 900, fill: '#b45309' }}
                                />
                              </Bar>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* PANEL PHẢI: BIỂU ĐỒ SỐ CÂU ĐÚNG & PHONG ĐỘ (ACCURACY ONLY - SLATE MINIMAL) */}
                      <div className="bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 pb-3 flex flex-col space-y-1.5 transition-all">
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500 border border-slate-400 dark:border-slate-500 inline-block"></span>
                            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">🎯 Số câu đúng &amp; Phong độ</span>
                          </div>
                          <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/80 shadow-2xs">
                            Mục tiêu: ≥ {targetCorrect}/{curTotalQ} (80%)
                          </span>
                        </div>

                        <div className="w-full h-72 pt-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartSingleSpeedData} margin={{ top: 20, right: 25, left: -10, bottom: 6 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                              <XAxis
                                dataKey="runLabel"
                                height={38}
                                interval={0}
                                tickLine={false}
                                tick={renderCustomXAxisTick}
                                padding={{ left: 50, right: 50 }}
                              />
                              <YAxis
                                domain={[0, curTotalQ]}
                                ticks={rightTicks}
                                tick={{ fontSize: 10.5, fill: '#059669', fontWeight: 700 }}
                                tickLine={false}
                              />
                              <ReferenceLine
                                y={targetCorrect}
                                stroke="#10b981"
                                strokeDasharray="4 4"
                                strokeWidth={1.8}
                                label={{ value: `Mục tiêu ≥${targetCorrect}`, fill: '#059669', fontSize: 10, position: 'insideTopRight', fontWeight: 'bold' }}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const d = payload[0].payload;
                                    const info = d.attemptInfo;
                                    const badgeStyle = getPartBadgeClass(d.partType);
                                    return (
                                      <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl text-xs space-y-2 min-w-[210px] border border-slate-700">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${badgeStyle}`}>
                                              {d.partName}
                                            </span>
                                            <span className="font-bold text-emerald-300 truncate max-w-[100px]">{d.testName}</span>
                                          </div>
                                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                                            {info?.isRetest ? `Lần ${info.attemptNumber}` : 'Lần 1'} · {d.dateShort}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between pt-0.5">
                                          <span className="text-slate-300">Số câu đúng:</span>
                                          <div className="flex items-baseline gap-1">
                                            <span className="font-mono font-bold text-emerald-400 text-sm">
                                              {d.correctAnswers}/{d.totalQuestions}
                                            </span>
                                            <span className="font-mono text-[10px] text-emerald-300/80">({d.accuracy}%)</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                                          <span>Mục tiêu 80%:</span>
                                          <span>≥ {targetCorrect} câu</span>
                                        </div>
                                        {info?.isRetest && info?.correctDiff !== null && (
                                          <div className="pt-1.5 border-t border-slate-800 text-[10.5px] flex justify-between text-slate-300">
                                            <span>So với Lần 1:</span>
                                            <span className={info.correctDiff >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                                              {info.correctDiff >= 0 ? `+${info.correctDiff} câu` : `${info.correctDiff} câu`}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="correctAnswers"
                                stroke="#059669"
                                strokeWidth={3}
                                fill="#10b981"
                                fillOpacity={0.06}
                                dot={{ r: 5, stroke: '#334155', strokeWidth: 1.8, fill: '#10b981' }}
                                activeDot={{ r: 7.5, stroke: '#0f172a', strokeWidth: 2.5, fill: '#34d399' }}
                                name="Số câu đúng"
                              >
                                <LabelList
                                  dataKey="correctAnswers"
                                  position="top"
                                  offset={10}
                                  formatter={(val: any) => `${val}/${curTotalQ}`}
                                  style={{ fontSize: 10, fontWeight: 900, fill: '#047857' }}
                                />
                              </Area>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                    </div>
                    <div className="text-center text-[10px] text-slate-400 pt-0.5">
                      💡 Cột thấp hơn = Phản xạ nhanh hơn · Điểm cao hơn = Làm đúng nhiều câu hơn
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>


      {/* 5. POPUP MODAL NHẬP ĐIỂM (Chỉ bật lên sau khi bấm "Xong bài") */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft dark:shadow-none p-6 w-full max-w-md relative animate-in fade-in zoom-in-95 duration-150">
            {/* Nút đóng */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Modal */}
            <div className="text-center mb-5">
              <div className="inline-flex p-2.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-xl mb-2 border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold tracking-tight">Hoàn Thành {activeConfig.fullName}!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Thời gian thực tế:{' '}
                <b className="font-mono text-slate-900 dark:text-white font-bold">
                  {pad(Math.floor(modalActualSeconds / 60))}m {pad(modalActualSeconds % 60)}s
                </b>{' '}
                {modalActualSeconds <= totalSeconds ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    (Sớm hơn hạn định {Math.floor((totalSeconds - modalActualSeconds) / 60)}m! 🚀)
                  </span>
                ) : (
                  <span className="text-rose-500 font-bold">
                    (Quá hạn định {Math.floor((modalActualSeconds - totalSeconds) / 60)}m ⚠️)
                  </span>
                )}
              </p>
            </div>

            {/* Form nhập điểm 5 giây */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số câu làm đúng:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max={activeConfig.totalQuestions}
                    value={modalCorrectAnswers}
                    onChange={e => setModalCorrectAnswers(Math.max(0, Math.min(activeConfig.totalQuestions, Number(e.target.value) || 0)))}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveModalResult(); }}
                    className="w-24 text-center font-mono font-bold text-xl p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:bg-amber-50 dark:focus:bg-slate-700"
                    autoFocus
                  />
                  <span className="text-sm font-bold text-slate-500">/ {activeConfig.totalQuestions} câu</span>

                  <div className="ml-auto text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Độ chính xác</div>
                    <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.round((modalCorrectAnswers / activeConfig.totalQuestions) * 1000) / 10}%
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên đề thi (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="ví dụ: ETS 2024 Test 02..."
                  value={modalTestName}
                  onChange={e => setModalTestName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveModalResult(); }}
                  className="w-full text-xs font-medium p-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-slate-900 dark:focus:border-slate-300 focus:outline-none"
                />
              </div>

              {/* Tóm tắt tốc độ thực tế */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Tốc độ đạt được:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  <span className="font-mono">{Math.round((modalActualSeconds / activeConfig.totalQuestions) * 10) / 10}s</span> / câu
                </span>
              </div>

              {/* Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleSaveModalResult}
                  className="flex-1 py-3 rounded-xl font-extrabold text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-soft dark:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Lưu Kết Quả & Cập Nhật Thống Kê</span>
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-3 rounded-xl font-bold text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. POPUP MODAL HOÀN THÀNH POMODORO CÀ CHUA - PHƯƠNG ÁN A (2 THẺ CHỌN NHANH) */}
      {isPomodoroFinishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft dark:shadow-none p-5 sm:p-6 w-full max-w-sm relative animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <button
              onClick={() => setIsPomodoroFinishOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Icon + Title (Đã xóa dòng chữ thừa) */}
            <div className="pt-1 space-y-2">
              <div className="text-3xl sm:text-4xl select-none animate-bounce duration-1000">
                {pomodoroPhase === 'WORK' ? (isLongBreakDue ? '🌴' : '🍅') : '☕'}
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                {pomodoroPhase === 'WORK' ? (
                  isLongBreakDue ? (
                    `Hoàn Thành Chu Kỳ ${pomodoroSettings.longBreakInterval}/${pomodoroSettings.longBreakInterval}!`
                  ) : (
                    `Hoàn Thành Quả Cà Chua #${((completedPomodoros - 1) % pomodoroSettings.longBreakInterval) + 1}!`
                  )
                ) : (
                  'Hết Giờ Nghỉ Ngơi!'
                )}
              </h3>
            </div>

            {/* 2 Thẻ Lựa Chọn Trực Quan (Khi kết thúc phiên WORK) */}
            {pomodoroPhase === 'WORK' ? (
              <div className="space-y-3.5 pt-1">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Thẻ 1: Khuyên dùng */}
                  {isLongBreakDue ? (
                    <button
                      onClick={() => {
                        setIsPomodoroFinishOpen(false);
                        handleSelectPomodoroPhase('LONG_BREAK', true);
                      }}
                      className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-sky-50 dark:bg-sky-950/50 shadow-soft dark:shadow-none hover:bg-sky-100 dark:hover:bg-sky-900/60 hover:translate-x-[1px] hover:translate-y-[1px] transition text-center space-y-1 cursor-pointer group"
                    >
                      <span className="inline-block px-1.5 py-0.2 rounded-md bg-sky-500 text-white text-[9px] font-bold">
                        Khuyên dùng
                      </span>
                      <div className="text-2xl group-hover:scale-110 transition-transform">🌴</div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Nghỉ Dài</div>
                      <div className="font-extrabold text-xs text-sky-700 dark:text-sky-300">
                        {pomodoroSettings.longBreakMinutes} phút
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsPomodoroFinishOpen(false);
                        handleSelectPomodoroPhase('SHORT_BREAK', true);
                      }}
                      className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-950/50 shadow-soft dark:shadow-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:translate-x-[1px] hover:translate-y-[1px] transition text-center space-y-1 cursor-pointer group"
                    >
                      <span className="inline-block px-1.5 py-0.2 rounded-md bg-emerald-500 text-white text-[9px] font-bold">
                        Khuyên dùng
                      </span>
                      <div className="text-2xl group-hover:scale-110 transition-transform">☕</div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Nghỉ Ngắn</div>
                      <div className="font-extrabold text-xs text-emerald-700 dark:text-emerald-300">
                        {pomodoroSettings.shortBreakMinutes} phút
                      </div>
                    </button>
                  )}

                  {/* Thẻ 2: Tùy chọn thứ hai */}
                  {isLongBreakDue ? (
                    <button
                      onClick={() => {
                        setIsPomodoroFinishOpen(false);
                        handleSelectPomodoroPhase('SHORT_BREAK', true);
                      }}
                      className="p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-900 dark:hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition text-center space-y-1 cursor-pointer group"
                    >
                      <span className="inline-block px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold">
                        Nhanh
                      </span>
                      <div className="text-2xl group-hover:scale-110 transition-transform">☕</div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Nghỉ Ngắn</div>
                      <div className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">
                        {pomodoroSettings.shortBreakMinutes} phút
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsPomodoroFinishOpen(false);
                        handleSelectPomodoroPhase('LONG_BREAK', true);
                      }}
                      className="p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-900 dark:hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition text-center space-y-1 cursor-pointer group"
                    >
                      <span className="inline-block px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold">
                        Dài hơn
                      </span>
                      <div className="text-2xl group-hover:scale-110 transition-transform">🌴</div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Nghỉ Dài</div>
                      <div className="font-extrabold text-xs text-sky-600 dark:text-sky-400">
                        {pomodoroSettings.longBreakMinutes} phút
                      </div>
                    </button>
                  )}
                </div>

                {/* Chân trang: Có viền nút bấm thanh lịch, rõ ràng bấm được */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setIsPomodoroFinishOpen(false);
                      handleSelectPomodoroPhase('WORK', false);
                    }}
                    className="py-2 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>✕</span>
                    <span>Bỏ qua nghỉ</span>
                  </button>

                  {onOpenSessionLogger ? (
                    <button
                      onClick={() => {
                        setIsPomodoroFinishOpen(false);
                        onOpenSessionLogger({ durationMinutes: pomodoroSettings.workMinutes, sessionType: 'PART_PRACTICE' });
                      }}
                      className="py-2 px-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-900 dark:text-rose-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📝</span>
                      <span>Lưu kế hoạch</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsPomodoroFinishOpen(false)}
                      className="py-2 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Đóng</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Khi hết giờ nghỉ ngơi (Break -> Work) */
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => {
                    setIsPomodoroFinishOpen(false);
                    handleSelectPomodoroPhase('WORK', true);
                  }}
                  className="w-full py-3.5 rounded-xl font-extrabold text-xs bg-rose-500 hover:bg-rose-600 text-white border border-slate-200/80 dark:border-slate-800 shadow-soft dark:shadow-none flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <TomatoIcon className="w-4 h-4" />
                  <span>Bắt Đầu Quả Cà Chua {pomodoroSettings.workMinutes} Phút Mới</span>
                </button>
                <button
                  onClick={() => setIsPomodoroFinishOpen(false)}
                  className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. MODAL THIẾT LẬP THỜI GIAN POMODORO TÙY Ý */}
      <PomodoroSettingsModal
        isOpen={isPomodoroSettingsOpen}
        onClose={() => setIsPomodoroSettingsOpen(false)}
        settings={pomodoroSettings}
        onSave={handleSavePomodoroSettings}
      />
    </div>
  );
};

// Export backward compatibility alias
export const ExamTimerView = ReadingPacingView;
