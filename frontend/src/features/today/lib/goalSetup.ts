import type { UserProfile } from '@/shared/types';
import { estimateMilestones } from '@/shared/domain/milestones';

export const TARGET_PRESETS = [600, 700, 800, 900] as const;
export const MIN_TARGET = 10;
export const MAX_TARGET = 990;
/** The profile's untouched default; it does not tell us the learner picked a goal. */
const DEFAULT_TARGET = 990;
/** Stairs previewed while the learner has not picked a goal yet. */
export const PREVIEW_TARGET = 800;

/**
 * A typed goal: whole number from 10 to 990 in steps of 5 (the same rule Cài đặt enforces).
 * Returns null while the text is empty or not yet a valid goal, so typing "8" or "85" never saves half a number.
 */
export function parseTargetInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= MIN_TARGET && value <= MAX_TARGET && value % 5 === 0 ? value : null;
}

/** Has the learner chosen a goal? The default 990 only counts once they picked it (goalChosen). */
export function hasChosenGoal(profile: Pick<UserProfile, 'targetScore' | 'goalChosen'>): boolean {
  return profile.goalChosen === true || profile.targetScore !== DEFAULT_TARGET;
}

/**
 * The goal to show next to "Điểm mục tiêu" (Cài đặt, sidebar): null while the learner has not picked one,
 * so a fresh profile reads "Chưa chọn" instead of the stored placeholder 990.
 */
export function shownGoal(profile: Pick<UserProfile, 'targetScore' | 'goalChosen'>): number | null {
  return hasChosenGoal(profile) ? profile.targetScore : null;
}

/** "850" or "Chưa chọn". */
export function goalLabel(profile: Pick<UserProfile, 'targetScore' | 'goalChosen'>): string {
  const goal = shownGoal(profile);
  return goal === null ? 'Chưa chọn' : String(goal);
}

export type TodayMode ='choose' | 'ready' | 'climb';

/** choose = pick a goal (S1), ready = goal set but no test yet (S2), climb = real stairs after a test (S3). */
export function todayMode(input: { hasTests: boolean; chosen: boolean; editing: boolean }): TodayMode {
  if (input.hasTests) return 'climb';
  return input.chosen && !input.editing ? 'ready' : 'choose';
}

/** "{k} bậc · mỗi bậc {step}": blocks below the trophy and the points each one is worth. */
export function stairsSummary(target: number): { blocks: number; step: number } {
  const { values, step } = estimateMilestones(target);
  return { blocks: values.length - 1, step };
}

export function profileWithGoal(profile: UserProfile, target: number): UserProfile {
  return { ...profile, targetScore: target, goalChosen: true };
}
