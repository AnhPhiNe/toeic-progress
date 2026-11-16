import { PhoneAvatarButton } from '@/app/components/phone';
import type { MistakeUndoAction } from '../lib/mistakeUndo';
import type { MistakeEntry, NavTabId, StudySession } from '@/shared/types';

/**
 * Sổ tay on phones (STUB, to be built).
 * Must follow design/previews/mock-phone-notebook.html (desktop reference: the notebook sketches behind
 * MistakeNotebookView). Header carries PhoneAvatarButton. The shell already offers "Chụp câu sai" through createRequest.
 */
export interface NotebookPhoneProps {
  /** Same data and handlers MistakeNotebookView (desktop) receives. */
  mistakes: MistakeEntry[];
  sessions?: StudySession[];
  initialSourceNames?: string[];
  initialPart?: number;
  /** Opens the note form for a test (or, with detailSessionId, the detail flow); also set by the + Ghi "Chụp câu sai" tile with an empty request. */
  createRequest?: { sourceName?: string; sessionId?: string; detailSessionId?: string };
  dueCount: number;
  onStartReview: (ids?: string[]) => void;
  onAddMistake: (entry: MistakeEntry) => void;
  onAddMistakes?: (entries: MistakeEntry[]) => void;
  onMarkMastered: (id: string) => void;
  onReopenCards: (ids: string[]) => void;
  onDeleteMistake: (id: string) => MistakeUndoAction | void;
  onUpdateMistake: (entry: MistakeEntry, original: MistakeEntry) => void;
  onOpenSessionLogger?: () => void;
  onNavigateTab?: (tab: NavTabId) => void;
}

export function NotebookPhone(_props: NotebookPhoneProps) {
  return (
    <div className="rd ph-stub">
      <header><h1>Sổ tay</h1><PhoneAvatarButton /></header>
      <p>Đang xây dựng.</p>
    </div>
  );
}
