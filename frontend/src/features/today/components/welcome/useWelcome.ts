import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { BUBBLE_MS, hasSeenWelcome, isFreshLearner, markWelcomeSeen, reducedMotion, shouldGreet } from '../../lib/welcome';

export const CONFETTI_MS = 1200;

/**
 * First-visit moments of Hôm nay (shared by phone and desktop):
 * greeting (Sóc + bubble, 4 s or any tap) -> stairs grow in -> goal chosen -> confirm: confetti, first bar lit, second bubble.
 * Returning learners (a test, a chosen goal, or the greeting flag already set) get none of the greeting.
 */
export function useWelcome(input: { hasTests: boolean; chosen: boolean }) {
  const owner = getActiveAccountId();
  const [fresh] = useState(() => isFreshLearner(input));
  const [greeting, setGreeting] = useState(() => shouldGreet({ ...input, seen: hasSeenWelcome(owner) }));
  const [grew, setGrew] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [leapBubble, setLeapBubble] = useState(false);
  const [lit, setLit] = useState(false);

  // The flag is written as soon as the greeting shows, so a reload never repeats it.
  const greeted = useRef(greeting);
  useEffect(() => { if (greeted.current) markWelcomeSeen(owner); }, [owner]);

  const endGreeting = useCallback(() => { setGreeting(false); setGrew(true); }, []);
  useEffect(() => {
    if (!greeting) return;
    const timer = window.setTimeout(endGreeting, BUBBLE_MS);
    window.addEventListener('pointerdown', endGreeting, { once: true, passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', endGreeting); };
  }, [greeting, endGreeting]);

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  /** Call when the learner confirms the first goal. */
  const confirm = useCallback(() => {
    if (!fresh) return;
    setLit(true);
    setLeapBubble(true);
    timers.current.push(window.setTimeout(() => setLeapBubble(false), BUBBLE_MS));
    if (!reducedMotion()) {
      setConfetti(true);
      timers.current.push(window.setTimeout(() => setConfetti(false), CONFETTI_MS + 200));
    }
  }, [fresh]);

  return { fresh, greeting, grew, confetti, leapBubble, lit, confirm };
}
