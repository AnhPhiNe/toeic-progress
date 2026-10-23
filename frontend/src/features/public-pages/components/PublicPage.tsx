import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, ShieldCheck, Target } from 'lucide-react';
import { CARD } from '@/shared/ui/surfaces';

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

export const PublicPage: React.FC<{ kind: PublicPageKind }> = ({ kind }) => {
  const title = kind === 'about' ? 'Giới thiệu' : kind === 'privacy' ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng';
  useEffect(() => { document.title = `${title} · TOEIC Progress`; }, [title]);
  return <div className="min-h-screen bg-[#EAEFF5] px-4 py-7 text-slate-800 dark:bg-[#0B111E] dark:text-slate-100 sm:py-12">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <a href="/gioi-thieu" className="text-lg font-extrabold text-slate-900 dark:text-white">TOEIC Progress</a>
        <a href="/" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Vào ứng dụng <ArrowRight size={15} className="inline" /></a>
      </header>
      <main className={`${CARD} space-y-5`}>
        <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
        {kind === 'about' && <>
          <p className="text-slate-600 dark:text-slate-300">TOEIC Progress giúp bạn ghi lại kết quả làm đề, theo dõi tiến bộ, nhận diện nhóm lỗi và duy trì lịch học. Bạn có thể bắt đầu ngay ở chế độ khách; tài khoản chỉ cần khi muốn đồng bộ nhiều thiết bị.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><Target className="mb-2 text-blue-600" />Đặt mục tiêu và theo dõi điểm</div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><BookOpen className="mb-2 text-blue-600" />Ghi lỗi sai và từ vựng</div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><ShieldCheck className="mb-2 text-blue-600" />Xuất bản sao lưu dữ liệu</div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">TOEIC Progress là công cụ theo dõi cá nhân, không liên kết với ETS và không cung cấp đề thi hoặc điểm TOEIC chính thức.</p>
        </>}
        {kind === 'privacy' && <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>Cập nhật: 23/10/2026. Đơn vị vận hành: {operator}.</p>
          <section><h2 className="font-bold text-base">Dữ liệu chúng tôi xử lý</h2><p>Ứng dụng lưu hồ sơ học tập gồm tên hiển thị, mục tiêu, ngày thi, kết quả làm đề, lỗi sai, số từ vựng, checklist và lịch sử Phòng Thi. Nếu đăng nhập, Supabase Auth xử lý email hoặc định danh Google để xác thực; các bản ghi học tập được đồng bộ với tài khoản.</p></section>
          <section><h2 className="font-bold text-base">Nơi lưu và mục đích</h2><p>Chế độ khách lưu dữ liệu trên trình duyệt của thiết bị này. Khi đăng nhập, dữ liệu tài khoản được lưu tại Supabase để đồng bộ giữa các thiết bị. Chúng tôi dùng dữ liệu để hiển thị tiến độ, phân tích và khôi phục theo lựa chọn của bạn. Ứng dụng hiện không tích hợp quảng cáo hay công cụ phân tích hành vi bên thứ ba.</p></section>
          <section><h2 className="font-bold text-base">Bản nháp trên thiết bị</h2><p>Nội dung đang nhập ở Nhập điểm và Sổ tay được tự lưu trên trình duyệt, tách theo tài khoản để khôi phục khi mở lại. Bản nháp chưa đồng bộ sang thiết bị khác. Ảnh chưa tải lên kho riêng tư phải được chọn lại sau khi tải lại trang; bản nháp không lưu tệp ảnh, liên kết xem ảnh có token hay khóa API. Lưu thành công, bỏ nháp hoặc xóa trắng dữ liệu của tài khoản trên thiết bị này sẽ xóa bản nháp tương ứng.</p></section>
          <section><h2 className="font-bold text-base">AI và xác minh yêu cầu</h2><p>Khi bấm “Phân tích với AI”, bạn gửi câu hỏi, phương án, đoạn trích, ảnh Part 1/7 đính kèm và lựa chọn/lý do đã nhập qua backend tới OpenAI. Nội dung được xử lý theo chính sách của OpenAI. Kết quả là bản nháp; chỉ thao tác lưu của bạn mới ghi thành thẻ học tập. Khách được tạo định danh ẩn danh qua Supabase; Cloudflare Turnstile xác minh yêu cầu. Backend giữ số lượt, thời điểm, mã yêu cầu, hash nội dung và hash địa chỉ IP để giới hạn sử dụng, không đưa nguyên văn câu hỏi, bản nháp AI hoặc ảnh vào log giới hạn sử dụng. Khi chức năng lưu ảnh nguồn được bật, ảnh tài khoản được lưu riêng tư ở Supabase Storage để xem lại và dùng chung cho các câu cùng bài; chỉ tài khoản sở hữu được tạo liên kết xem ảnh. Mỗi câu mới được phân tích cùng bộ ảnh nguồn đã lưu. Bản nháp phân tích có thể đã có ảnh trong kho trước khi lưu thẻ. Chế độ khách hoặc phiên bản chưa bật lưu ảnh chỉ giữ ảnh tạm trong form và lưu ngữ cảnh bằng chữ. Dữ liệu học của khách vẫn lưu trên thiết bị; đăng nhập Google mới bật đồng bộ.</p></section>
          <section><h2 className="font-bold text-base">Gợi ý ôn tập bằng DeepInfra</h2><p>Khi đồng ý và bấm “Phân tích bằng AI” tại trang Phân tích, backend gửi kết quả cùng nội dung câu hỏi, phương án, đáp án, lời giải và ghi chú gắn đúng lần làm đã chọn tới DeepInfra, dùng model DeepSeek để tạo gợi ý ôn tập. Luồng này không gửi ảnh nguồn hoặc email của bạn tới DeepInfra. Báo cáo được lưu trên trình duyệt theo tài khoản để xem lại; mở báo cáo đã lưu không tự gọi AI. Báo cáo có thể dựa trên một phần câu sai đã ghi chi tiết và cần được bạn đối chiếu trước khi áp dụng. Nội dung gửi tới DeepInfra được xử lý theo chính sách của dịch vụ đó.</p></section>
          <section><h2 className="font-bold text-base">Quyền kiểm soát của bạn</h2><p>Bạn có thể xuất bản sao lưu JSON (chứa mã tham chiếu ảnh, không chứa tệp ảnh), xóa dữ liệu trên máy, đăng xuất hoặc yêu cầu xóa tài khoản ngay trong Cài đặt. Xóa tài khoản xóa dữ liệu tài khoản trên server; bản dữ liệu đã lưu trên thiết bị không tự bị xóa. Bạn có thể xóa dữ liệu cục bộ riêng trong Cài đặt hoặc bằng chức năng xóa dữ liệu trang web của trình duyệt.</p></section>
          <section><h2 className="font-bold text-base">Xóa trắng nội dung học</h2><p>Khi đăng nhập, xóa trắng loại nội dung học của tài khoản khỏi dữ liệu đang phục vụ và bản legacy, gồm các bảng chi tiết; máy chủ chỉ giữ mã bản ghi và dấu xóa để đồng bộ. Thiết bị khác loại nội dung cũ khi kết nối lại. Ảnh nguồn cũ không còn được thẻ tham chiếu cũng được dọn khỏi Storage; nếu dọn bị gián đoạn, app báo rõ và cho thử lại. Tài khoản đăng nhập và hạn mức AI vẫn giữ. Dữ liệu khách riêng và tệp sao lưu đã tải không bị xóa từ xa. Khi dùng khách, xóa trắng chỉ tác động dữ liệu khách trên trình duyệt đang dùng.</p></section>
          <section><h2 className="font-bold text-base">Liên hệ</h2><p>{support ? <>Gửi yêu cầu về quyền riêng tư tới <a className="text-blue-700 underline dark:text-blue-300" href={`mailto:${support}`}>{support}</a>.</> : 'Kênh liên hệ hỗ trợ sẽ được công bố trước khi mở công khai.'}</p></section>
        </div>}
        {kind === 'terms' && <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>Cập nhật: 23/09/2026. Đơn vị vận hành: {operator}.</p>
          <section><h2 className="font-bold text-base">Phạm vi dịch vụ</h2><p>TOEIC Progress là công cụ cá nhân để ghi chép và phân tích việc luyện thi. Ứng dụng không tổ chức kỳ thi, chấm thi chính thức hoặc đại diện ETS. Điểm dự kiến và mức lợi ích “ước tính” chỉ giúp tự theo dõi, không bảo đảm kết quả thi thực tế.</p></section>
          <section><h2 className="font-bold text-base">Tài khoản và dữ liệu</h2><p>Bạn chịu trách nhiệm về thông tin mình nhập và có thể sao lưu dữ liệu bất cứ lúc nào. Chế độ khách chỉ lưu trên thiết bị đang dùng. Đồng bộ nhiều thiết bị cần tài khoản và kết nối mạng. Khi chuyển dữ liệu lên tài khoản đã có dữ liệu, ứng dụng sẽ hỏi cách xử lý trước.</p></section>
          <section><h2 className="font-bold text-base">Sử dụng hợp lệ</h2><p>Không dùng dịch vụ để xâm nhập, phá hoại hoặc cố truy cập dữ liệu của người khác. Chúng tôi có thể cập nhật chức năng và điều khoản; thay đổi quan trọng sẽ được thông báo trong ứng dụng trước khi áp dụng.</p></section>
          <section><h2 className="font-bold text-base">Liên hệ</h2><p>{support ? <a className="text-blue-700 underline dark:text-blue-300" href={`mailto:${support}`}>{support}</a> : 'Kênh liên hệ hỗ trợ sẽ được công bố trước khi mở công khai.'}</p></section>
        </div>}
      </main>
      <footer className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
        <a href="/gioi-thieu" className="hover:underline">Giới thiệu</a><a href="/chinh-sach-quyen-rieng-tu" className="hover:underline">Chính sách quyền riêng tư</a><a href="/dieu-khoan" className="hover:underline">Điều khoản</a>
      </footer>
    </div>
  </div>;
};
