import { Soc } from '@/shared/ui/soc/Soc';

/** Phone version of NotebookEmpty: tinted, one main action (capture), what a card looks like and how one is made. */
export function PhoneNotebookEmpty({ onCapture, onManual }: { onCapture: () => void; onManual: () => void }) {
  return (
    <section className="pn-empty" aria-labelledby="pn-empty-title">
      <Soc state="idle" size={118} className="pn-empty__soc" />
      <small>SỔ TAY CÒN TRỐNG</small>
      <h2 id="pn-empty-title">Chụp một trang chữa bài, Sóc biến câu sai <em>thành thẻ ôn</em></h2>
      <p>Sóc đọc đáp án bạn chọn, đáp án đúng và vì sao sai. Bạn không cần gõ gì.</p>

      <div className="pn-ex" aria-label="Ví dụ một thẻ câu sai">
        <span className="pn-ex__tag">Ví dụ</span>
        <div className="pn-ex__tp"><span className="pn-chip" style={{ background: '#7c5ce0', color: '#fff' }}>Part 5 · câu 117</span><span className="pn-chip" style={{ background: '#fff4d1', color: '#a06a00' }}>Bẫy từ vựng</span></div>
        <p>The manager asked all staff to ______ the new safety rules by Friday.</p>
        <div className="pn-ex__opt"><span>(A) adhere</span><span className="is-bad">(B) comply</span><span className="is-ok">(C) follow</span></div>
        <p className="pn-ex__why"><b>Sai vì:</b> “comply” phải đi với “with”.</p>
      </div>

      <ol className="pn-steps" aria-label="Ba bước">
        <li><i>1</i>Mở trang chữa bài của đề vừa làm</li>
        <li><i>2</i>Chụp ảnh, nhiều trang một lúc cũng được</li>
        <li><i>3</i>Soát rồi lưu, đến hạn Sóc nhắc ôn</li>
      </ol>

      <button type="button" className="pn-cam is-big" onClick={onCapture}><CameraIcon /> Chụp trang chữa bài</button>
      <button type="button" className="pn-link" onClick={onManual}>hoặc tự gõ một câu</button>
      <span className="pn-only">Sóc đọc ảnh Part 5–7 · phần Nghe bạn ghi lý do sai</span>
    </section>
  );
}

export function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}
