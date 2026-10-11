import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Target,
  CheckCircle2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Pencil,
  Copy,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  GripVertical
} from 'lucide-react';
import {
  StudySession,
  MistakeEntry,
  UserProfile,
  SmartTaskType,
  SmartWeeklyTask,
  TaskColorKey
} from '@/shared/types';
import type { PacingRun } from '@/shared/types';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { PlanTaskModal, type PlanTaskDraft } from './PlanTaskModal';
import { PlanLimitDialog } from './PlanLimitDialog';
import './plan-feedback.css';
import { buildWeeklyStudyPlan } from '@/features/plans/lib/studyPlan';
import { assertPlanFitsSync } from '@/features/plans/lib/planLimits';
import { getTodayDateString, getWeekMonday, addDays, loadWeeklyPlans, saveWeeklyPlans, getOrCreateWeeklyPlan } from '@/shared/data/storage';
import { CARD } from '@/shared/ui/surfaces';
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
    badge: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700',
    progressBar: 'bg-indigo-600',
    primaryBtn: 'bg-indigo-400 hover:bg-indigo-500 text-slate-950',
    accentText: 'text-indigo-600 dark:text-indigo-400'
  },
  blue: {
    borderL: 'border-l-blue-600',
    badge: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-300 dark:border-blue-700',
    progressBar: 'bg-blue-600',
    primaryBtn: 'bg-blue-400 hover:bg-blue-500 text-slate-950',
    accentText: 'text-blue-600 dark:text-blue-400'
  },
  amber: {
    borderL: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    progressBar: 'bg-amber-500',
    primaryBtn: 'bg-amber-400 hover:bg-amber-500 text-slate-950',
    accentText: 'text-amber-600 dark:text-amber-400'
  },
  sky: {
    borderL: 'border-l-sky-500',
    badge: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200 border-sky-300 dark:border-sky-700',
    progressBar: 'bg-sky-500',
    primaryBtn: 'bg-sky-400 hover:bg-sky-500 text-slate-950',
    accentText: 'text-sky-600 dark:text-sky-400'
  },
  rose: {
    borderL: 'border-l-rose-500',
    badge: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-700',
    progressBar: 'bg-rose-500',
    primaryBtn: 'bg-rose-400 hover:bg-rose-500 text-slate-950',
    accentText: 'text-rose-600 dark:text-rose-400'
  },
  purple: {
    borderL: 'border-l-purple-500',
    badge: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    progressBar: 'bg-purple-500',
    primaryBtn: 'bg-purple-400 hover:bg-purple-500 text-slate-950',
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

export const getTaskTheme = (task: SmartWeeklyTask) => {
  const colorKey = task.color || getDefaultTaskColor(task.type, task.partNumber);
  return TASK_THEMES[colorKey] || TASK_THEMES.indigo;
};

export const PlanView: React.FC<PlanViewProps> = ({
  storageVersion = 0,
  profile,
  sessions,
  mistakes,
  vocabLog,
  pacingRuns = [],
  onOpenSessionLogger,
  onNavigateToTimer
}) => {
  const today = getTodayDateString();
  const currentWeekMonday = getWeekMonday(today);

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
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'INCOMPLETE' | 'COMPLETED'>('ALL');
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
    const updated = activePlanRecord.tasks.filter(t => t.id !== taskId);
    updateCurrentWeekTasks(updated);
  };

  // Kéo thả sắp xếp thứ tự mục tiêu (HTML5 Drag & Drop)
  const [draggableTaskId, setDraggableTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('above');
  const [orderTaskId, setOrderTaskId] = useState<string | null>(null);

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
    [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
    if (updateCurrentWeekTasks(tasks)) setSaveFeedback('Đã đổi thứ tự mục tiêu.');
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setOrderTaskId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTaskId === taskId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const isTop = offset < rect.height / 2;
    setDropPosition(isTop ? 'above' : 'below');
    setDragOverTaskId(taskId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverTaskId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      setDraggedTaskId(null);
      setDragOverTaskId(null);
      setDraggableTaskId(null);
      return;
    }

    const tasks = [...activePlanRecord.tasks];
    const fromIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const toIndex = tasks.findIndex(t => t.id === targetTaskId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedItem] = tasks.splice(fromIndex, 1);
      const adjustedTargetIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const finalIndex = Math.max(0, Math.min(tasks.length, dropPosition === 'below' ? adjustedTargetIndex + 1 : adjustedTargetIndex));
      tasks.splice(finalIndex, 0, movedItem);
      updateCurrentWeekTasks(tasks);
    }

    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDraggableTaskId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDraggableTaskId(null);
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
      const newTask: SmartWeeklyTask = {
        id: `task-${crypto.randomUUID()}`,
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

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'COMPLETED') return completedTasks;
    if (taskFilter === 'INCOMPLETE') return incompleteTasks;
    // Trang Tất cả: Đưa các việc chưa làm lên trên, việc đã xong tự động chuyển xuống đáy
    return [...incompleteTasks, ...completedTasks];
  }, [incompleteTasks, completedTasks, taskFilter]);

  const renderTask = (task: (typeof summary.tasks)[number]) => {
              const isAuto = task.type !== 'CUSTOM';
              const theme = getTaskTheme(task);
              const isDragging = draggedTaskId === task.id;
              const isDragOver = dragOverTaskId === task.id && !isDragging;
              const group = summary.tasks.filter(item => item.isComplete === task.isComplete);
              const groupIndex = group.findIndex(item => item.id === task.id);

              return (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    draggable={draggableTaskId === task.id}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className={`p-3 sm:px-4 sm:py-3.5 rounded-xl border-2 transition-all relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 group ${
                      isDragging
                        ? 'opacity-40 bg-indigo-50/60 dark:bg-indigo-950/40 scale-[0.99] border-2 border-dashed border-indigo-400'
                        : task.isComplete
                        ? 'bg-emerald-50/60 hover:bg-emerald-50/90 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40 border-emerald-500/80 dark:border-emerald-800/60 '
                        : 'bg-white dark:bg-[#151f32] hover:bg-slate-50/90 dark:hover:bg-slate-800/80 border-slate-900 dark:border-slate-700 '
                    } ${
                      isDragOver && dropPosition === 'above'
                        ? 'border-t-2 !border-t-indigo-600 dark:!border-t-indigo-400 '
                        : ''
                    } ${
                      isDragOver && dropPosition === 'below'
                        ? 'border-b-2 !border-b-indigo-600 dark:!border-b-indigo-400 '
                        : ''
                    }`}
                  >
                    {/* Dải vạch màu nội bộ cho việc đang làm dở */}
                    {!task.isComplete && task.done > 0 && (
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.progressBar} pointer-events-none`} />
                    )}

                    {/* CỘT TRÁI: Grip kéo thả + Tiêu đề + 1 Badge loại bài duy nhất (chiếm 50% hàng) */}
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 md:w-1/2 flex-1">
                      {/* Grip Kéo Thả */}
                      <button
                        type="button"
                        className="flex min-h-9 min-w-6 items-center justify-center cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors select-none shrink-0"
                        onMouseEnter={() => setDraggableTaskId(task.id)}
                        onMouseLeave={() => setDraggableTaskId(null)}
                        onTouchStart={() => setDraggableTaskId(task.id)}
                        aria-label={`Sắp xếp ${task.title}`}
                        aria-expanded={orderTaskId === task.id}
                        onClick={() => setOrderTaskId(current => current === task.id ? null : task.id)}
                        onKeyDown={event => {
                          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            moveTask(task.id, event.key === 'ArrowUp' ? -1 : 1);
                          } else if (event.key === 'Escape') setOrderTaskId(null);
                        }}
                        title="Kéo để sắp xếp, hoặc bấm để chọn lên/xuống. Có thể dùng phím ↑/↓."
                      >
                        <GripVertical className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      </button>
                      {orderTaskId === task.id && (
                        <div role="group" aria-label="Đổi thứ tự mục tiêu" className="flex shrink-0 gap-1">
                          <button type="button" aria-label="Di chuyển lên" disabled={groupIndex === 0} onClick={() => moveTask(task.id, -1)} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-30 dark:border-slate-600 dark:text-slate-200"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" aria-label="Di chuyển xuống" disabled={groupIndex === group.length - 1} onClick={() => moveTask(task.id, 1)} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-30 dark:border-slate-600 dark:text-slate-200"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                      )}

                      {/* Tên Task + Phân loại */}
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm sm:text-base font-black truncate max-w-full ${
                            task.isComplete
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                          title={task.title}
                        >
                          {task.title}
                        </span>

                        {/* Badge phân loại duy nhất */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border border-slate-900/30 dark:border-slate-700 shadow-2xs shrink-0 ${theme.badge}`}>
                          {isAuto
                            ? (task.type === 'AUTO_FULL_TEST' ? 'Full Test' : task.type === 'AUTO_STUDY_TIME' ? 'Thời gian học' : `Part ${task.partNumber || 5}`)
                            : 'Mục tiêu cũ'}
                        </span>

                        {task.type === 'CUSTOM' && task.notes && !task.isComplete && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 italic hidden sm:inline shrink-0 truncate max-w-xs" title={task.notes}>
                            ({task.notes})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CỘT PHẢI: Mini Progress Bar + Nút CTA gom cụm chặt chẽ (chiếm 50% hàng) */}
                    <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 sm:gap-4 min-w-0 md:w-1/2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800/80">
                      {/* Mini Progress Bar */}
                      <div className="flex items-center gap-2 w-36 sm:w-40 lg:w-44 shrink-0">
                        <div className="flex-1 h-2 rounded-full border border-slate-900 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 overflow-hidden shadow-2xs">
                          <div
                            data-plan-progress
                            className={`h-full rounded-full transition-all duration-500 ${
                              task.isComplete ? 'bg-emerald-500' : theme.progressBar
                            }`}
                            style={{ width: `${Math.max(task.done > 0 ? 3 : 0, Math.min(100, task.percent))}%` }}
                          />
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 text-xs">
                          <span
                            className={`font-black tabular-nums ${
                              task.isComplete
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {task.done}/{task.target}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {task.unit}
                          </span>
                        </div>
                      </div>

                      {/* Nút Hành Động Nhanh (CTA) hoặc Trạng thái Hoàn thành */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.isComplete ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-300/80 dark:border-emerald-800/80 select-none">
                            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Đã xong</span>
                          </div>
                        ) : (
                          <>
                            {task.type === 'AUTO_FULL_TEST' && (
                              <button
                                type="button"
                                onClick={() => onOpenSessionLogger()}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${theme.primaryBtn} border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition cursor-pointer`}
                                title="Mở biểu mẫu nhập kết quả làm đề Full Test"
                              >
                                <span>Nhập điểm</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {task.type === 'AUTO_STUDY_TIME' && (
                              <button
                                type="button"
                                onClick={() => onNavigateToTimer ? onNavigateToTimer() : onOpenSessionLogger({ sessionType: 'PART_PRACTICE' })}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${theme.primaryBtn} border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition cursor-pointer`}
                                title="Chuyển đến Đồng hồ phòng thi để bấm giờ học"
                              >
                                <span>Bật đồng hồ</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {task.type === 'AUTO_PART_PRACTICE' && (
                              <button
                                type="button"
                                onClick={() => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: task.partNumber })}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${theme.primaryBtn} border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition cursor-pointer`}
                                title={`Ghi kết quả luyện tập Part ${task.partNumber || 5}`}
                              >
                                <span>Ghi kết quả</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {task.type === 'CUSTOM' && (
                              <button type="button" onClick={() => handleOpenEditModal(task)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                                Đổi theo dõi
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* Nút Chỉnh sửa & Xóa — hiển thị tinh tế trên hover */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-60 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity pl-1.5 border-l border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(task)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                          title="Chỉnh sửa mục tiêu"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Xóa mục tiêu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
              );
  };

  const is100Percent = summary.totalTasks > 0 && summary.completedTasks >= summary.totalTasks;

  return (
    <div className="plan-view space-y-4 animate-fade-in pb-10">
      {saveError && !isModalOpen && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{saveError}</p>}

      {/* ================= 1. THANH TIÊU ĐỀ & ĐIỀU HƯỚNG TUẦN ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            Kế Hoạch Ôn Thi
            {summary.isCurrentWeek && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Tuần này
              </span>
            )}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {formatVnDate(summary.weekStart)} – {formatVnDate(summary.weekEnd)}
            </span>
            {!summary.isCurrentWeek && (
              <button
                onClick={handleCurrentWeek}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-1"
              >
                Về tuần này
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Cụm nút chuyển tuần */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 shadow-xs">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Chuyển tuần
            </span>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => onOpenSessionLogger()}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm font-bold shadow-[1.5px_1.5px_0px_#0f172a] flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Ghi Kết Quả
          </button>
        </div>
      </div>

      {/* ================= 2. DẢI RIBBON TIẾN ĐỘ LIỀN KHỐI (UNIFIED PROGRESS RIBBON) ================= */}
      <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-300 bg-white dark:bg-[#111A2C] shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#cbd5e1] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 divide-y lg:divide-y-0 lg:divide-x-2 divide-slate-200 dark:divide-slate-800">
        
        {/* Khối 1: Tiến độ tuần & Thanh năng lượng */}
        <div className="flex-1 flex items-center gap-3.5 pr-0 lg:pr-5">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border-2 border-slate-900 bg-indigo-500 text-white flex items-center justify-center text-lg font-black shrink-0 shadow-2xs">
            <Target className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Mục tiêu đã hoàn thành
              </span>
              <span className="text-xs font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                {summary.completedTasks}/{summary.totalTasks} ({summary.completionPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-900 dark:border-slate-700 overflow-hidden mt-1.5 shadow-2xs">
              <div
                data-plan-progress
                className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(summary.completedTasks > 0 ? 5 : 0, Math.min(100, summary.completionPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Khối 2: Thời lượng tích luỹ */}
        <div className="flex items-center gap-3 px-0 lg:px-5 pt-3 lg:pt-0 shrink-0">
          <div className="w-9 h-9 rounded-xl border-2 border-slate-900 bg-teal-300 text-teal-950 flex items-center justify-center text-sm font-black shrink-0 shadow-2xs">
            <span className="text-base select-none">⏰</span>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thời Lượng Học
            </div>
            <div className="text-sm sm:text-base font-black tabular-nums text-slate-900 dark:text-white">
              {summary.minutesThisWeek} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">/ {summary.minutesGoalThisWeek || 210}p</span>
            </div>
          </div>
        </div>

        {/* Khối 3: Chuyên cần & Kỳ thi */}
        <div className="flex items-center gap-3 pl-0 lg:pl-5 pt-3 lg:pt-0 shrink-0">
          <div className="w-9 h-9 rounded-xl border-2 border-slate-900 bg-rose-300 text-rose-950 flex items-center justify-center text-sm font-black shrink-0 shadow-2xs">
            <span className="text-base select-none">🔥</span>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đã học
            </div>
            <div className="text-sm sm:text-base font-black tabular-nums text-rose-600 dark:text-rose-400">
              {summary.daysStudiedThisWeek} ngày

            </div>
          </div>
        </div>

      </div>

      {/* ================= 4. DANH SÁCH MỤC TIÊU SMART (LINEAR / STRIPE STYLE) ================= */}
      <div className={`${CARD} overflow-hidden !p-0`}>
        {/* Header với Tiêu đề, Filter Tabs, Nút Sao chép tuần trước & Thêm mục tiêu */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-900/10 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              Việc Cần Làm Tuần Này
              <span
                className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-900 shadow-[1px_1px_0px_#0f172a]"
                title={`${summary.completedTasks} trên ${summary.totalTasks} mục tiêu đã hoàn thành`}
              >
                {summary.completedTasks}/{summary.totalTasks}
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bộ lọc trạng thái: Tất cả / Cần làm / Đã xong */}
            {summary.tasks.length > 0 && (
              <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]">
                {(['ALL', 'INCOMPLETE', 'COMPLETED'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTaskFilter(tab)}
                    aria-pressed={taskFilter === tab}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      taskFilter === tab
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-[1px_1px_0px_#0f172a]'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                    }`}
                  >
                    {tab === 'ALL' && `Tất cả (${summary.tasks.length})`}
                    {tab === 'INCOMPLETE' && `Cần làm (${summary.tasks.filter(t => !t.isComplete).length})`}
                    {tab === 'COMPLETED' && `Đã xong (${summary.tasks.filter(t => t.isComplete).length})`}
                  </button>
                ))}
              </div>
            )}

            {/* Nút Sao chép từ tuần trước nếu tuần trước có mục tiêu */}
            {canCopyPrevWeek && (
              <button
                type="button"
                onClick={handleCopyPrevWeek}
                disabled={isWipLimitReached}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-black transition ${
                  isWipLimitReached
                    ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'border-slate-900 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer'
                }`}
                title={isWipLimitReached ? 'Đã đạt giới hạn 6 mục tiêu đang làm' : 'Sao chép các mục tiêu từ tuần trước sang tuần này'}
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sao chép tuần trước ({prevWeekTasks.length})</span>
                <span className="sm:hidden">Sao chép ({prevWeekTasks.length})</span>
              </button>
            )}

            {/* Nút Thêm mục tiêu */}
            <button
              onClick={handleOpenAddModal}
              aria-haspopup="dialog"
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border-2 text-xs font-black transition ${
                isWipLimitReached
                  ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer'
                  : 'border-slate-900 bg-indigo-600 hover:bg-indigo-700 text-white shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer'
              }`}
              title={isWipLimitReached ? 'Đã đạt tối đa 6 việc cần làm. Hãy hoàn thành bớt mục tiêu để thêm mới!' : 'Thêm mục tiêu tuần'}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Thêm mục tiêu {isWipLimitReached ? '(6/6)' : ''}</span>
            </button>
          </div>
        </div>

        {/* Thông báo giới hạn WIP Limit & Hoàn thành 100% */}
        {(isWipLimitReached || is100Percent) && (
          <div className="p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800">
            {isWipLimitReached && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-slate-900 text-amber-950 dark:text-amber-200 text-xs font-semibold flex items-center justify-between gap-3 shadow-[2px_2px_0px_#0f172a] animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl shrink-0">📌</span>
                  <p>
                    <strong>Đã đạt tối đa 6 việc cần làm:</strong> Để giữ sự tập trung cao nhất (WIP Limit), hãy hoàn thành bớt các mục tiêu hiện tại trước khi tạo thêm nhé!
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-black text-[11px] shrink-0 border border-slate-900 shadow-[1px_1px_0px_#0f172a]">
                  6/6 Đang làm
                </span>
              </div>
            )}

            {is100Percent && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border-2 border-slate-900 shadow-[2.5px_2.5px_0px_#0f172a] flex items-center gap-3 animate-fade-in">
                <span className="text-2xl sm:text-3xl shrink-0">🎉</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-black text-slate-950 dark:text-amber-100">
                    Xuất sắc! Bạn đã hoàn thành 100% mục tiêu tuần này!
                  </p>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-amber-300">
                    Toàn bộ {summary.totalTasks}/{summary.totalTasks} mục tiêu SMART đã cán đích. Hãy giữ vững phong độ đỉnh cao này nhé!
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#0f172a] shrink-0">
                  100% Hoàn Thành
                </span>
              </div>
            )}
          </div>
        )}

        {/* Danh sách mục tiêu hoặc Trạng thái trống */}
        {summary.tasks.length === 0 ? (
          <div className="p-8 sm:p-12 text-center space-y-3">
            <Target className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                Chưa có mục tiêu nào trong tuần này
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Hãy tạo 2-3 mục tiêu vừa sức (ví dụ: làm 1 đề, học 200 phút, luyện Part 5) để có định hướng ôn luyện rõ ràng.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              {canCopyPrevWeek && (
                <button
                  onClick={handleCopyPrevWeek}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-slate-900 bg-white dark:bg-slate-800 text-xs font-black shadow-[1.5px_1.5px_0px_#0f172a] hover:bg-slate-50 transition cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  Sao chép {prevWeekTasks.length} mục tiêu tuần trước
                </button>
              )}
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-slate-900 bg-indigo-600 text-white text-xs font-black shadow-[1.5px_1.5px_0px_#0f172a] hover:bg-indigo-700 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Thiết lập mục tiêu tuần
              </button>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-slate-500">
            Không có mục tiêu nào phù hợp với bộ lọc đã chọn.
          </div>
        ) : (
          <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-900/60 space-y-2 sm:space-y-2.5">
            {taskFilter === 'ALL' ? (
              <>
                {incompleteTasks.map(renderTask)}
                {completedTasks.length > 0 && (
                  <details key={selectedWeek} data-completed-goals className="group/completed">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Đã hoàn thành ({completedTasks.length})
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open/completed:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="mt-2 space-y-2 sm:space-y-2.5">{completedTasks.map(renderTask)}</div>
                  </details>
                )}
              </>
            ) : filteredTasks.map(renderTask)}
          </div>
        )}
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
