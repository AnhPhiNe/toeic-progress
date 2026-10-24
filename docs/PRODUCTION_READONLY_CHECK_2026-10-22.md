# Kiểm tra môi trường thật trước production — 22/10/2026

## Phạm vi và kết luận

Đã gọi trực tiếp frontend `https://toeictracking.vercel.app`, API `https://toeic-progress-api.onrender.com` và Supabase project `nztodqxtteqromszwwfg`. Các kiểm tra dưới đây chỉ đọc, không dùng tài khoản giả để ghi dữ liệu thật, không đổi cấu hình, không deploy và không gọi OpenAI. Các request sync dùng token thiếu/sai và bị từ chối trước nghiệp vụ.

**Hạ tầng và các bảo vệ đã kiểm tra hoạt động. Đợt UI bổ sung đã xác minh đăng nhập, một lượt AI thật, lưu/reload, cập nhật lịch ôn và đối chiếu đúng thẻ QA trên Supabase độc lập với localStorage. Cách ly hai tài khoản có đăng nhập vẫn cần kiểm tra riêng.** Frontend đang phục vụ là bản đã deploy trước đây; nhánh `codex/frontend-readiness-fixes` vẫn chưa commit/push/deploy. Kết quả này không được dùng để nói các sửa local đã chạy trên production.

## Kết quả đã xác minh trực tiếp

| Hạng mục | Bằng chứng |
| --- | --- |
| API chạy | `/health` HTTP 200; database configured, OpenAI configured/enabled, managed AI access và persistent source images đều bật |
| API kết nối Supabase | `/ready` HTTP 200, `database_reachable=true`; readiness có kiểm tra bảng quyền AI và ledger khi AI/ticket bật |
| Frontend | HTTPS và các route `/so-tay`, `/lich-su`, `/phan-tich` HTTP 200, trả HTML |
| Kết nối frontend | Bundle đang phục vụ có đúng API Render và Supabase project, không có URL API localhost; không tìm thấy giá trị secret backend hiện có hoặc literal có dạng secret key Supabase đầy đủ |
| Health qua cùng origin | `/api/ai-status` HTTP 200, `cache-control: no-store`, capability khớp API |
| CORS | Origin production được chấp nhận; origin không tin cậy bị HTTP 400 và không có `access-control-allow-origin` |
| Xác thực API | Sync thiếu/sai token và AI usage thiếu token đều HTTP 401; sync có request ID và `no-store` |
| Bề mặt debug | `/debug/client-ip` và `/docs` HTTP 404 |
| Security headers | Có HSTS, `X-Frame-Options: DENY`, `nosniff` và CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` |
| Supabase Auth | Google provider bật. Anonymous sign-in tắt; managed AI hiện yêu cầu Google login/duyệt quyền |
| Bảng ứng dụng | Kiểm tra metadata bằng `select=*&limit=0` thành công cho sync, profile, study sessions, mistakes, vocabulary, weekly plans, pacing, AI grants, API limits và hai bảng explanation ledger |
| Ledger bền vững | RPC `explanation_ledger_ready()` bằng backend credential trả `version=1`, `tables=true` |
| Kho ảnh nguồn | Bucket `mistake-sources` là private, chỉ JPEG, tối đa 1 MiB/file |
| Chặn truy cập công khai | Key công khai không kèm phiên người dùng bị HTTP 401 khi đọc các bảng học/quyền AI/ledger đã kiểm tra; RPC ledger chỉ service role cũng bị chặn |
| Quyền AI tài khoản chủ | Grant tài khoản chủ cấu hình trong dự án là `active`, `monthly_limit=null`; kiểm tra không thay đổi grant và không gửi email/token/ID vào báo cáo |

Kiểm tra key công khai không đồng nghĩa đã thử cách ly giữa hai tài khoản có đăng nhập. Đọc schema qua backend credential cũng không chứng minh mọi RLS policy của authenticated role đúng; cần bước kiểm tra riêng bên dưới.

## Quan sát vận hành

Request Render đầu tiên mất 34,6 giây; `/ready` sau đó khoảng 139 ms và các request API tiếp theo khoảng 80–214 ms. Sự chênh lệch phù hợp với service thức dậy chậm, nhưng chưa có hosting log để xác nhận nguyên nhân. Frontend có deadline 90 giây cho cấu hình/API, nên phép đo này chưa chỉ ra lỗi timeout trong code. Không coi một lượt đo là cam kết hiệu năng/uptime.

## Các bước còn chưa thực hiện

1. Dùng tài khoản tester thứ hai xác nhận không đọc được thẻ của tài khoản đầu; không tạo/xóa tài khoản thử tự động trên project chứa dữ liệu thật.
2. Dọn riêng thẻ thử qua soft-delete, không xóa trắng dữ liệu học. Thẻ vẫn giữ để đối chiếu; lượt kiểm chứng cloud được người dùng cho phép chỉ đọc, không ghi/xóa.
3. Sau khi deploy nhánh mới, lặp lại smoke ngắn trên đúng bản deploy đó. Chưa thử AI thật bằng ảnh Part 7/batch trong đợt này.

## Bổ sung kiểm tra UI sau khi Browser hoạt động trở lại

Sau khi người dùng khởi động lại phiên, Browser đã có lại tab khả dụng. Phiên production có sẵn một tài khoản tester, Sổ tay trống, trạng thái Đã đồng bộ. Đây không phải tài khoản chủ có grant active đã kiểm tra trước đó.

- Form thêm câu hiển thị đúng thông báo tài khoản đang chờ duyệt AI và vô hiệu hóa phân tích, không tự cấp quyền.
- Tạo một thẻ tự soạn, nhãn đề `QA production 22-10-2026`: `The meeting ____ at nine tomorrow.`; chọn B, đáp án nguồn A `(A) begins`.
- Lưu thủ công thành công, trạng thái chuyển Đang đồng bộ → Đã đồng bộ; reload vẫn có nguyên câu hỏi, lựa chọn và đáp án.
- Ôn thẻ, trả lời A: thông báo Đúng · ôn sau 3 ngày; tổng kết 1/1 và lịch ôn đã cập nhật. Reload giữ trạng thái Chưa đến hạn.
- Ảnh bằng chứng: `scratch/production-review-success-2026-10-22.jpg` (Git ignored).

Thẻ QA vẫn được giữ riêng trong tài khoản tester để đối chiếu từ thiết bị/phiên khác rồi dọn bằng soft-delete. Chưa chứng minh việc reload đọc từ cloud thay vì localStorage chỉ bằng các quan sát trên. Giai đoạn tài khoản pending không gọi OpenAI.

Automatic approval review từ chối lệnh dùng service-role để đọc riêng thẻ QA và ghi row ra scratch, vì đó là phương thức truy cập đặc quyền vào dữ liệu học. Lệnh bị từ chối trước khi chạy; không thử đường vòng, không xuất token từ Browser, và không dùng quyền admin để tạo phiên giả. Việc kiểm tra độc lập tiếp tục qua phiên người dùng/thiết bị thứ hai.

Người dùng đã đăng nhập tài khoản chủ. Xác nhận UI đúng tài khoản Anh Phi và Đã đồng bộ; không đổi trạng thái pending của tester.

### Lượt AI thật bằng tài khoản chủ

- Nguồn riêng `QA AI production 22-10-2026`, câu tự soạn `The workshop ____ at nine tomorrow.` và A–D, thêm dòng `Câu hỏi` / `101` để kiểm tra paste tự nhiên.
- Lựa chọn người học B, đáp án nguồn A, lý do tự nhập được giữ nguyên.
- Gửi đúng một lần bằng nút Phân tích với AI; nhận preview hợp lệ, câu hỏi đã bỏ dòng tiêu đề/số câu. Không retry và không gọi thêm lời giải tự động bằng batch.
- Nội dung đúng: chủ ngữ số ít `The workshop` đi với `begins`, hiện tại đơn có thể chỉ lịch trình ngày mai. Có nghĩa phương án, bản dịch câu, phân tích A–D và mẹo; đáp án nguồn không bị AI thay.
- Lưu thành công, UI Đã đồng bộ. Reload rồi tìm đúng nhãn QA: vẫn có câu, A/B, nghĩa phương án và mẹo.
- Ôn riêng thẻ QA, chọn A: đúng, hẹn sau 3 ngày, tổng kết 1/1; không ôn/chỉnh thẻ học cũ.
- Ảnh bằng chứng: `scratch/production-ai-saved-2026-10-22.jpg` (Git ignored).
- Người dùng đã cho phép đọc đúng thẻ QA bằng credential backend hiện có. Lệnh hẹp được automatic approval review chấp nhận và chạy thành công; không lưu row ra file.

### Đối chiếu trực tiếp Supabase sau khi người dùng cho phép

GET đúng bảng `mistakes`, lọc đồng thời `extra->>sourceTestName=QA AI production 22-10-2026`, `question_context=The workshop ____ at nine tomorrow.`, `part=5`; chỉ chọn các trường cần đối chiếu, giới hạn hai để phát hiện trùng. Không truy vấn thẻ khác hoặc sửa dữ liệu. Kết quả chỉ được in dưới dạng boolean:

- HTTP 200, đúng một thẻ QA, chưa bị xóa.
- Câu hỏi/Part/nhãn nguồn khớp; đáp án nguồn `(A) begins`, lựa chọn B và lý do chọn khớp dữ liệu gửi từ UI.
- `review_count=1`, `review_stage=1`, `status=NEEDS_REVIEW`, `next_review_date=2026-10-25` đều khớp.

Điều này xác minh độc lập rằng lượt lưu và lần ôn đã đi tới Supabase, không chỉ nằm trong localStorage. Phương thức dùng backend credential không thay thế kiểm thử RLS với authenticated role của hai người dùng. Không gọi OpenAI thêm trong bước đọc này.

## Lịch sử blocker Browser

Các lần đầu `cua.getState()` trả `Local browser use is disabled in Work settings`, không có browser/tab khả dụng. Sau khi khởi động lại phiên, blocker này đã được giải quyết; phần kiểm tra UI mới ghi ở trên. Không đọc token từ file hồ sơ trình duyệt, không tạo phiên mạo danh bằng quyền admin và không dùng backend credential thay cho kiểm thử quyền người dùng.

## Đợt kiểm tra mở rộng ngày 23/10

Xem [AI_LIVE_VALIDATION_2026-10-23.md](AI_LIVE_VALIDATION_2026-10-23.md): đã thử các endpoint AI chính bằng UI production, đọc bảy ảnh kết quả thật đúng 49/49 câu sai nhìn thấy, và chuyển sang tester xác minh không thấy dữ liệu chủ, AI pending bị chặn, lưu thủ công vẫn hoạt động. Thẻ tester ban đầu không còn vì người dùng xác nhận đã reset tester; không kết luận nhầm là mất dữ liệu đồng bộ. Các sửa phát hiện trong đợt này đã kiểm tra local, chưa deploy.

Raw probe result không chứa keys/token/nội dung học được lưu cục bộ ở `scratch/production-readiness-readonly-result.json` (ignored by Git). Script `scratch/production-readiness-readonly.py` cũng chỉ ở scratch, không đưa vào code deploy.
