import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, ShieldCheck, Target } from 'lucide-react';
import { CARD } from './surfaces';

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
          <p>Cập nhật: 23/09/2026. Đơn vị vận hành: {operator}.</p>
          <section><h2 className="font-bold text-base">Dữ liệu chúng tôi xử lý</h2><p>Ứng dụng lưu hồ sơ học tập gồm tên hiển thị, mục tiêu, ngày thi, kết quả làm đề, lỗi sai, số từ vựng, checklist và lịch sử Phòng Thi. Nếu đăng nhập, Supabase Auth xử lý email hoặc định danh Google để xác thực; các bản ghi học tập được đồng bộ với tài khoản.</p></section>
          <section><h2 className="font-bold text-base">Nơi lưu và mục đích</h2><p>Chế độ khách lưu dữ liệu trên trình duyệt của thiết bị này. Khi đăng nhập, dữ liệu tài khoản được lưu tại Supabase để đồng bộ giữa các thiết bị. Chúng tôi dùng dữ liệu để hiển thị tiến độ, phân tích và khôi phục theo lựa chọn của bạn. Ứng dụng hiện không tích hợp quảng cáo hay công cụ phân tích hành vi bên thứ ba.</p></section>
          <section><h2 className="font-bold text-base">Quyền kiểm soát của bạn</h2><p>Bạn có thể xuất bản sao lưu JSON, xóa dữ liệu trên máy, đăng xuất hoặc yêu cầu xóa tài khoản ngay trong Cài đặt. Xóa tài khoản xóa dữ liệu tài khoản trên server; bản dữ liệu đã lưu trên thiết bị không tự bị xóa. Bạn có thể xóa dữ liệu cục bộ riêng trong Cài đặt hoặc bằng chức năng xóa dữ liệu trang web của trình duyệt.</p></section>
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
