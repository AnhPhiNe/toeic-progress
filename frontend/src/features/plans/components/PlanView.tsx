import { formatPlanQuantity } from '../lib/planDisplay';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Target, Plus, ChevronLeft, ChevronRight, Trash2, Pencil, Copy, ArrowUp, ArrowDown, Clock3, Check, FileCheck2, BookOpen, Lightbulb, MoreHorizontal } from 'lucide-react';
import {
  StudySession,
  MistakeEntry,
  UserProfile,
  SmartTaskType,
  SmartWeeklyTask,
  TaskColorKey
} from '@/shared/types';
import type { PacingRun } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { PlanTaskModal, type PlanTaskDraft } from './PlanTaskModal';
import { PlanLimitDialog } from './PlanLimitDialog';
import './plan-feedback.css';
import { buildWeeklyStudyPlan } from '@/features/plans/lib/studyPlan';
import { assertPlanFitsSync } from '@/features/plans/lib/planLimits';
import { getTodayDateString, getWeekMonday, addDays, loadWeeklyPlans, saveWeeklyPlans, getOrCreateWeeklyPlan } from '@/shared/data/storage';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhonePlan } from './PhonePlan';
import type { VocabLog } from '@/shared/data/dataBundle';

interface PlanViewProps {
  storageVersion?: number;
  profile: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  vocabLog: VocabLog[];
  pacingRuns?: PacingRun[];
  onOpenSettings: () => void;
  onOpenSessionLogger: (prefill?: { sessionType?: 'FULL_TEST' | 'PART_PRACTICE'; partNumber?: number }) => void;
  onNavigateToMistakes: () => void;
  onNavigateToTimer?: () => void;
}

const formatVnDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const TASK_COLOR_OPTIONS: { id: TaskColorKey; label: string; bg: string; ring: string }[] = [
  { id: 'indigo', label: 'Tím Chàm', bg: 'bg-indigo-600', ring: 'ring-indigo-400' },
  { id: 'blue', label: 'Xanh Dương', bg: 'bg-blue-600', ring: 'ring-blue-400' },
  { id: 'amber', label: 'Cam Hổ Phách', bg: 'bg-amber-500', ring: 'ring-amber-400' },
  { id: 'sky', label: 'Xanh Lơ', bg: 'bg-sky-500', ring: 'ring-sky-400' },
  { id: 'rose', label: 'Hồng San Hô', bg: 'bg-rose-500', ring: 'ring-rose-400' },
  { id: 'purple', label: 'Tím Hoa Cà', bg: 'bg-purple-500', ring: 'ring-purple-400' },
];

export const TASK_THEMES: Record<TaskColorKey, {
  borderL: string;
  badge: string;
  progressBar: string;
  primaryBtn: string;
  accentText: string;
}> = {
  indigo: {
    borderL: 'border-l-indigo-600',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800',
    progressBar: 'bg-indigo-600',
    primaryBtn: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 dark:text-indigo-300 dark:border-indigo-800',
    accentText: 'text-indigo-600 dark:text-indigo-400'
  },
  blue: {
    borderL: 'border-l-blue-600',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/80 dark:border-blue-800',
    progressBar: 'bg-blue-600',
    primaryBtn: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 dark:text-blue-300 dark:border-blue-800',
    accentText: 'text-blue-600 dark:text-blue-400'
  },
  amber: {
    borderL: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/80 dark:border-amber-800',
    progressBar: 'bg-amber-500',
    primaryBtn: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 dark:text-amber-300 dark:border-amber-800',
    accentText: 'text-amber-600 dark:text-amber-400'
  },
  sky: {
    borderL: 'border-l-sky-500',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200/80 dark:border-sky-800',
    progressBar: 'bg-sky-500',
    primaryBtn: 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-950/60 dark:hover:bg-sky-900/70 dark:text-sky-300 dark:border-sky-800',
    accentText: 'text-sky-600 dark:text-sky-400'
  },
  rose: {
    borderL: 'border-l-rose-500',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/80 dark:border-rose-800',
    progressBar: 'bg-rose-500',
    primaryBtn: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/70 dark:text-rose-300 dark:border-rose-800',
    accentText: 'text-rose-600 dark:text-rose-400'
  },
  purple: {
    borderL: 'border-l-purple-500',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200/80 dark:border-purple-800',
    progressBar: 'bg-purple-500',
    primaryBtn: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:hover:bg-purple-900/70 dark:text-purple-300 dark:border-purple-800',
    accentText: 'text-purple-600 dark:text-purple-400'
  }
};

export const getDefaultTaskColor = (type: SmartTaskType, partNumber?: number): TaskColorKey => {
  if (type === 'AUTO_FULL_TEST') return 'blue';
  if (type === 'AUTO_STUDY_TIME') return 'indigo';
  if (type === 'AUTO_PART_PRACTICE') {
    if (partNumber === 7) return 'amber';
    if (partNumber && partNumber <= 4) return 'rose';
    return 'sky';
  }
  return 'purple';
};

/** Icon and chip colour of each goal card (chips use the same palette as the progress bar, one step lighter). */
const TASK_ICONS: Record<SmartTaskType, React.ElementType> = { AUTO_FULL_TEST: FileCheck2, AUTO_STUDY_TIME: Clock3, AUTO_PART_PRACTICE: BookOpen, CUSTOM: Target };
const TASK_CHIPS: Record<TaskColorKey, string> = {
  indigo: 'bg-indigo-200', blue: 'bg-blue-200', amber: 'bg-amber-200', sky: 'bg-sky-200', rose: 'bg-rose-200', purple: 'bg-purple-200'
};
export const getTaskTheme = (task: SmartWeeklyTask) => {
  const colorKey = task.color || getDefaultTaskColor(task.type, task.partNumber);
  return TASK_THEMES[colorKey] || TASK_THEMES.indigo;
};

export const PlanView: React.FC<PlanViewProps> = ({
  storageVersion = 0,
  profile,
  sessions = [],
  mistakes = [],
  vocabLog = [],
  pacingRuns = [],
  onOpenSessionLogger,
  onNavigateToTimer
}) => {
  const today = getTodayDateString();
  const currentWeekMonday = getWeekMonday(today);
  // Phones get PhonePlan: rows and a sheet per goal instead of drag handles and inline icons.
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Tuần đang xem
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekMonday);
  // Trạng thái lưu trữ kế hoạch các tuần
  const [plansStore, setPlansStore] = useState(() => loadWeeklyPlans());
  const [saveError, setSaveError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const owner = useRef(getActiveAccountId());
  const modalBaseline = useRef<{ week: string; signature: string; owner: string | null } | null>(null);
  useEffect(() => { setPlansStore(loadWeeklyPlans()); }, [storageVersion]);

  // Modal thêm/sửa mục tiêu
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeTaskModal = useCallback(() => { setIsModalOpen(false); setSaveError(''); }, []);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<SmartTaskType>('AUTO_FULL_TEST');
  const [taskTarget, setTaskTarget] = useState<number>(1);
  const [taskUnit, setTaskUnit] = useState('đề');
  const [taskPart, setTaskPart] = useState<number>(5);
  const [taskNotes, setTaskNotes] = useState('');
  const [taskColor, setTaskColor] = useState<TaskColorKey>('blue');
  const [wipLimitAlert, setWipLimitAlert] = useState(false);
  const closeLimitDialog = useCallback(() => setWipLimitAlert(false), []);
  useEffect(() => {
    if (!saveFeedback) return;
    const timeout = window.setTimeout(() => setSaveFeedback(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);

  // Lấy hoặc tạo plan cho tuần được chọn
  const activePlanRecord = useMemo(() => {
    if (plansStore[selectedWeek]) return plansStore[selectedWeek];
    return getOrCreateWeeklyPlan(selectedWeek, profile, false);
  }, [plansStore, selectedWeek, profile]);

  // Đánh giá kế hoạch tuần
  const summary = useMemo(() => {
    return buildWeeklyStudyPlan(selectedWeek, profile, sessions, mistakes, vocabLog, activePlanRecord, pacingRuns);
  }, [selectedWeek, profile, sessions, mistakes, vocabLog, activePlanRecord, pacingRuns]);

  // Tập hợp các ngày đã có buổi học hoặc từ vựng trong tuần
  const studiedDatesSet = useMemo(() => {
    return new Set([
      ...sessions.filter(s => !s.deletedAt && s.date >= summary.weekStart && s.date <= summary.weekEnd).map(s => s.date),
      ...vocabLog.filter(v => !v.deletedAt && v.count > 0 && v.date >= summary.weekStart && v.date <= summary.weekEnd).map(v => v.date)
    ]);
  }, [sessions, vocabLog, summary.weekStart, summary.weekEnd]);

  // Danh sách 7 ngày trong tuần (T2 -> CN)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      date: addDays(summary.weekStart, i),
      label: i === 6 ? 'CN' : `T${i + 2}`
    }));
  }, [summary.weekStart]);

  // Cập nhật kế hoạch tuần vào state & storage
  const updateCurrentWeekTasks = (newTasks: SmartWeeklyTask[]) => {
    try {
      const latest = loadWeeklyPlans();
      const baseline = isModalOpen ? modalBaseline.current : {
        week: selectedWeek,
        signature: JSON.stringify(plansStore[selectedWeek]?.tasks ?? null),
        owner: owner.current
      };
      if (!baseline || getActiveAccountId() !== owner.current || baseline.owner !== owner.current) {
        throw new Error('Tài khoản đã thay đổi. Hãy mở lại kế hoạch.');
      }
      if (baseline.week !== selectedWeek || baseline.signature !== JSON.stringify(latest[selectedWeek]?.tasks ?? null)) {
        setPlansStore(latest);
        throw new Error('Kế hoạch đã được sửa ở nơi khác. Hãy đóng và mở lại mục tiêu trước khi lưu.');
      }
      const updated = { ...latest, [selectedWeek]: { ...latest[selectedWeek], weekKey: selectedWeek, tasks: newTasks } };
      assertPlanFitsSync(updated[selectedWeek]);
      const nextSummary = buildWeeklyStudyPlan(selectedWeek, profile, sessions, mistakes, vocabLog, updated[selectedWeek], pacingRuns);
      const nextIncomplete = nextSummary.tasks.filter(task => !task.isComplete).length;
      if (nextIncomplete > 6 && nextIncomplete > summary.tasks.filter(task => !task.isComplete).length) {
        throw new Error('Đã có 6 mục tiêu đang làm. Hoàn thành hoặc xóa bớt trước khi tăng chỉ tiêu.');
      }
      saveWeeklyPlans(updated);
      setPlansStore(loadWeeklyPlans());
      setSaveError('');
      setSaveFeedback('Đã lưu kế hoạch.');
      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Chưa lưu được kế hoạch.');
      return false;
    }
  };

  // Đếm số mục tiêu chưa hoàn thành trong tuần (WIP Limit tối đa 6 việc)
  const incompleteTasksCount = useMemo(() => {
    return summary.tasks.filter(t => !t.isComplete).length;
  }, [summary.tasks]);

  const isWipLimitReached = incompleteTasksCount >= 6;

  // Sao chép kế hoạch từ tuần trước
  const prevWeekKey = addDays(selectedWeek, -7);
  const prevWeekTasks = (plansStore[prevWeekKey]?.tasks || []).filter(task => task.type !== 'CUSTOM');
  const canCopyPrevWeek = prevWeekTasks.length > 0;

  const handleCopyPrevWeek = () => {
    if (!canCopyPrevWeek) return;
    const remainingSlots = Math.max(0, 6 - incompleteTasksCount);
    if (remainingSlots <= 0) {
      setWipLimitAlert(true);
      return;
    }
    const existingTitles = new Set(activePlanRecord.tasks.map(t => t.title.toLowerCase().trim()));
    const newTasksToCopy = prevWeekTasks
      .filter(t => !existingTitles.has(t.title.toLowerCase().trim()))
      .slice(0, remainingSlots)
      .map(t => ({
        ...t,
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        manualDone: 0,
        isCompleted: false,
        createdAt: new Date().toISOString()
      }));

    if (newTasksToCopy.length === 0) {
      return;
    }

    updateCurrentWeekTasks([...activePlanRecord.tasks, ...newTasksToCopy]);
  };

  // Chuyển tuần
  const handlePrevWeek = () => setSelectedWeek(w => addDays(w, -7));
  const handleNextWeek = () => setSelectedWeek(w => addDays(w, 7));
  const handleCurrentWeek = () => setSelectedWeek(currentWeekMonday);

  // Xóa mục tiêu
  const handleDeleteTask = (taskId: string) => {
    const task = activePlanRecord.tasks.find(item => item.id === taskId);
    if (!task || !window.confirm(`Xóa mục tiêu “${task.title}”?`)) return;
    const updated = activePlanRecord.tasks.filter(t => t.id !== taskId);
    updateCurrentWeekTasks(updated);
  };

  // Hàng nhiệm vụ đang mở menu ⋯ (sửa, đổi thứ tự, xóa)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  // Done goals live in their own view inside the same six-slot frame.
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { setShowDone(false); }, [selectedWeek]);
  useEffect(() => {
    if (!menuTaskId) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[role="menu"], [aria-haspopup="menu"]')) setMenuTaskId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuTaskId]);

  const moveTask = (taskId: string, direction: -1 | 1) => {
    const task = summary.tasks.find(item => item.id === taskId);
    if (!task) return;
    const group = summary.tasks.filter(item => item.isComplete === task.isComplete);
    const index = group.findIndex(item => item.id === taskId);
    const neighbor = group[index + direction];
    if (!neighbor) return;
    const tasks = [...activePlanRecord.tasks];
    const from = tasks.findIndex(item => item.id === taskId);
    const to = tasks.findIndex(item => item.id === neighbor.id);
    if (from === -1 || to === -1) return;
    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    if (updateCurrentWeekTasks(tasks)) setSaveFeedback('Đã đổi thứ tự mục tiêu.');
  };

  // Phones reorder with "Đưa lên đầu": the goal moves before the first goal of its group (to do / done).
  const moveTaskToTop = (taskId: string) => {
    const task = summary.tasks.find(item => item.id === taskId);
    const first = summary.tasks.find(item => item.isComplete === task?.isComplete);
    if (!task || !first || first.id === taskId) return;
    const tasks = activePlanRecord.tasks.filter(item => item.id !== taskId);
    const moving = activePlanRecord.tasks.find(item => item.id === taskId);
    if (!moving) return;
    const targetIdx = tasks.findIndex(item => item.id === first.id);
    tasks.splice(targetIdx >= 0 ? targetIdx : 0, 0, moving);
    if (updateCurrentWeekTasks(tasks)) setSaveFeedback('Đã đưa mục tiêu lên đầu.');
  };

  // Mở modal thêm mục tiêu
  const handleOpenAddModal = () => {
    if (incompleteTasksCount >= 6) {
      setWipLimitAlert(true);
      return;
    }
    setEditingTaskId(null);
    modalBaseline.current = { week: selectedWeek, owner: owner.current, signature: JSON.stringify(plansStore[selectedWeek]?.tasks ?? null) };
    setSaveError('');
    setTaskTitle('');
    setTaskType('AUTO_FULL_TEST');
    setTaskTarget(1);
    setTaskUnit('đề');
    setTaskPart(5);
    setTaskNotes('');
    setTaskColor('blue');
    setIsModalOpen(true);
  };

  // Mở modal sửa mục tiêu
  const handleOpenEditModal = (task: SmartWeeklyTask) => {
    modalBaseline.current = { week: selectedWeek, owner: owner.current, signature: JSON.stringify(plansStore[selectedWeek]?.tasks ?? null) };
    setSaveError('');
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskType(task.type);
    setTaskTarget(task.target || 1);
    setTaskUnit(task.unit || 'lần');
    setTaskPart(task.partNumber || 5);
    setTaskNotes(task.notes || '');
    setTaskColor(task.color || getDefaultTaskColor(task.type, task.partNumber));
    setIsModalOpen(true);
  };

  // Áp dụng mẫu chọn nhanh (Quick Preset)
  const applyQuickPreset = (preset: 'FULL_TEST' | 'MINUTES' | 'PART_5' | 'PART_7') => {
    if (preset === 'FULL_TEST') {
      setTaskTitle('Làm 1 đề Full Test (200 câu)');
      setTaskType('AUTO_FULL_TEST');
      setTaskTarget(1);
      setTaskUnit('đề');
      setTaskNotes('Rèn luyện phản xạ và quản lý thời gian thực tế');
      setTaskColor('blue');
    } else if (preset === 'MINUTES') {
      const minutes = (profile.dailyMinGoalMinutes || 30) * 7;
      setTaskTitle(`Học ${minutes} phút tuần này`);
      setTaskType('AUTO_STUDY_TIME');
      setTaskTarget(minutes);
      setTaskUnit('phút');
      setTaskNotes(`Mục tiêu ~${profile.dailyMinGoalMinutes || 30} phút/ngày`);
      setTaskColor('indigo');
    } else if (preset === 'PART_5') {
      setTaskTitle('Luyện 2 bài Part 5 (Ngữ pháp & Từ vựng)');
      setTaskType('AUTO_PART_PRACTICE');
      setTaskPart(5);
      setTaskTarget(2);
      setTaskUnit('bài');
      setTaskNotes('Tập trung các cấu trúc câu và từ loại Part 5');
      setTaskColor('sky');
    } else if (preset === 'PART_7') {
      setTaskTitle('Luyện 2 bài Part 7 (Đọc hiểu đoạn văn)');
      setTaskType('AUTO_PART_PRACTICE');
      setTaskPart(7);
      setTaskTarget(2);
      setTaskUnit('bài');
      setTaskNotes('Luyện kỹ năng scan tìm thông tin và đọc đoạn đôi/ba');
      setTaskColor('amber');

    }
  };

  // Lưu mục tiêu (thêm mới hoặc cập nhật sửa)
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (taskType === 'CUSTOM') {
      setSaveError('Chọn cách theo dõi tự động cho mục tiêu này trước khi lưu.');
      return;
    }
    if (!taskTitle.trim() || taskTitle.trim().length > 300
      || !Number.isFinite(taskTarget) || taskTarget < 1 || taskTarget > 100000
      || (taskType !== 'AUTO_STUDY_TIME' && !Number.isInteger(taskTarget))
      || !taskUnit.trim() || taskUnit.trim().length > 50 || taskNotes.length > 4000) {
      setSaveError('Nhập tên, chỉ tiêu và đơn vị hợp lệ. Số đề/bài/lần phải là số nguyên.');
      return;
    }

    if (editingTaskId) {
      const updated = activePlanRecord.tasks.map(t => {
        if (t.id !== editingTaskId) return t;
        return {
          ...t,
          title: taskTitle.trim(),
          type: taskType,
          target: taskTarget,
          unit: taskUnit.trim() || 'lần',
          partNumber: taskType === 'AUTO_PART_PRACTICE' ? taskPart : undefined,
          notes: taskNotes.trim() || undefined,
          color: taskColor,
          isCompleted: false,
          manualDone: 0,
          updatedAt: new Date().toISOString()
        };
      });
      if (!updateCurrentWeekTasks(updated)) return;
      setEditingTaskId(null);
    } else {
      if (incompleteTasksCount >= 6) {
        setSaveError('Đã có 6 mục tiêu đang làm. Hoàn thành hoặc xóa bớt trước khi thêm.');
        return;
      }
      const uuid = generateUUID();
      const newTask: SmartWeeklyTask = {
        id: `task-${uuid}`,
        title: taskTitle.trim(),
        type: taskType,
        target: taskTarget,
        unit: taskUnit.trim() || 'lần',
        partNumber: taskType === 'AUTO_PART_PRACTICE' ? taskPart : undefined,
        notes: taskNotes.trim() || undefined,
        color: taskColor,
        createdAt: new Date().toISOString()
      };
      if (!updateCurrentWeekTasks([...activePlanRecord.tasks, newTask])) return;
    }
    setIsModalOpen(false);
  };



  const incompleteTasks = useMemo(() => summary.tasks.filter(t => !t.isComplete), [summary.tasks]);
  const completedTasks = useMemo(() => summary.tasks.filter(t => t.isComplete), [summary.tasks]);

  const renderTask = (task: (typeof summary.tasks)[number]) => {
    const theme = getTaskTheme(task);
    const Icon = TASK_ICONS[task.type] ?? Target;
    const chip = TASK_CHIPS[task.color || getDefaultTaskColor(task.type, task.partNumber)] ?? TASK_CHIPS.indigo;
    const group = summary.tasks.filter(item => item.isComplete === task.isComplete);
    const groupIndex = group.findIndex(item => item.id === task.id);
    // The page is the week's plan, so "tuần này" in a goal's name only repeats it.
    const title = task.title.replace(/\s+tuần này$/i, '');
    const action = task.isComplete ? null
      : task.type === 'AUTO_FULL_TEST' ? { label: 'Ghi điểm', title: 'Mở biểu mẫu nhập kết quả làm đề Full Test', run: () => onOpenSessionLogger() }
      : task.type === 'AUTO_STUDY_TIME' ? { label: 'Bật đồng hồ', title: 'Chuyển đến Đồng hồ phòng thi để bấm giờ học', run: () => onNavigateToTimer ? onNavigateToTimer() : onOpenSessionLogger({ sessionType: 'PART_PRACTICE' }) }
      : task.type === 'AUTO_PART_PRACTICE' ? { label: 'Ghi kết quả', title: `Ghi kết quả luyện tập Part ${task.partNumber || 5}`, run: () => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: task.partNumber }) }
      : { label: 'Đổi theo dõi', title: 'Chọn cách theo dõi tự động cho mục tiêu này', run: () => handleOpenEditModal(task) };

    return (
      <div
        key={task.id}
        data-task-id={task.id}
        title={task.notes || undefined}
        className={`relative flex min-h-[68px] items-center gap-3 border-t border-slate-200 px-4 py-2.5 first:border-t-0 dark:border-slate-700 ${task.isComplete ? 'bg-slate-50/70 dark:bg-slate-900/40' : ''}`}
      >
        {task.isComplete ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 bg-emerald-500 text-white dark:border-slate-200">
            <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none ${chip}`}>
            <Icon className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p title={task.title} className={`truncate text-[15px] font-extrabold ${task.isComplete ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{title}</p>
          {task.isComplete
            ? <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Đã xong · {formatPlanQuantity(task.done)}/{formatPlanQuantity(task.target)} {task.unit}</p>
            : <div className="mt-1 flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                  <div data-plan-progress className={`h-full rounded-full transition-all duration-500 ${theme.progressBar}`}
                    style={{ width: `${Math.max(task.done > 0 ? 3 : 0, Math.min(100, task.percent))}%` }} />
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400"><b className="font-black text-slate-900 dark:text-white">{formatPlanQuantity(task.done)}</b>/{formatPlanQuantity(task.target)}</span>
              </div>}
          <span className="sr-only">{formatPlanQuantity(task.done)}/{formatPlanQuantity(task.target)} {task.unit}</span>
        </div>

        {action && (
          <button type="button" onClick={action.run} title={action.title}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-black text-slate-900 transition hover:bg-slate-100 active:translate-x-px active:translate-y-px dark:border-slate-300 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">
            {action.label}
          </button>
        )}

        {/* Sửa, đổi thứ tự, xóa gom trong một nút ⋯ để hàng luôn gọn */}
        <div className="relative shrink-0">
          <button type="button" aria-label={`Tùy chọn ${task.title}`} aria-haspopup="menu" aria-expanded={menuTaskId === task.id}
            onClick={() => setMenuTaskId(current => current === task.id ? null : task.id)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuTaskId === task.id && (
            <div role="menu" aria-label={`Tùy chọn ${task.title}`} onKeyDown={event => { if (event.key === 'Escape') setMenuTaskId(null); }}
              className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border-2 border-slate-900 bg-white py-1 text-sm font-bold shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900 dark:shadow-none">
              {[
                { label: 'Sửa mục tiêu', icon: Pencil, run: () => handleOpenEditModal(task) },
                { label: 'Đưa lên', icon: ArrowUp, run: () => moveTask(task.id, -1), disabled: groupIndex === 0 },
                { label: 'Đưa xuống', icon: ArrowDown, run: () => moveTask(task.id, 1), disabled: groupIndex === group.length - 1 },
                { label: 'Xóa mục tiêu', icon: Trash2, run: () => handleDeleteTask(task.id), danger: true }
              ].map(item => (
                <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
                  onClick={() => { setMenuTaskId(null); item.run(); }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-slate-800 ${item.danger ? 'text-rose-700 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  <item.icon className="h-4 w-4" aria-hidden="true" />{item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // One click turns the notebook-based suggestion into a goal for this week.
  const handleAddRecommendation = () => {
    const rec = summary.recommendation;
    if (!rec) return;
    if (incompleteTasksCount >= 6) {
      setWipLimitAlert(true);
      return;
    }
    const task: SmartWeeklyTask = {
      id: `task-${generateUUID()}`,
      title: rec.title,
      type: rec.type,
      target: rec.target,
      unit: rec.unit,
      partNumber: rec.partNumber,
      notes: rec.notes,
      color: getDefaultTaskColor(rec.type, rec.partNumber),
      createdAt: new Date().toISOString()
    };
    if (updateCurrentWeekTasks([...activePlanRecord.tasks, task])) setSaveFeedback(`Đã thêm “${rec.title}”.`);
  };


  if (isPhone) return (
    <div className="plan-view animate-fade-in">
      {saveError && !isModalOpen && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{saveError}</p>}
      <PhonePlan summary={summary} barClass={task => getTaskTheme(task).progressBar} canCopyPrevWeek={canCopyPrevWeek} prevWeekCount={prevWeekTasks.length}
        wipLimitReached={isWipLimitReached} onPrevWeek={handlePrevWeek} onNextWeek={handleNextWeek} onCurrentWeek={handleCurrentWeek}
        onCopyPrevWeek={handleCopyPrevWeek} onAdd={handleOpenAddModal} onEdit={handleOpenEditModal} onDelete={handleDeleteTask}
        onMoveToTop={moveTaskToTop} onRecordFullTest={() => onOpenSessionLogger()}
        onRecordPart={part => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: part })}
        onOpenTimer={() => onNavigateToTimer ? onNavigateToTimer() : onOpenSessionLogger({ sessionType: 'PART_PRACTICE' })} />
      {isModalOpen && <PlanTaskModal editing={Boolean(editingTaskId)} weekLabel={`Tuần ${formatVnDate(summary.weekStart)} – ${formatVnDate(summary.weekEnd)}`} value={{ title: taskTitle, type: taskType, target: taskTarget, unit: taskUnit, part: taskPart, notes: taskNotes, color: taskColor }} colors={TASK_COLOR_OPTIONS} error={saveError} onClose={closeTaskModal} onSubmit={handleSaveModal} onPreset={applyQuickPreset} onChange={(patch: Partial<PlanTaskDraft>) => {
        if (patch.title !== undefined) setTaskTitle(patch.title);
        if (patch.target !== undefined) setTaskTarget(patch.target);
        if (patch.unit !== undefined) setTaskUnit(patch.unit);
        if (patch.notes !== undefined) setTaskNotes(patch.notes);
        if (patch.color !== undefined) setTaskColor(patch.color);
        if (patch.part !== undefined) { setTaskPart(patch.part); setTaskColor(getDefaultTaskColor('AUTO_PART_PRACTICE', patch.part)); }
        if (patch.type !== undefined) { setTaskType(patch.type); setTaskUnit(patch.type === 'AUTO_FULL_TEST' ? 'đề' : patch.type === 'AUTO_STUDY_TIME' ? 'phút' : patch.type === 'AUTO_PART_PRACTICE' ? 'bài' : 'lần'); setTaskTarget(patch.type === 'AUTO_STUDY_TIME' ? (profile.dailyMinGoalMinutes || 30) * 7 : patch.type === 'AUTO_PART_PRACTICE' ? 2 : 1); setTaskColor(getDefaultTaskColor(patch.type, taskPart)); }
      }} />}

      {wipLimitAlert && <PlanLimitDialog onClose={closeLimitDialog} />}
      <div role="status" aria-live="polite" className="sr-only">{saveFeedback}</div>
    </div>
  );

  const dailyGoal = profile.dailyMinGoalMinutes || 30;
  const weekGoal = summary.minutesGoalThisWeek || dailyGoal * 7;
  const peakMinutes = Math.max(dailyGoal * 1.5, ...summary.minutesByDay, 1);
  const weekPercent = weekGoal ? Math.min(100, Math.round((summary.minutesThisWeek / weekGoal) * 100)) : 0;
  const suggestion = summary.recommendation && summary.weekEnd >= today && !isWipLimitReached ? summary.recommendation : null;
  // Six fixed slots (the WIP limit) keep the panel, and the chart beside it, the same height as goals come and go.
  const orderedTasks = incompleteTasks;
  const emptySlots = showDone ? 0 : Math.max(0, 6 - orderedTasks.length);

  return (
    <div className="plan-view space-y-5 animate-fade-in pb-10">
      {saveError && !isModalOpen && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{saveError}</p>}

      {/* Tiêu đề + chọn tuần: "Tuần này" chỉ nằm ở nút chọn tuần */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Kế hoạch tuần</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {formatVnDate(summary.weekStart)} – {formatVnDate(summary.weekEnd)}
            {!summary.isCurrentWeek && (
              <button type="button" onClick={handleCurrentWeek} className="ml-2 cursor-pointer font-bold text-blue-600 hover:underline dark:text-blue-400">
                Về tuần này
              </button>
            )}
          </p>
        </div>
        <div className="inline-flex items-stretch overflow-hidden rounded-xl border-2 border-slate-900 bg-white dark:border-slate-300 dark:bg-slate-900">
          <button type="button" onClick={handlePrevWeek} title="Tuần trước" aria-label="Tuần trước"
            className="flex w-10 cursor-pointer items-center justify-center border-r-2 border-slate-900 text-slate-800 hover:bg-slate-100 dark:border-slate-300 dark:text-slate-200 dark:hover:bg-slate-800">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="flex items-center px-3.5 text-sm font-extrabold text-slate-900 dark:text-white">
            {summary.isCurrentWeek ? 'Tuần này' : `${formatVnDate(summary.weekStart).slice(0, 5)} – ${formatVnDate(summary.weekEnd).slice(0, 5)}`}
          </span>
          <button type="button" onClick={handleNextWeek} title="Tuần sau" aria-label="Tuần sau"
            className="flex w-10 cursor-pointer items-center justify-center border-l-2 border-slate-900 text-slate-800 hover:bg-slate-100 dark:border-slate-300 dark:text-slate-200 dark:hover:bg-slate-800">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Thời gian học mỗi ngày: một cột cho mỗi ngày, thấy ngay học đều hay dồn */}
        <section aria-labelledby="plan-days-title" className="flex flex-col rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plan-days-title" className="text-base font-black text-slate-900 dark:text-white">Thời gian học mỗi ngày</h2>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              <span className="font-black tabular-nums text-slate-900 dark:text-white">{formatPlanQuantity(summary.minutesThisWeek)}</span> / {formatPlanQuantity(weekGoal)} phút tuần này
            </p>
          </div>
          <div className="mt-5 grid min-h-52 flex-1 grid-cols-7 gap-2.5">
            {weekDays.map((day, index) => {
              const minutes = summary.minutesByDay[index] ?? 0;
              const isToday = day.date === today;
              const future = day.date > today;
              const studied = studiedDatesSet.has(day.date);
              const label = minutes > 0 ? `${formatPlanQuantity(minutes)} phút` : studied ? 'học từ vựng' : isToday ? 'hôm nay, chưa học' : future ? 'chưa tới' : 'không học';
              return (
                <div key={day.date} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${day.label} ${formatVnDate(day.date).slice(0, 5)}: ${label}`}>
                  {minutes > 0 && <span className="text-xs font-black tabular-nums text-slate-700 dark:text-slate-200">{formatPlanQuantity(minutes)}p</span>}
                  <div
                    className={`w-full rounded-t-[10px] rounded-b-md ${
                      minutes > 0 ? 'border-2 border-slate-900 bg-teal-600 dark:border-slate-200'
                        : studied ? 'border-2 border-slate-900 bg-teal-200 dark:border-slate-200'
                        : isToday ? 'border-2 border-dashed border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                        : future ? 'border-2 border-dashed border-slate-200 opacity-60 dark:border-slate-700'
                        : 'border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50'
                    }`}
                    style={{ height: minutes > 0 ? `${Math.max(8, (minutes / peakMinutes) * 72)}%` : '22px' }}
                  />
                  <span className={`text-xs font-extrabold ${isToday ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>{isToday ? 'Nay' : day.label}</span>
                  <span className="sr-only">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
            <span className="shrink-0">Mục tiêu {dailyGoal} phút/ngày</span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div data-plan-progress className="h-full rounded-full bg-teal-600 transition-all duration-700 ease-out" style={{ width: `${weekPercent}%` }} />
            </div>
            <span className="shrink-0 tabular-nums text-slate-900 dark:text-white">{weekPercent}%</span>
          </div>
        </section>

        {/* Khung nhiệm vụ cố định 6 ô: gợi ý và nút thêm nằm trong ô trống, nên chiều cao không đổi khi thêm/xóa */}
        <section aria-labelledby="plan-tasks-title" className="flex flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white dark:border-slate-300 dark:bg-[#111A2C]">
          <div className="flex items-center justify-between gap-2 border-b-2 border-slate-900 px-4 py-3 dark:border-slate-300">
            <h2 id="plan-tasks-title" className="text-base font-black text-slate-900 dark:text-white">
              Nhiệm vụ <span className="ml-1 text-sm font-bold text-slate-500 dark:text-slate-400">{summary.completedTasks}/{summary.totalTasks} xong</span>
            </h2>
            <div className="flex items-center gap-1.5">
              {canCopyPrevWeek && (
                <button type="button" onClick={handleCopyPrevWeek} disabled={isWipLimitReached}
                  title={isWipLimitReached ? 'Đã đạt giới hạn 6 mục tiêu đang làm' : 'Sao chép các mục tiêu từ tuần trước sang tuần này'}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-black text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:border-slate-300 dark:bg-slate-900 dark:text-white">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Sao chép tuần trước ({prevWeekTasks.length})
                </button>
              )}
              {emptySlots === 0 && !showDone && (
                <button type="button" onClick={handleOpenAddModal} aria-haspopup="dialog"
                  title={isWipLimitReached ? 'Đã đạt tối đa 6 việc cần làm. Hãy hoàn thành bớt mục tiêu để thêm mới!' : 'Thêm mục tiêu tuần'}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-black text-slate-800 hover:bg-slate-100 dark:border-slate-300 dark:bg-slate-900 dark:text-white">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Thêm mục tiêu{isWipLimitReached ? ' (6/6)' : ''}</span>
                </button>
              )}
            </div>
          </div>

          <div className="h-[408px] overflow-y-auto">
            {(showDone ? completedTasks : orderedTasks).map(renderTask)}
            {showDone && completedTasks.length === 0 && <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Chưa có việc nào xong tuần này.</p>}
            {Array.from({ length: emptySlots }, (_, slot) => {
              const showSuggestion = Boolean(suggestion) && slot === 0;
              const addSlot = slot === (suggestion ? 1 : 0);
              const rowClass = 'flex h-[68px] items-center gap-3 border-t border-slate-200 px-4 dark:border-slate-700';
              if (showSuggestion && suggestion) return (
                <div key="suggestion" className={`${rowClass} bg-orange-50 dark:bg-orange-950/25 ${orderedTasks.length === 0 ? 'border-t-0' : ''}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-orange-200 text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none">
                    <Lightbulb className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">Gợi ý: {suggestion.title}</p>
                    <p className="truncate text-xs font-semibold text-orange-800 dark:text-orange-300" title={suggestion.reason}>{suggestion.reason}</p>
                  </div>
                  <button type="button" onClick={handleAddRecommendation}
                    className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border-2 border-slate-900 bg-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0_0_#0f172a] transition active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none">
                    + Thêm
                  </button>
                </div>
              );
              if (addSlot) return (
                <div key="add" className={`${rowClass} ${orderedTasks.length === 0 && !suggestion ? 'border-t-0' : ''}`}>
                  <button type="button" onClick={handleOpenAddModal} aria-haspopup="dialog" title="Thêm mục tiêu tuần"
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-400 text-sm font-extrabold text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-white">
                    <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    <span>Thêm mục tiêu</span>
                  </button>
                </div>
              );
              return (
                <div key={`empty-${slot}`} aria-hidden="true" className={rowClass}>
                  <div className="h-11 w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800" />
                </div>
              );
            })}
          </div>
          {(
            <button type="button" onClick={() => setShowDone(current => !current)} aria-expanded={showDone} disabled={!showDone && completedTasks.length === 0}
              className="mt-auto flex min-h-11 w-full cursor-pointer items-center gap-2 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent border-t-2 border-slate-900 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 dark:border-slate-300 dark:text-slate-200 dark:hover:bg-slate-800/60">
              {showDone
                ? <><ChevronLeft className="h-4 w-4" aria-hidden="true" />Quay lại việc đang làm ({incompleteTasks.length})</>
                : <><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden="true" />Đã xong ({completedTasks.length})<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" /></>}
            </button>
          )}
        </section>
      </div>

      {isModalOpen && <PlanTaskModal editing={Boolean(editingTaskId)} weekLabel={`Tuần ${formatVnDate(summary.weekStart)} – ${formatVnDate(summary.weekEnd)}`} value={{ title: taskTitle, type: taskType, target: taskTarget, unit: taskUnit, part: taskPart, notes: taskNotes, color: taskColor }} colors={TASK_COLOR_OPTIONS} error={saveError} onClose={closeTaskModal} onSubmit={handleSaveModal} onPreset={applyQuickPreset} onChange={(patch: Partial<PlanTaskDraft>) => {
        if (patch.title !== undefined) setTaskTitle(patch.title);
        if (patch.target !== undefined) setTaskTarget(patch.target);
        if (patch.unit !== undefined) setTaskUnit(patch.unit);
        if (patch.notes !== undefined) setTaskNotes(patch.notes);
        if (patch.color !== undefined) setTaskColor(patch.color);
        if (patch.part !== undefined) { setTaskPart(patch.part); setTaskColor(getDefaultTaskColor('AUTO_PART_PRACTICE', patch.part)); }
        if (patch.type !== undefined) { setTaskType(patch.type); setTaskUnit(patch.type === 'AUTO_FULL_TEST' ? 'đề' : patch.type === 'AUTO_STUDY_TIME' ? 'phút' : patch.type === 'AUTO_PART_PRACTICE' ? 'bài' : 'lần'); setTaskTarget(patch.type === 'AUTO_STUDY_TIME' ? (profile.dailyMinGoalMinutes || 30) * 7 : patch.type === 'AUTO_PART_PRACTICE' ? 2 : 1); setTaskColor(getDefaultTaskColor(patch.type, taskPart)); }
      }} />}

      {wipLimitAlert && <PlanLimitDialog onClose={closeLimitDialog} />}
      <div role="status" aria-live="polite" className="sr-only">{saveFeedback}</div>

    </div>
  );
};
