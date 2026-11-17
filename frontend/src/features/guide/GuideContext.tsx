import { createContext, useContext } from 'react';

/** App-level state the page tips need: true while the logger, a timer run, review, result screen or a celebration holds the screen. */
export const GuideContext = createContext<{ tipsHeld: boolean }>({ tipsHeld: false });

export const useTipsHeld = (): boolean => useContext(GuideContext).tipsHeld;
