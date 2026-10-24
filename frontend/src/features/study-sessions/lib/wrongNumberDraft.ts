import { useState } from 'react';
import { formatQuestionList } from '@/shared/domain/questionNumbers';

export interface WrongNumberDraft { typing: boolean; text: string }
export const EMPTY_WRONG_NUMBER_DRAFT: WrongNumberDraft = { typing: false, text: '' };

/** One parent-owned draft follows the learner across desktop/phone layouts. */
export function useWrongNumberDraft(wrong: number[], external?: WrongNumberDraft, onChange?: (value: WrongNumberDraft) => void) {
  const [local, setLocal] = useState(EMPTY_WRONG_NUMBER_DRAFT);
  const value = external ?? local;
  const change = (patch: Partial<WrongNumberDraft>) => (onChange ?? setLocal)({ ...value, ...patch });
  return { typing: value.typing, text: value.text, setTyping: (typing: boolean) => change({ typing }),
    setText: (text: string) => change({ text }), open: () => change({ typing: true, text: formatQuestionList(wrong) }),
    cancel: () => change({ typing: false, text: formatQuestionList(wrong) }) };
}
