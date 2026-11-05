# Quyền AI theo tài khoản

Tài khoản học và quyền AI là hai phần riêng. Không dùng được AI vẫn nhập điểm, ghi sổ tay và lưu thủ công như bình thường. Chế độ này không cấp quyền quản trị ứng dụng hay quyền đọc dữ liệu của người khác.

## Mở AI khi đăng nhập (từ 05/11/2026)

Không còn bước chờ duyệt. Đăng nhập Google là dùng AI ngay, trong hạn mức tháng mặc định (`AI_ACCOUNT_MONTHLY_LIMIT`, mặc định 10). Khách chưa đăng nhập bấm vào tính năng AI sẽ thấy lời mời đăng nhập Google, kèm lựa chọn nhập tay. Admin vẫn đặt `blocked` để khóa một tài khoản, hoặc sửa `monthly_limit`.

Triển khai:

1. Áp dụng `supabase/migrations/20261105000000_ai_access_open_by_default.sql` trong SQL Editor của Supabase. Migration đổi mặc định của `status` sang `active` và chuyển các tài khoản đang `pending` sang `active`; không đổi tài khoản `blocked` hay hạn mức đã chỉnh. Chạy lại không mở khóa tài khoản `blocked`.
2. Deploy backend mới. Giữ `AI_ACCESS_MANAGED=true`. Backend coi tài khoản đăng nhập chưa có dòng quyền là `active` với hạn mức mặc định, và trả mã `AI_LOGIN_REQUIRED` cho khách để giao diện mời đăng nhập.
3. Xem lại hạn mức chung trước khi mở cho sinh viên: `AI_GLOBAL_DAILY_LIMIT` (mặc định 20 lượt/ngày cho cả ứng dụng), `AI_GLOBAL_MINUTE_LIMIT`, `AI_IP_DAILY_LIMIT`. Đây là trần chi phí; khi chạm trần, mọi người nhận thông báo hết lượt trong ngày.

Phần dưới đây là lịch sử bật chế độ duyệt lần đầu, giữ để tra cứu.

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

`email` và `display_name` chỉ để tìm người; được lấy từ Supabase Auth và không quyết định quyền. Quyền gắn với `user_id`, không sửa `user_id` sang người khác. Tài khoản mới hoặc guest chuyển thành tài khoản đăng nhập vào `active` với hạn mức mặc định (trước 05/11/2026 là `pending`); thông tin người dùng tự sửa không thể duyệt AI. Không cấp quyền Table Editor/Dashboard cho tester.

Khi chế độ được bật, bảng này là nguồn quyền duy nhất; `AI_UNLIMITED_EMAILS` không ghi đè tài khoản `blocked` hay `pending`. Khách phải đăng nhập Google mới dùng AI.

## Cách đếm lượt và các giới hạn còn lại

### Đọc nhiều câu từ ảnh và viết lời giải kèm theo

- Một lần đọc ảnh câu hỏi (`extract-page`, tối đa 3 ảnh / 6 câu tìm thấy) tính một lượt quota ứng dụng. Lời giải tiếp theo cho các câu đó dùng ticket đã ký, gắn owner và nội dung, có hiệu lực 24 giờ. Ban đầu có tối đa sáu request OpenAI viết lời giải; tính cả hai lần thử lại cho mỗi câu thì có thể tới 18 request lời giải, ngoài request đọc ảnh. Một lượt quota ứng dụng không đồng nghĩa một request trả phí.
- Mỗi câu có tối đa ba lần viết lời giải trong một ticket; câu khác không bị mất quyền thử lại vì một câu lỗi. Kết quả thành công được dùng lại trong cùng tiến trình. Request trùng ID hoặc cùng câu đang chạy không tạo thêm generation. Backend trả trạng thái `completed` / `retryable` / `exhausted` và số lần còn lại cho từng câu.
- Ticket hết hạn/nội dung thay đổi có mã lỗi riêng. Tài khoản tạm chờ duyệt hoặc bị khóa không đồng nghĩa ticket bị hủy; quyền AI vẫn được kiểm tra ở mỗi request.
- Sổ tay chỉ nhận lời giải nếu câu hỏi, phương án, ngữ cảnh và đầu vào người học còn khớp lúc gửi. Chỉnh tay hoặc chuyển tài khoản không khiến kết quả cũ ghi đè nội dung mới. Các lần làm lại được mở riêng theo session; cùng số câu ở hai lượt không dùng chung lựa chọn.
- Ngữ cảnh đọc từ ảnh được giữ đủ trong phạm vi 8.000 ký tự; ticket-only explanation nhận hợp đồng dài hơn để không phải cắt nguồn. Hợp đồng nhập một câu thông thường không đổi. Vượt giới hạn phải báo/để câu cần bổ sung; không tự cắt bài rồi giải như đủ dữ liệu. Luồng này giữ văn bản trích xuất; ảnh nguồn của form ảnh riêng vẫn theo cơ chế `sourceImageIds` hiện có.
- Bộ đếm, request ID và kết quả ticket được lưu ở Supabase bằng migration `20261020110041_durable_explanation_tickets.sql`. Các worker dùng cùng một ledger; restart không đặt lại ba lần thử của mỗi câu. Chỉ backend service role truy cập được bảng/RPC này. Chưa có migration hoặc database gián đoạn thì không gửi generation chưa được giữ lượt tới OpenAI.
- Mỗi generation giữ lease 120 giây. Nếu worker mất giữa chừng, cùng request ID không tự gọi OpenAI lại; người học chỉ có thể chủ động thử bằng request mới với phần ngân sách còn lại sau khi lease hết hạn. Lỗi lưu kết quả sau khi OpenAI đã xử lý có thể mất lời giải, nhưng không hoàn lượt đã dùng. Không tự retry generation trong nền.
- Cache chỉ dùng trong thời hạn ticket 24 giờ; dữ liệu hết hạn được dọn theo lô khi có claim mới hoặc chạy maintenance. Đây không phải cam kết xóa vật lý đúng giây thứ 24 giờ. Xóa trắng dữ liệu học xóa nội dung cache và chặn kết quả từ ticket cũ khôi phục nội dung, đồng thời giữ bộ đếm; xóa tài khoản Auth xóa ledger qua khóa ngoại. Xóa riêng một thẻ không xóa ngay cache vận hành của ticket.
- Không đổi `RATE_LIMIT_SECRET` tùy tiện vì ticket đã phát hành sẽ hết hiệu lực. Khi rollback code, giữ migration ledger và bộ đếm hiện có.

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
