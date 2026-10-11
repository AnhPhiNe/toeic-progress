interface QuestionSource {
  questionContext: string;
  question?: string | null;
  context?: string | null;
}

/** New records use explicit source fields, regardless of ordering/line breaks in the legacy text. */
export function readQuestion(source: QuestionSource): { question: string; context: string } {
  if (typeof source.question === 'string') {
    return { question: source.question.trim(), context: source.context?.trim() ?? '' };
  }
  // Read-only compatibility for records/backends that predate the explicit fields.
  const [question, ...rest] = source.questionContext.trim().split(/\r?\n/);
  return { question: question.trim(), context: rest.join('\n').trim() };
}
