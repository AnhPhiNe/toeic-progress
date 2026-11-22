import { PassageText } from './PassageText';

/** Shared source text for the notebook and its preview/review. No AI calls on expansion. */
export function QuestionContext({ context, part, initiallyOpen = false }: {
  context: string;
  part: number | null;
  initiallyOpen?: boolean;
}) {
  if (!context.trim()) return null;
  return (
    <details open={initiallyOpen || undefined} className="text-sm text-slate-600 dark:text-slate-300">
      <summary className="w-fit cursor-pointer rounded py-1 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">
        {part === 1 ? 'Mô tả tranh · AI' : part !== null && part >= 2 && part <= 4 ? 'Transcript' : 'Đoạn đọc / ngữ cảnh'}
      </summary>
      <PassageText text={context} className="mt-2 border-l-2 border-slate-200 pl-3 leading-relaxed dark:border-slate-700" />
    </details>
  );
}
