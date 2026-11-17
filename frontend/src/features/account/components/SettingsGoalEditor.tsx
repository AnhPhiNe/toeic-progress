import { useMemo } from 'react';
import type { UserProfile } from '@/shared/types';
import { live, readDataBundle } from '@/shared/data/dataBundle';
import { localDate } from '@/features/pacing/lib/pacingModel';
import { GoalPopover, GoalSheet } from '@/features/today/components/goal/GoalEditor';
import { bestScore, isReachedGoal, skipCelebrationFor } from '@/features/today/lib/goalEdit';

export const SETTINGS_GOAL_POPOVER_ID = 'settings-goal-editor';

interface Props {
  profile: UserProfile;
  /** Saves the patch through the settings merge; returns an error message or null. */
  onSaveField: (patch: Partial<UserProfile>) => string | null;
  onClose: () => void;
  /** Phone: bottom sheet. Computers: popover beside `anchor`. */
  phone: boolean;
  anchor?: HTMLElement | null;
  /** Computers: the settings dialog, so the popover sits beside it and covers none of its rows. */
  beside?: HTMLElement | null;
}

/** The Hôm nay goal editor opened from Cài đặt, so goal, stairs preview and exam date behave the same in both places. */
export function SettingsGoalEditor({ profile, onSaveField, onClose, phone, anchor, beside }: Props) {
  const sessions = useMemo(() => live(readDataBundle().sessions), []);
  const best = useMemo(() => bestScore(sessions), [sessions]);
  const save = (target: number, examDate: string) => {
    // Same as Hôm nay: a goal edited down to a reached score never fires the one-time celebration.
    if (isReachedGoal(target, best)) skipCelebrationFor(target);
    if (onSaveField({ targetScore: target, examDate, goalChosen: true }) === null) onClose();
  };
  const common = { sessions, current: profile.targetScore, initial: profile.targetScore, best, examDate: profile.examDate, today: localDate(Date.now()), onSave: save, onClose };
  return phone ? <GoalSheet {...common} /> : <GoalPopover {...common} anchor={anchor ?? null} beside={beside} id={SETTINGS_GOAL_POPOVER_ID} />;
}
