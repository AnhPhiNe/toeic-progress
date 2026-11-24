import React, { useEffect } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { Landing } from './Landing';
import { MeadowStrip } from './PublicScenes';
import './public.css';

export type PublicPageKind = 'about' | 'privacy' | 'terms';

export function publicPageFromPath(path: string): PublicPageKind | null {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/gioi-thieu') return 'about';
  if (normalized === '/chinh-sach-quyen-rieng-tu') return 'privacy';
  if (normalized === '/dieu-khoan') return 'terms';
  return null;
}

const operator = import.meta.env.VITE_OPERATOR_NAME || 'TOEIC Progress';
const support = import.meta.env.VITE_SUPPORT_EMAIL || '';

/** Brand mark of the public pages: the sidebar's Sóc tile with the two-line word mark. */
export const PublicBrand: React.FC = () => (
  <a href="/gioi-thieu" className="pub-brand" aria-label="TOEIC Progress · Giới thiệu">
    <span className="pub-brand__mark" aria-hidden="true"><Soc state="idle" size={42} coat="nau" /></span>
    <b className="pub-brand__word">toeic<span>progress</span></b>
  </a>
);

/** Meadow, page links and the small "không liên kết với ETS" line, shared by every public page. */
export const PublicFooter: React.FC = () => (
  <footer className="pub-foot">
    <MeadowStrip />
    <div className="pub-foot__band">
      <nav aria-label="Trang công khai" className="pub-foot__links">
        <a href="/gioi-thieu">Giới thiệu</a><span aria-hidden="true">·</span>
        <a href="/chinh-sach-quyen-rieng-tu">Chính sách quyền riêng tư</a><span aria-hidden="true">·</span>
        <a href="/dieu-khoan">Điều khoản</a>
      </nav>
      <p className="pub-foot__note">TOEIC Progress là công cụ theo dõi cá nhân, không liên kết với ETS và không cung cấp đề thi hoặc điểm TOEIC chính thức.</p>
    </div>
  </footer>
);

export const PublicPage: React.FC<{ kind: PublicPageKind }> = ({ kind }) => {
  const title = kind === 'about' ? 'Giới thiệu' : kind === 'privacy' ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng';
  useEffect(() => { document.title = `${title} · TOEIC Progress`; }, [title]);
  if (kind === 'about') return <div className="rd pub"><Landing brand={<PublicBrand />} /><PublicFooter /></div>;
  return <div className="rd pub">
    <header className="pub-head">
      <PublicBrand />
      <a href="/" className="rd-btn rd-btn--white pub-head__app">Vào ứng dụng</a>
    </header>
    <main className="pub-doc">
      <article className="pub-article">
        <div className="pub-article__head">
          <Soc state="focus" size={58} />
          <h1>{title}</h1>
        </div>
        {kind === 'privacy' && <div className="pub-legal">
          <p>Cập nhật: 21/11/2026. Đơn vị vận hành: {operator}.</p>
          <section><h2>Dữ liệu chúng tôi xử lý</h2><p>Ứng dụng lưu hồ sơ học tập gồm tên hiển thị, mục tiêu, ngày thi, kết quả làm đề, lỗi sai, số từ vựng và lịch sử Phòng Thi. Nếu đăng nhập, Supabase Auth xử lý email hoặc định danh Google để xác thực; các bản ghi học tập được đồng bộ với tài khoản.</p></section>
          <section><h2>Nơi lưu và mục đích</h2><p>Chế độ khách lưu dữ liệu trên trình duyệt của thiết bị này. Khi đăng nhập, dữ liệu tài khoản được lưu tại Supabase để đồng bộ giữa các thiết bị. Chúng tôi dùng dữ liệu để hiển thị tiến độ, phân tích và khôi phục theo lựa chọn của bạn. Ứng dụng không có quảng cáo. Để biết trang nào được dùng, ứng dụng dùng Vercel Web Analytics: chỉ đếm lượt xem trang ở dạng tổng hợp (trang, thiết bị, quốc gia, nguồn truy cập), không dùng cookie, không gắn với tài khoản và không gửi nội dung học tập.</p></section>
          <section><h2>Xếp hạng</h2><p>Xếp hạng là tự chọn và cần đăng nhập. Khi tham gia, những người cùng nhóm (tối đa 20 người) thấy biệt danh bạn đặt, màu lông Sóc, số sao trong tuần, hạng mùa và các bảng cho vui: điểm tăng Nghe/Đọc so với đề đầu (chỉ số điểm tăng, không phải điểm), số phút học, chuỗi ngày và số thẻ ôn đúng trong tuần. Họ không thấy tên thật, email hay điểm TOEIC của bạn. Sao và điểm hạng do máy chủ tính từ dữ liệu học đã đồng bộ (đề, buổi luyện, mẻ bánh, từ vựng, thẻ câu sai), tối đa 60 sao mỗi ngày; điểm TOEIC tự ghi không bao giờ tính vào hạng. Bạn có thể đổi biệt danh hoặc rời bảng bất cứ lúc nào.</p></section>
          <section><h2>Bản nháp trên thiết bị</h2><p>Nội dung đang nhập ở Nhập điểm và Sổ tay được tự lưu trên trình duyệt, tách theo tài khoản để khôi phục khi mở lại. Bản nháp chưa đồng bộ sang thiết bị khác. Ảnh chưa tải lên kho riêng tư phải được chọn lại sau khi tải lại trang; bản nháp không lưu tệp ảnh, liên kết xem ảnh có token hay khóa API. Lưu thành công, bỏ nháp hoặc xóa trắng dữ liệu của tài khoản trên thiết bị này sẽ xóa bản nháp tương ứng.</p></section>
          <section><h2>AI và xác minh yêu cầu</h2><p>Khi bấm “Phân tích với AI”, bạn gửi câu hỏi, phương án, đoạn trích, ảnh Part 1/7 đính kèm và lựa chọn/lý do đã nhập qua backend tới OpenAI. Nội dung được xử lý theo chính sách của OpenAI. Kết quả là bản nháp; chỉ thao tác lưu của bạn mới ghi thành thẻ học tập. Khách được tạo định danh ẩn danh qua Supabase; Cloudflare Turnstile xác minh yêu cầu. Backend giữ số lượt, thời điểm, mã yêu cầu, hash nội dung và hash địa chỉ IP để giới hạn sử dụng, không đưa nguyên văn câu hỏi, bản nháp AI hoặc ảnh vào log giới hạn sử dụng. Khi chức năng lưu ảnh nguồn được bật, ảnh tài khoản được lưu riêng tư ở Supabase Storage để xem lại và dùng chung cho các câu cùng bài; chỉ tài khoản sở hữu được tạo liên kết xem ảnh. Mỗi câu mới được phân tích cùng bộ ảnh nguồn đã lưu. Bản nháp phân tích có thể đã có ảnh trong kho trước khi lưu thẻ. Chế độ khách hoặc phiên bản chưa bật lưu ảnh chỉ giữ ảnh tạm trong form và lưu ngữ cảnh bằng chữ. Dữ liệu học của khách vẫn lưu trên thiết bị; đăng nhập Google mới bật đồng bộ.</p></section>
          <section><h2>Sóc nhận xét một đề (OpenAI)</h2><p>Chỉ khi bạn bấm “Nhờ Sóc xem” ở một đề trong Hành trình điểm (lần đầu cần tick ô đồng ý), backend gửi tới OpenAI, cùng nơi nhận với các chức năng AI khác: điểm Nghe/Đọc/Tổng và số câu đúng từng Part của đề đó, thời gian làm nếu bạn đã ghi, và các câu sai đã lưu của đề đó (câu hỏi, phương án, đáp án, lý do và ghi chú bạn nhập). Luồng này không gửi tên, email tài khoản hay ảnh nguồn. Ghi chú do bạn nhập vẫn có thể chứa thông tin cá nhân; hãy kiểm tra trước khi gửi. Mở đề hoặc xem lại nhận xét đã lưu không tự gọi AI. Nhận xét được lưu trên trình duyệt theo tài khoản và có thể chỉ dựa trên một phần câu sai đã ghi; hãy đối chiếu trước khi áp dụng. Nội dung gửi tới OpenAI được xử lý theo chính sách của OpenAI.</p></section>
          <section><h2>Quyền kiểm soát của bạn</h2><p>Bạn có thể xuất bản sao lưu JSON (chứa mã tham chiếu ảnh, không chứa tệp ảnh), xóa dữ liệu trên máy, đăng xuất hoặc yêu cầu xóa tài khoản ngay trong Cài đặt. Xóa tài khoản xóa dữ liệu tài khoản trên server; bản dữ liệu đã lưu trên thiết bị không tự bị xóa. Bạn có thể xóa dữ liệu cục bộ riêng trong Cài đặt hoặc bằng chức năng xóa dữ liệu trang web của trình duyệt.</p></section>
          <section><h2>Xóa trắng nội dung học</h2><p>Khi đăng nhập, xóa trắng loại nội dung học của tài khoản khỏi toàn bộ các bảng chi tiết trên máy chủ; máy chủ chỉ giữ mã bản ghi và dấu xóa để đồng bộ. Thiết bị khác loại nội dung cũ, bản nháp cục bộ, nhận xét AI và ticket lời giải cục bộ khi kết nối lại. Ảnh nguồn cũ không còn được thẻ tham chiếu cũng được dọn khỏi Storage (kể cả khi tạm tắt lưu ảnh mới); nếu dọn bị gián đoạn, app báo rõ và cho thử lại. Tài khoản đăng nhập và hạn mức AI vẫn giữ. Dữ liệu khách riêng và tệp sao lưu đã tải không bị xóa từ xa. Khi dùng khách, xóa trắng chỉ tác động dữ liệu khách trên trình duyệt đang dùng.</p></section>
          <section><h2>Liên hệ</h2><p>{support ? <>Gửi yêu cầu về quyền riêng tư tới <a href={`mailto:${support}`}>{support}</a>.</> : 'Kênh liên hệ hỗ trợ sẽ được công bố trước khi mở công khai.'}</p></section>
        </div>}
        {kind === 'terms' && <div className="pub-legal">
          <p>Cập nhật: 21/11/2026. Đơn vị vận hành: {operator}.</p>
          <section><h2>Phạm vi dịch vụ</h2><p>TOEIC Progress là công cụ cá nhân để ghi chép và phân tích việc luyện thi. Ứng dụng không tổ chức kỳ thi, chấm thi chính thức hoặc đại diện ETS. Điểm dự kiến và mức lợi ích “ước tính” chỉ giúp tự theo dõi, không bảo đảm kết quả thi thực tế.</p></section>
          <section><h2>Tài khoản và dữ liệu</h2><p>Bạn chịu trách nhiệm về thông tin mình nhập và có thể sao lưu dữ liệu bất cứ lúc nào. Chế độ khách chỉ lưu trên thiết bị đang dùng. Đồng bộ nhiều thiết bị cần tài khoản và kết nối mạng. Khi đăng nhập trên trình duyệt đang có dữ liệu khách, ứng dụng luôn hỏi cách xử lý trước khi gộp và dọn bản khách sau khi chuyển để tránh trộn giữa các tài khoản.</p></section>
          <section><h2>Nội dung tải lên và bản quyền tự học</h2><p>Ảnh chụp đề, câu hỏi và ghi chú bạn tải lên chỉ được lưu riêng tư cho tài khoản của bạn để phục vụ ghi chép và tự ôn tập cá nhân, không công khai hay phân phối lại cho người dùng khác. Bạn cam kết chỉ tải lên tài liệu bạn có quyền sử dụng hợp pháp và không dùng ứng dụng để phát tán nội dung có bản quyền. Chủ sở hữu quyền tác giả cần yêu cầu gỡ bỏ nội dung vui lòng liên hệ qua kênh hỗ trợ bên dưới để được xử lý.</p></section>
          <section><h2>Sử dụng hợp lệ</h2><p>Không dùng dịch vụ để xâm nhập, phá hoại hoặc cố truy cập dữ liệu của người khác. Chúng tôi có thể cập nhật chức năng và điều khoản; thay đổi quan trọng sẽ được thông báo trong ứng dụng trước khi áp dụng.</p></section>
          <section><h2>Liên hệ</h2><p>{support ? <a href={`mailto:${support}`}>{support}</a> : 'Kênh liên hệ hỗ trợ sẽ được công bố trước khi mở công khai.'}</p></section>
        </div>}
      </article>
    </main>
    <PublicFooter />
  </div>;
};
