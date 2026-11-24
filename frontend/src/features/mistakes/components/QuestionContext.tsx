import { PassageText } from './PassageText';

/** Shared source text for the notebook and its preview/review. No AI calls on expansion. */
export function QuestionContext({ context, part, initiallyOpen = false }: {
  context: string;
  part: number | null;
  initiallyOpen?: boolean;
}) {
  if (!context.trim()) return null;
  return (
    <details open={initiallyOpen || undefined} className="rounded-2xl bg-[#f8f7f4] px-3.5 py-2.5 text-sm text-[#4d5850]">
      <summary className="w-fit cursor-pointer rounded py-1 font-extrabold text-[var(--rd-ink)] focus-visible:outline-2 focus-visible:outline-[var(--rd-blue)]">
        {part === 1 ? 'Mô tả tranh · AI' : part !== null && part >= 2 && part <= 4 ? 'Transcript' : 'Đoạn đọc / ngữ cảnh'}
      </summary>
      <PassageText text={context} className="mt-2 border-l-2 border-[#e3dfd8] pl-3 leading-relaxed" />
    </details>
  );
}
