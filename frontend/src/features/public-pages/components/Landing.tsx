import { useState, type ReactNode } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { SIGN_IN_PATH } from '@/app/routing/routes';
import { HeroSceneDesk, HeroScenePhone, RankArt, StepCaptureArt, StepClimbArt, StepExplainArt } from './PublicScenes';

const STEPS = [
  { n: 1, tone: 'green', title: 'Ghi điểm & chụp trang chữa bài', text: 'Nhập điểm Nghe, Đọc rồi chụp trang có câu sai.', art: <StepCaptureArt /> },
  { n: 2, tone: 'violet', title: 'Sóc đọc câu sai, giải thích', text: 'Mỗi câu thành một thẻ: đáp án đúng, vì sao sai, từ cần nhớ.', art: <StepExplainArt /> },
  { n: 3, tone: 'gold', title: 'Ôn đúng hạn, leo lên cúp', text: 'Thẻ đến hạn chờ ở Hôm nay. Mỗi đề mới là một bậc trên đường.', art: <StepClimbArt /> }
] as const;

const DEMO_OPTIONS = [
  { letter: 'A', text: 'at' },
  { letter: 'B', text: 'by' },
  { letter: 'C', text: 'on' },
  { letter: 'D', text: 'during' },
] as const;

/** Giới thiệu: the road to the trophy with Sóc, one main action, then how it works in three scenes. */
export function Landing({ brand }: { brand: ReactNode }) {
  const [picked, setPicked] = useState<string | null>(null);
  const revealed = picked !== null;
  const right = picked === 'B';

  return (
    <>
      <section className="pub-hero" aria-labelledby="pub-hero-title">
        <HeroSceneDesk />
        <div className="pub-hero__inner">
          <header className="pub-head pub-head--hero">{brand}</header>
          <div className="pub-hero__copy">
            <h1 id="pub-hero-title">Chụp câu sai,<em> Sóc biến thành thẻ ôn có lời giải</em></h1>
            <p className="pub-hero__sub">Ghi điểm từng đề, ôn đúng lúc và đi từng bậc tới điểm mục tiêu.</p>
          </div>
          <div className="pub-hero__phoneart"><HeroScenePhone /></div>
          <div className="pub-hero__cta">
            <a href="/" className="rd-btn pub-hero__go">Bắt đầu miễn phí</a>
            <p className="pub-hero__login">Đã có tài khoản? <a href={SIGN_IN_PATH}>Đăng nhập</a></p>
          </div>
        </div>
      </section>

      <main className="pub-main">
        <section className="pub-steps" aria-labelledby="pub-steps-title">
          <h2 id="pub-steps-title" className="pub-h2">Sóc giúp bạn thế nào</h2>
          <ol className="pub-steps__list">
            {STEPS.map(s => (
              <li key={s.n} className={`pub-step pub-step--${s.tone}`}>
                <div className="pub-step__scene">{s.art}</div>
                <h3><span className="pub-step__n" aria-hidden="true">{s.n}</span>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pub-extras" aria-labelledby="pub-extras-title">
          <h2 id="pub-extras-title" className="pub-extras__label">Thêm cho vui</h2>
          <div className="pub-extra pub-extra--rank">
            <RankArt />
            <div><h3>Xếp hạng</h3><p>Đua sao mỗi tuần cùng nhóm 20 bạn, chỉ hiện biệt danh.</p></div>
          </div>
          <div className="pub-extra pub-extra--soc">
            <span className="pub-extra__socs" aria-hidden="true">
              <Soc state="proud" size={46} coat="xam" gear={['scarf']} /><Soc state="hi" size={54} coat="dau" gear={['crown']} /><Soc state="idle" size={46} coat="soco" gear={['glasses']} />
            </span>
            <div><h3>Hồ sơ Sóc</h3><p>Đổi màu lông, đội mũ, mở huy hiệu khi học đều.</p></div>
          </div>
        </section>

        <section className="pub-demo" aria-labelledby="pub-demo-title">
          <div className="pub-demo__head">
            <div>
              <small className="pub-extras__label">TRẢI NGHIỆM NHANH</small>
              <h2 id="pub-demo-title" className="pub-h2">Thử 1 thẻ ôn của Sóc</h2>
            </div>
            {revealed && (
              <button type="button" className="pub-demo__reset" onClick={() => setPicked(null)}>Thử lại</button>
            )}
          </div>
          <div className="pub-demo__card">
            <div className="pub-demo__tags">
              <span className="pub-demo__tag is-part">Part 5 · Câu 108</span>
              <span className="pub-demo__tag is-cat">Giới từ thời gian</span>
            </div>
            <p className="pub-demo__q" lang="en">
              The quarterly financial report must be <mark className={revealed ? 'is-clue' : ''}>submitted</mark> to the director ______ <mark className={revealed ? 'is-clue' : ''}>Friday afternoon</mark>.
            </p>
            <div className="pub-demo__opts" role="group" aria-label="Chọn đáp án mẫu">
              {DEMO_OPTIONS.map(o => {
                const isAns = o.letter === 'B';
                const isPick = o.letter === picked;
                const cls = !revealed ? '' : isAns ? ' is-ok' : isPick ? ' is-bad' : ' is-dim';
                return (
                  <button key={o.letter} type="button" className={'pub-demo__opt' + cls} onClick={() => setPicked(o.letter)}>
                    <em>{o.letter}</em><span>{o.text}</span>
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <div className="pub-demo__tip">
                <Soc state={right ? 'cheerC' : 'focus'} size={50} />
                <div>
                  <p><b>{right ? 'Chuẩn rồi! ' : 'Gần trúng rồi! Đáp án là (B) by. '}</b>Mẹo nhanh: Dùng <b>by + mốc thời gian</b> để nói hạn chót phải hoàn thành xong (<i>submitted</i>).</p>
                  <div className="pub-demo__words">
                    <span><b lang="en">submitted</b> · nộp</span>
                    <span><b lang="en">quarterly</b> · hằng quý</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="pub-demo__hint">Chạm một đáp án A–D để xem Sóc giải thích như thế nào.</p>
            )}
          </div>
        </section>

        <section className="pub-close" aria-label="Bắt đầu học">
          <div>
            <h2>Sẵn sàng leo nấc thang TOEIC của bạn?</h2>
            <p>Dùng ngay không cần đăng ký, hoặc thử quy đổi điểm sang CEFR / IELTS.</p>
          </div>
          <div className="pub-close__acts">
            <a href="/" className="rd-btn pub-hero__go">Bắt đầu miễn phí</a>
            <a href="/quy-doi-diem" className="rd-btn rd-btn--white pub-close__sec">Quy đổi điểm TOEIC ↔ IELTS</a>
          </div>
        </section>
      </main>
    </>
  );
}
