# Duyệt tài khoản AI cho beta

Tài khoản học và quyền AI là hai phần riêng. Chưa được duyệt AI vẫn nhập điểm, ghi sổ tay và lưu thủ công như bình thường. Chế độ này không cấp quyền quản trị ứng dụng hay quyền đọc dữ liệu của người khác.

## Bật lần đầu

1. Áp dụng `supabase/migrations/20261011000000_ai_access_grants.sql` vào dự án Supabase đang dùng. Migration chỉ thêm bảng/quy tắc quyền AI; không xóa thẻ, ảnh, bài thi hay bộ đếm lượt.
2. Tất cả tài khoản có email hiện có được đưa vào bảng với trạng thái `pending`. Tài khoản Google `anhphine1011@gmail.com` đã được xác minh được khởi tạo `active`, hạn mức `NULL`, để giữ miễn hạn mức AI ứng dụng trước đây. Migration không ghi đè quyền đã chỉnh khi chạy lại.
3. Deploy backend mới, sau đó đặt `AI_ACCESS_MANAGED=true` trên Render. `/ready` phải trả 200 và `/health` có `managed_ai_access: true`. Frontend mới đọc trạng thái qua `/api/v1/ai/usage`.
4. Kiểm tra tài khoản chủ đang `active` và `monthly_limit=NULL`; thử tài khoản tester chưa duyệt phải nhận thông báo chờ duyệt. Quyền được kiểm tra trên mỗi yêu cầu, không cần người dùng đăng nhập lại sau khi cậu duyệt.

Chưa áp dụng migration thì giữ `AI_ACCESS_MANAGED=false`. Nếu bật khi bảng thiếu hoặc mất kết nối, backend từ chối AI và báo lỗi kiểm tra quyền; không tự chuyển sang quota/danh sách miễn cũ.

## Duyệt và chỉnh hạn mức

Tester đăng nhập Google vào web một lần. Trong Supabase **Table Editor → public → ai_access_grants**, tìm bằng `email` rồi sửa hai cột:

| Cột | Giá trị | Ý nghĩa |
| --- | --- | --- |
| `status` | `pending` | Chờ duyệt, chưa dùng AI |
| `status` | `active` | Được dùng AI theo hạn mức |
| `status` | `blocked` | Tạm khóa AI, vẫn dùng tính năng học khác |
| `monthly_limit` | `30` | Tối đa 30 yêu cầu phân tích trong tháng |
| `monthly_limit` | `NULL` | Miễn hạn mức AI của ứng dụng; chỉ dành cho tài khoản được tin cậy |

`email` và `display_name` chỉ để tìm người; được lấy từ Supabase Auth và không quyết định quyền. Quyền gắn với `user_id`, không sửa `user_id` sang người khác. Tài khoản mới hoặc guest chuyển thành tài khoản đăng nhập luôn vào `pending`; thông tin người dùng tự sửa không thể duyệt AI. Không cấp quyền Table Editor/Dashboard cho tester.

Khi chế độ được bật, bảng này là nguồn quyền duy nhất; `AI_UNLIMITED_EMAILS` không ghi đè tài khoản `blocked` hay `pending`. Khách phải đăng nhập và được duyệt mới dùng AI.

## Cách đếm lượt và các giới hạn còn lại

- Dùng lại `ai_usage_counters`. Sửa `monthly_limit`, tạm khóa/mở lại hoặc xóa trắng dữ liệu học không đặt lại số lượt đã dùng. Giảm hạn mức thấp hơn số đã dùng thì yêu cầu tiếp theo bị chặn; tăng hạn mức cho phép dùng phần còn lại.
- Hạn mức theo tháng UTC, lượt tháng mới bắt đầu 07:00 ngày đầu tháng theo giờ Việt Nam. Yêu cầu đã được reserve vẫn tính lượt nếu provider lỗi; request trùng ID bị chặn, không tự gọi lại OpenAI.
- Tài khoản có hạn mức vẫn chịu `AI_GLOBAL_DAILY_LIMIT`, `AI_GLOBAL_MINUTE_LIMIT`, `AI_IP_DAILY_LIMIT` và các giới hạn API. `monthly_limit=NULL` miễn các hạn mức AI ứng dụng theo cơ chế cũ, không miễn ngân sách/hạn mức của OpenAI hoặc giới hạn dung lượng ảnh.
- Quyền tạm khóa có hiệu lực ở yêu cầu tiếp theo. Yêu cầu đã được nhận và đang phân tích có thể hoàn tất.
- Bảng bật RLS và thu hồi quyền truy cập của `anon`/`authenticated`; chỉ quản trị dự án và backend service role được đọc/ghi. Backend chỉ gửi trạng thái/hạn mức của chính tài khoản hiện tại về frontend.
- Xóa tài khoản Auth sẽ xóa quyền qua khóa ngoại; bản sao JSON học tập không chứa quyền và không thể khôi phục/tự nâng quyền AI.

## Quay về cơ chế cũ

Đặt `AI_ACCESS_MANAGED=false` sẽ dùng lại hạn mức chung và danh sách email miễn giới hạn. Đây là thay đổi cách cấp quyền, không chỉ là tắt tính năng AI. Nếu muốn ngừng toàn bộ phân tích, dùng `AI_ENABLED=false`.

## Trạng thái triển khai

Ngày 11/10/2026: đã áp dụng migration qua SQL Editor vào dự án `nztodqxtteqromszwwfg`, xác minh RLS/grants/trigger và quyền tài khoản chủ; backend local đã bật `AI_ACCESS_MANAGED=true`, `/ready` đạt. Lần áp dụng đầu chỉ tạo mới trigger (không dùng hai lệnh DROP trigger dành cho chạy lại); schema cuối cùng tương đương migration trong repo. Dự án hiện chưa có bảng lịch sử Supabase CLI migrations; lần áp dụng này được ghi nhận tại đây.

Ngày 11/10/2026: bản `f66d23c` đã deploy trên Render/Vercel; `AI_ACCESS_MANAGED=true` và `SOURCE_IMAGES_ENABLED=true` trên Render. `/ready` đạt, proxy frontend đọc được capability mới và tài khoản pending nhận đúng thông báo trên online. Mỗi lần nâng phiên bản tiếp theo vẫn cần kiểm tra readiness, quyền AI và luồng ảnh trên môi trường đích.
