/**
 * Any AI entry point can ask the app to invite a guest to sign in, without knowing how sign-in works.
 * The app shell listens and shows one consistent prompt; the feature keeps its own inline message.
 */
export const AI_SIGN_IN_EVENT = 'toeic:ai-sign-in';

export function requestAISignIn() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_SIGN_IN_EVENT));
}
