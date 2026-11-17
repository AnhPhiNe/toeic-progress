import { Soc } from '@/shared/ui/soc/Soc';

/** "Nhờ Sóc xem đề này ›" between the result and the buttons (design/previews/mock-test-advice.html, row 10). */
export function AskAdviceRow({ onClick, className = 'sr-ask' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" className={className} onClick={onClick}>
      <Soc state="idle" size={36} /><span>Nhờ Sóc xem đề này</span><i aria-hidden="true">›</i>
    </button>
  );
}
