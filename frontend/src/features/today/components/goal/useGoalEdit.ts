import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudySession, UserProfile } from '@/shared/types';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { profileWithGoal } from '../../lib/goalSetup';
import { BUBBLE_MS } from '../../lib/welcome';
import { bestScore, examState, goalPreview, hasSeenPastExam, isReachedGoal, markPastExamSeen, savedLine, skipCelebrationFor } from '../../lib/goalEdit';

const PAST_TIP_MS = 6000;

/** What opened the editor: the trophy (an SVG group on desktop), the exam chip or a button. */
export type GoalAnchor = HTMLElement | SVGElement;

/**
 * State shared by phone and desktop Hôm nay for changing the goal: which editor is open (and what opened it),
 * saving, the bars that grow in after a raise, Sóc's one line, and the one-time "Thi xong chưa?" bubble.
 */
export function useGoalEdit(input: { profile: UserProfile; sessions: StudySession[]; today: string; onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void }) {
  const { profile, sessions, today, onUpdateProfile } = input;
  const owner = getActiveAccountId();
  /** The element that opened the editor (desktop popover sits beside it); null = open without anchor; false = closed. */
  const [anchor, setAnchor] = useState<GoalAnchor | null | false>(false);
  const open = useCallback((from?: GoalAnchor | null) => setAnchor(from ?? null), []);
  const close = useCallback(() => setAnchor(false), []);

  const best = useMemo(() => bestScore(sessions), [sessions]);
  const exam = examState(profile.examDate, today);

  // Bars added by the last save grow in; key changes once per save so only those bars remount.
  const [grow, setGrow] = useState<{ key: number; from: number } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = useCallback((target: number, examDate: string) => {
    const preview = goalPreview(sessions, profile.targetScore, target);
    const reached = isReachedGoal(target, best);
    // An edit down to a reached goal must not fire the one-time "Bạn đã chạm cúp" celebration.
    if (reached) skipCelebrationFor(target);
    onUpdateProfile(p => ({ ...profileWithGoal(p, target), examDate }));
    setAnchor(false);
    if (target === profile.targetScore) return; // only the exam date changed: nothing on the stairs moves
    setGrow(g => ({ key: (g?.key ?? 0) + 1, from: preview.delta > 0 && !preview.estimate ? preview.bars.length - preview.delta : Number.POSITIVE_INFINITY }));
    setSaid(savedLine({ delta: preview.delta, reached, target }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaid(null), BUBBLE_MS);
  }, [sessions, profile.targetScore, best, onUpdateProfile]);

  // "Thi xong chưa?" shows once per owner and exam date, the first time Hôm nay sees that date in the past.
  const [pastTip, setPastTip] = useState(() => exam.kind === 'past' && !hasSeenPastExam(owner, profile.examDate));
  useEffect(() => {
    if (!pastTip) return;
    markPastExamSeen(owner, profile.examDate);
    const t = window.setTimeout(() => setPastTip(false), PAST_TIP_MS);
    return () => window.clearTimeout(t);
  }, [pastTip, owner, profile.examDate]);
  useEffect(() => { if (anchor !== false) setPastTip(false); }, [anchor]);

  return { isOpen: anchor !== false, anchor: anchor || null, open, close, save, best, exam, grow, said, pastTip: pastTip && exam.kind === 'past', hidePastTip: () => setPastTip(false) };
}
