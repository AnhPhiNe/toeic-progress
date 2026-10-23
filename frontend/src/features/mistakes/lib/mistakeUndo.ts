/** A durable, account-scoped reversal. Implementations throw if the saved operation has changed. */
export type MistakeUndoAction = () => void;
