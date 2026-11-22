import { Soc } from '@/shared/ui/soc/Soc';

interface Props { onCapture: () => void; onManual: () => void }

const STEP_ICONS = {
  page: (
    <svg viewBox="0 0 84 70" aria-hidden="true"><rect x="10" y="8" width="56" height="58" rx="8" fill="#fff4d6" stroke="#e8b62c" strokeWidth="3" /><rect x="18" y="20" width="38" height="5" rx="2.5" fill="#e8d7a8" /><rect x="18" y="31" width="30" height="5" rx="2.5" fill="#ffb8ca" /><rect x="18" y="42" width="34" height="5" rx="2.5" fill="#e8d7a8" /><path d="M60 8 v14 l5 -4 5 4 v-14" fill="#ff7a9c" /></svg>
  ),
  phone: (
    <svg viewBox="0 0 84 70" aria-hidden="true"><rect x="14" y="10" width="40" height="56" rx="9" fill="#2f3a33" /><rect x="18" y="16" width="32" height="40" rx="5" fill="#ffe3ea" /><circle cx="34" cy="36" r="9" fill="#fff" stroke="#ff7a9c" strokeWidth="3" /><circle cx="34" cy="36" r="3.5" fill="#ff7a9c" /><path d="M60 22 l6 -6 M64 32 h9 M60 42 l6 6" stroke="#ffc83d" strokeWidth="4" strokeLinecap="round" fill="none" /></svg>
  ),
  cards: (
    <svg viewBox="0 0 84 70" aria-hidden="true"><rect x="22" y="14" width="50" height="40" rx="9" fill="#fff" stroke="#ffb8ca" strokeWidth="3" transform="rotate(6 47 34)" /><rect x="14" y="18" width="50" height="40" rx="9" fill="#fff" stroke="#ff7a9c" strokeWidth="3" /><rect x="22" y="28" width="26" height="5" rx="2.5" fill="#ffb8ca" /><rect x="22" y="38" width="34" height="5" rx="2.5" fill="#e9ecea" /><circle cx="58" cy="54" r="11" fill="#46b35a" /><path d="M53 54 l4 4 7 -8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
  )
};

const STEPS = [
  { icon: STEP_ICONS.page, title: 'Mở trang chữa bài', text: 'của đề bạn vừa làm, chỗ có câu sai' },
  { icon: STEP_ICONS.phone, title: 'Chụp hoặc dán ảnh', text: 'nhiều ảnh một lúc cũng được' },
  { icon: STEP_ICONS.cards, title: 'Soát rồi lưu', text: 'Sóc gom thành thẻ, đến hạn sẽ nhắc ôn' }
];

/** Computers: the empty notebook shows one example card and how a card is made (design/previews/mock-notebook-capture.html). */
export function NotebookEmpty({ onCapture, onManual }: Props) {
  return (
    <>
      <section className="nbe-hero" aria-labelledby="nbe-title">
        <div className="nbe-copy">
          <small>SỔ TAY CÒN TRỐNG</small>
          <h2 id="nbe-title">Chụp một trang chữa bài,<br />Sóc biến câu sai <em>thành thẻ ôn</em></h2>
          <p>Sóc đọc đáp án bạn chọn, đáp án đúng và giải thích vì sao sai. Bạn không cần gõ gì.</p>
          <span className="nbe-only"><span aria-hidden="true">📖</span> Sóc đọc ảnh Part 5–7 · phần Nghe bạn ghi lý do sai</span>
          <div className="nbe-acts">
            <button type="button" className="rd-btn rd-btn--pink nbe-main" onClick={onCapture}><span aria-hidden="true">📸</span> Chụp trang chữa bài</button>
            <button type="button" className="cap-link" onClick={onManual}>hoặc tự gõ một câu</button>
          </div>
        </div>
        <div className="nbe-demo" aria-label="Ví dụ một thẻ câu sai">
          <Soc state="hi" size={96} className="nbe-soc" />
          <span className="nbe-stamp">Ví dụ</span>
          <div className="nbe-card">
            <div className="nbe-tp"><span className="nbe-tag is-part">Part 5 · câu 117</span><span className="nbe-tag is-trap">Bẫy từ vựng</span></div>
            <p className="nbe-q">The manager asked all staff to <u>______</u> the new safety rules by Friday.</p>
            <div className="nbe-opt"><span>(A) adhere</span><span className="is-bad">(B) comply</span><span className="is-ok">(C) follow</span></div>
            <p className="nbe-why"><b>Sai vì:</b> “comply” phải đi với “with”, ở đây không có “with”.</p>
          </div>
        </div>
      </section>

      <ol className="nbe-steps" aria-label="Ba bước">
        {STEPS.map((step, index) => (
          <li key={step.title} className="nbe-st">
            {step.icon}
            <div><b><i>{index + 1}</i>{step.title}</b><small>{step.text}</small></div>
          </li>
        ))}
      </ol>
    </>
  );
}
