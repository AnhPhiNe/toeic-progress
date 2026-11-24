export function MistakeContextInput({ part, text, busy, onText, reuseLabel, onReset }: {
  part: number | null;
  text: string;
  busy: boolean;
  onText: (text: string) => void;
  reuseLabel?: string;
  onReset: () => void;
}) {
  // Listening (Part 1–4) keeps only the reason, error type and an optional note: no passage box.
  if (part === null || part <= 4) return null;
  const label = part === 5 ? 'Ngữ cảnh' : 'Đoạn đọc';
  const content = (
    <>
      {reuseLabel && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-extrabold text-[var(--rd-pink-d)]">{reuseLabel}</span>
          <button type="button" disabled={busy} onClick={onReset} className="rdm-link is-quiet shrink-0">Đổi bài đọc</button>
        </div>
      )}
      <label htmlFor="mistake-context" className="rdm-lab">{label}</label>
      <textarea
        id="mistake-context"
        disabled={busy}
        value={text}
        maxLength={16000}
        onChange={event => onText(event.target.value)}
        rows={part === 5 ? 2 : 3}
        placeholder={part === 5 ? 'Thêm ngữ cảnh nếu câu hỏi cần…' : 'Dán bài đọc, email hoặc các đoạn văn liên quan…'}
        className="rdm-in min-h-[72px] w-full resize-y"
      />
    </>
  );
  return part === 5 ? (
    <details open={text.trim() ? true : undefined} className="rdm-ctx">
      <summary>Ngữ cảnh<span className="rdm-opt">không bắt buộc</span></summary>
      <div className="mt-2 space-y-2">{content}</div>
    </details>
  ) : (
    <section aria-label={`Khu vực ${label.toLowerCase()}`} className="rdm-ctx space-y-2">{content}</section>
  );
}
