import type { ReactNode } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { SIGN_IN_PATH } from '@/app/routing/routes';
import { HeroSceneDesk, HeroScenePhone, RankArt, StepCaptureArt, StepClimbArt, StepExplainArt } from './PublicScenes';

const STEPS = [
  { n: 1, tone: 'green', title: 'Ghi điểm & chụp trang chữa bài', text: 'Nhập điểm Nghe, Đọc rồi chụp trang có câu sai.', art: <StepCaptureArt /> },
  { n: 2, tone: 'violet', title: 'Sóc đọc câu sai, giải thích', text: 'Mỗi câu thành một thẻ: đáp án đúng, vì sao sai, từ cần nhớ.', art: <StepExplainArt /> },
  { n: 3, tone: 'gold', title: 'Ôn đúng hạn, leo lên cúp', text: 'Thẻ đến hạn chờ ở Hôm nay. Mỗi đề mới là một bậc trên đường.', art: <StepClimbArt /> }
] as const;

/** Giới thiệu: the road to the trophy with Sóc, one main action, then how it works in three scenes. */
export function Landing({ brand }: { brand: ReactNode }) {
  return (
    <>
      <section className="pp-hero" aria-labelledby="pp-hero-title">
        <HeroSceneDesk />
        <div className="pp-hero__inner">
          <header className="pp-head pp-head--hero">{brand}</header>
          <div className="pp-hero__copy">
            <h1 id="pp-hero-title">Chụp câu sai,<em> Sóc biến thành thẻ ôn có lời giải</em></h1>
            <p className="pp-hero__sub">Ghi điểm từng đề, ôn đúng lúc và đi từng bậc tới điểm mục tiêu.</p>
          </div>
          <div className="pp-hero__phoneart"><HeroScenePhone /></div>
          <div className="pp-hero__cta">
            <a href="/" className="rd-btn pp-hero__go">Bắt đầu miễn phí</a>
            <p className="pp-hero__login">Đã có tài khoản? <a href={SIGN_IN_PATH}>Đăng nhập</a></p>
          </div>
        </div>
      </section>

      <main className="pp-main">
        <section className="pp-steps" aria-labelledby="pp-steps-title">
          <h2 id="pp-steps-title" className="pp-h2">Sóc giúp bạn thế nào</h2>
          <ol className="pp-steps__list">
            {STEPS.map(s => (
              <li key={s.n} className={`pp-step pp-step--${s.tone}`}>
                <div className="pp-step__scene">{s.art}</div>
                <h3><span className="pp-step__n" aria-hidden="true">{s.n}</span>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pp-extras" aria-labelledby="pp-extras-title">
          <h2 id="pp-extras-title" className="pp-extras__label">Thêm cho vui</h2>
          <div className="pp-extra pp-extra--rank">
            <RankArt />
            <div><h3>Xếp hạng</h3><p>Đua sao mỗi tuần cùng nhóm 20 bạn, chỉ hiện biệt danh.</p></div>
          </div>
          <div className="pp-extra pp-extra--soc">
            <span className="pp-extra__socs" aria-hidden="true">
              <Soc state="proud" size={46} coat="xam" gear={['scarf']} /><Soc state="hi" size={54} coat="dau" gear={['crown']} /><Soc state="idle" size={46} coat="soco" gear={['glasses']} />
            </span>
            <div><h3>Hồ sơ Sóc</h3><p>Đổi màu lông, đội mũ, mở huy hiệu khi học đều.</p></div>
          </div>
        </section>
      </main>
    </>
  );
}
