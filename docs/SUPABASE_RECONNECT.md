# Chuẩn bị nối dự án Supabase mới

Trạng thái: đang chuẩn bị, chưa tạo dự án đích, chưa thay môi trường và chưa xóa project/dữ liệu cũ. Nhánh rà soát: `codex/full-app-audit`, nền `1f057e0`.

## Phần giữ lại

Giữ SDK, FastAPI, schema nghiệp vụ, migration, RLS/RPC, đồng bộ/tombstone/reset, kiểm thử và backup. URL/key được đọc từ môi trường, không cần viết lại những phần này khi đổi project.

`SUPABASE_SERVICE_ROLE_KEY` là tương thích JWT cũ, không phải cấu hình project cũ hardcode. Project mới dùng `SUPABASE_SECRET_KEY`, chỉ ở backend. Phân biệt khóa ứng dụng với phiên đăng nhập theo [tài liệu API keys](https://supabase.com/docs/guides/getting-started/api-keys).

`supabase/functions/delete-account/` là endpoint cũ; frontend hiện gọi FastAPI `DELETE /api/v1/account`. Không deploy function cũ sang project mới. Chỉ retire endpoint đang deploy ở project cũ sau khi xác minh không còn client sử dụng.

## Cấu hình cần thay

| Vị trí | Cấu hình |
| --- | --- |
| `frontend/.env.local`, Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `backend/.env`, Render | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| Supabase Auth | Google provider, Site URL, redirect allowlist; SMTP nếu bật OTP |
| Nếu đổi API/domain | `VITE_API_URL`, `CORS_ORIGINS`, `ALLOWED_HOSTS`; proxy `/api/ai-status` ở `frontend/vercel.json` và điều kiện production trong `aiMistakeExtractor.ts` |
| Nếu bật AI cho khách | Anonymous Sign-Ins, CAPTCHA, Turnstile site key/secret/hostname |

Frontend/backend phải cùng project và publishable key. Kiểm tra local hiện tại xác nhận hai bên khớp; chưa kiểm chứng môi trường hosting. Không chép secret, token, mật khẩu vào chat/log/Git. Vite cần restart ở local và rebuild/redeploy ở hosting sau khi đổi env.

Redirect ứng dụng phải thuộc allowlist; Site URL và Google callback của project mới cần cấu hình riêng. Xem [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Migration cho project trống

Chạy một file: `supabase/migrations/20261120000000_baseline_v2.sql` (hoặc `supabase db push`). Áp dụng lại trên v2 không thay đổi gì; trên database còn đối tượng v1 thì dừng và yêu cầu `supabase/rebuild/drop_v1.sql` (xem [DB_REBUILD_2026-11.md](DB_REBUILD_2026-11.md)).


Các migration v1 nằm ở `supabase/migrations/archive/` chỉ để tra cứu; CLI không đọc thư mục con này.

Nếu giữ tài khoản/data server cũ, chọn phương án migrate riêng trước. Backup JSON của app chứa dữ liệu học, không chứa mật khẩu hay toàn bộ Supabase Auth. Xem [migration giữa các project](https://supabase.com/docs/guides/platform/migrating-within-supabase) và [migrate Auth users](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects).

## Thứ tự chuyển kết nối

1. Xuất backup và kiểm chứng restore bằng dữ liệu thử. Giữ project cũ để đối chiếu/rollback.
2. Tạo staging mới, áp migration, cấu hình Auth và backend/frontend đồng bộ.
3. Kiểm tra `/ready`, Google login và hai tài khoản. B không đọc được A; khách không gọi đồng bộ/reset tài khoản.
4. Thử hai thiết bị: tạo/sửa buổi học, từ vựng, lỗi sai, kế hoạch; mất mạng, đổi tài khoản, backup/restore, reset và xóa bằng tài khoản thử.
5. Trước khi đổi project trên cùng origin, xuất backup và đăng xuất phiên cũ. Active account/bundle/cursor dùng UUID, chưa kèm project; không dùng lại cursor server cũ trên server mới. Thử bằng origin/profile staging riêng trước. Không xóa toàn bộ localStorage vì còn dữ liệu khách và bundle học.
6. Khi staging đã được xác nhận, chuyển cấu hình production, rebuild/redeploy, đăng nhập lại và kiểm tra dữ liệu. Sau đó mới thu hồi credential/endpoint hoặc retire project cũ.

Rollback: phục hồi cấu hình frontend/backend cũ cùng nhau, rebuild/restart và đăng nhập lại; chỉ dùng dữ liệu/cursor đúng project. Không đẩy cache chưa xác minh vào cả hai server.

## Giới hạn kiểm chứng

Local/mock/database tests chứng minh các luồng và ràng buộc trong repo. Chúng chưa chứng minh SQL đang deploy, Auth provider/redirect, RLS của project mới, đồng bộ hai thiết bị thật hay proxy IP của hosting. Các bước đó cần project staging đích; kiểm tra tracker không cần gọi AI trả phí.
