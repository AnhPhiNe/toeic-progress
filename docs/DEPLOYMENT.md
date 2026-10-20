# Đưa TOEIC Progress vào beta

Mục tiêu đầu tiên là tracker và đồng bộ cho nhóm nhỏ. Bật AI sau khi có key OpenAI, Turnstile và đã kiểm thử provider thật. Render Free có thể ngủ; beta cần chấp nhận thời gian chờ, chưa có cam kết uptime hay sức chịu tải.

Chuẩn bị chuyển project: xem [SUPABASE_RECONNECT.md](SUPABASE_RECONNECT.md). Giữ project/config cũ tới khi staging mới được kiểm chứng.

## 1. Chuẩn bị database

Xuất backup trước migration. Project đã áp dụng bốn migration nền tảng chạy file `20261006020000_api_rate_limits.sql` một lần. Project mới chạy năm file nền tảng theo thứ tự tên, rồi `20261010000000_retire_gemini_provider.sql`; OpenAI không cần migration pool ngày 07/10. Project đã có pool chạy migration retire sau khi deploy backend OpenAI mới. Giữ nguyên các migration đã áp dụng.

Giữ `API_LIMITS_ENABLED=false` ở local tới khi migration này đã được áp dụng; staging/production bắt buộc `true`. Xem Security Advisor và đối chiếu RLS. Dùng project staging riêng cho test tài khoản và test tải.

### Cập nhật luồng đọc nhiều câu từ ảnh

Trước khi deploy backend có ticket bền vững, áp dụng riêng migration mới `20261020104827_durable_explanation_tickets.sql` lên project đang phục vụ. Không chạy lại toàn bộ migration nền tảng trên database đã có dữ liệu. Migration thêm hai bảng vận hành và RPC chỉ service role được gọi, cùng xử lý xóa cache khi người học xóa trắng dữ liệu; không đổi nội dung thẻ hay điểm hiện có.

Xác nhận `explanation_ledger_ready()` trả `version=1`, `tables=true`; kiểm tra RLS và quyền execute của `anon`/`authenticated` đều bị thu hồi. Backend `/ready` kiểm tra ledger trước khi nhận luồng AI tương ứng. Triển khai backend sau migration, rồi frontend; giữ nguyên signing secret và các cấu hình AI/quyền hiện tại. Không áp dụng lại giá trị mặc định `AI_ENABLED=false` trong Blueprint lên service đang bật AI.

Ticket lưu cả bộ đếm và kết quả trong Supabase nên restart/nhiều worker không tạo lại ngân sách. Generation bị ngắt giữa chừng vẫn tính một lần thử; không tự gọi lại bằng cùng request ID. Chi tiết giới hạn/chi phí ở [AI_ACCESS.md](AI_ACCESS.md).

## 2. Tạo frontend trên Vercel

Đưa các thay đổi đã xem xét lên repo của bạn, import vào Vercel; Root Directory là `frontend`, build `npm run build`, output `dist`.

Điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_OPERATOR_NAME`, `VITE_SUPPORT_EMAIL`. Khi chưa có backend, để `VITE_API_URL` trống để thử guest tracker. Sau bước 3, điền URL HTTPS API và redeploy để bật tài khoản/đồng bộ. Giữ email OTP tắt khi chưa có SMTP.

Ghi lại origin frontend, ví dụ `https://toeic-progress.vercel.app`, không có dấu `/` cuối.

## 3. Tạo backend trên Render

Python Web Service, root `backend`, build `pip install -r requirements.txt`. Start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --limit-concurrency 32 --no-access-log
```

Health check path: `/ready`. Blueprint `backend/render.yaml` có cùng cấu hình.

| Biến | Giá trị beta |
|---|---|
| `ENVIRONMENT` | `staging` |
| `API_LIMITS_ENABLED` | `true`, sau migration 5 |
| `AI_ENABLED` | `false` |
| `SUPABASE_URL` | URL project đúng môi trường |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key, chỉ ở backend |
| `RATE_LIMIT_SECRET` | Ngẫu nhiên ít nhất 32 ký tự; Blueprint có Generate Value |
| `CORS_ORIGINS` | Ví dụ `["https://toeic-progress.vercel.app"]` |

`RENDER_EXTERNAL_HOSTNAME` được Render cung cấp và dùng làm hostname API. Nếu có custom domain, đặt `ALLOWED_HOSTS` là mảng JSON các hostname API chính xác, gồm hostname mà Render dùng health check. Không dùng wildcard.

OpenAI/Turnstile có thể để trống khi `AI_ENABLED=false`. Không đặt secret key, token hoặc database password vào `VITE_*`, repo, screenshot hoặc tin nhắn.

## 4. Nối Google và kiểm thử staging

Supabase Auth: Site URL là frontend; thêm redirect URL chính xác mà app sử dụng. Cấu hình Google OAuth cho domain mới, kiểm tra đối tượng người dùng/test users trong Google Console trước khi mời người ngoài.

- `/health` báo tiến trình chạy. `/ready` phải trả HTTP 200 và `database_reachable=true`; probe database timeout 3 giây, cache 15 giây, không gọi AI.
- Đăng nhập cùng tài khoản trên laptop/điện thoại; tạo và sửa buổi học, lỗi sai, từ vựng, mục tiêu. Thiết bị kia nhận đúng.
- Tài khoản khác không đọc được dữ liệu tài khoản đầu. `npm run test:rls` dùng biến staging ghi ở đầu script, tạo rồi xóa hai tài khoản test. Không chạy trên project chứa dữ liệu thật.
- Thử mất mạng, đổi tài khoản, nhập backup và xóa trắng; thiết bị có dữ liệu cũ phải nhận reset. Dùng tài khoản test cho các thao tác xóa.

Smoke tải nhẹ:

```powershell
# Điền staging-only URL/user token bằng môi trường riêng, không commit hoặc chụp token.
$env:SUPABASE_TEST_PROJECT = 'staging'
npm run test:staging
```

Script cần `SUPABASE_STAGING_API_URL` và `SUPABASE_STAGING_USER_TOKEN`; đồng bộ với outbound records trống, chạy 10 request với tối đa hai request đồng thời, in status/p50/p95. Không in token/nội dung và không gọi AI. Smoke này chưa chứng minh sức chứa cả cộng đồng; test tải lớn cần chuẩn bị môi trường/hạn mức riêng.

## 5. Bật AI sau khi tracker ổn

OpenAI đã được chọn cho cấu hình mới: tạo key trên OpenAI Platform, tài khoản API có tín dụng. Trên Render đặt `OPENAI_API_KEY` là một chuỗi key, `OPENAI_MODEL=gpt-6-luna`, `OPENAI_REASONING_EFFORT=medium`. Giữ `AI_ENABLED=false` nếu chưa có key, và lưu cả cấu hình trước khi bật AI. Tạo Turnstile site và thêm hostname frontend; bật Anonymous Sign-Ins và CAPTCHA trong Supabase Auth.

Backend: điền key provider, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES`, đổi `AI_ENABLED=true`. Frontend: điền `VITE_TURNSTILE_SITE_KEY` và redeploy. Không cần biến OpenAI trong Vercel. `/ready` phải báo `ai_provider=openai`, `ai_configured=true` sau khi chuyển. Backend chỉ dùng OpenAI. Không còn cấu hình chọn hoặc chuyển provider.

Website production `toeictracking.vercel.app` với API Render hiện tại dùng `/api/ai-status` cùng origin để đọc cấu hình provider. Rewrite trong `frontend/vercel.json` chuyển đúng endpoint đó tới `/health` trên Render, trước SPA fallback; không cache. Request này không có token/câu hỏi và không gọi provider AI. Các API đồng bộ/extraction vẫn gọi URL backend đã cấu hình. Local/preview hoặc staging API khác vẫn đọc `/health` trực tiếp. Nếu đổi domain hoặc backend production, cập nhật cả route rewrite và điều kiện trong `getAIConfiguration` cùng một lần.

Sau khi deploy backend mới, gỡ `AI_PROVIDER` và các biến `GEMINI_*` khỏi Render; chạy `20261010000000_retire_gemini_provider.sql` để dọn bảng/RPC cũ. Migration không thay dữ liệu học hoặc quota AI chung. Không rollback về backend phụ thuộc pool sau bước này.

Kiểm thử nội dung có/thiếu đáp án, bản nháp cần người học kiểm tra; CAPTCHA sai, vượt lượt và lỗi provider. Mặc định AI: khách 3 lượt/danh tính, tài khoản 10 lượt/tháng, toàn app 20 lượt/ngày và 2 lượt/phút, IP 5 lượt/ngày. Đây là giới hạn app, không phải hạn mức của OpenAI.

Tùy chọn miễn toàn bộ hạn mức AI app: đặt `AI_UNLIMITED_EMAILS=["your-account@gmail.com"]` ở Render/backend. Chỉ Gmail được Google xác minh trong Supabase Auth được miễn cap tháng/ngày/phút và spam theo tài khoản/IP cho AI; không thêm quyền database. Để `[]` để tắt. Không cần migration mới. Vẫn ghi counter, chống gửi trùng và giữ giới hạn tài nguyên/provider. Phí OpenAI vẫn áp dụng; giám sát ngân sách đã chọn trên OpenAI Platform.

## 6. Giới hạn, log và proxy

PostgreSQL giữ lượt theo tài khoản trước nghiệp vụ, dùng chung giữa instance: tổng 60 request/phút; sync 30; usage 30; AI 10; reset/xóa tài khoản chung 3. Fixed minute windows có thể cho phép burst ở ranh giới phút.

Trước xác thực: 120 request/IP/60 giây, tối đa 8 request đang xử lý/process và 4.096 bucket IP. Đây là lớp giảm tải cục bộ. Request quá tải trả 429/503 kèm `Retry-After`. Body tối đa 4 MiB, thời gian nhận tối đa 10 giây. Uvicorn limit-concurrency 32 giới hạn thêm connection/task.

Log JSON có mã request, route cố định, status, thời gian, loại exception; không log raw body/token/query string/email/exception message. Server tự tạo `X-Request-ID`; lỗi server có mã hỗ trợ trên frontend.

Chỉ tin proxy của hosting. Không đọc tùy ý `X-Forwarded-For`; không đặt `FORWARDED_ALLOW_IPS=*` khi request có thể tới trực tiếp hoặc headers chưa được proxy lọc. Xác minh IP đúng trên staging trước khi dựa vào hạn mức IP.

**IP người dùng sau proxy Render.** Mặc định backend dùng địa chỉ kết nối; trên Render đó là proxy, nên mọi người dùng chung một hạn mức IP (120 request/phút, `AI_IP_DAILY_LIMIT` lượt AI/ngày). Render chỉ nối thêm vào `X-Forwarded-For` mà không xóa giá trị client gửi, nên backend không bao giờ đọc header này. Cách bật đúng IP:

1. Trên staging đặt `CLIENT_IP_DEBUG=true`, mở `https://<api>/debug/client-ip` và so `cf_connecting_ip`/`true_client_ip` với IP công khai của bạn.
2. Gửi lại với header giả: `curl -H "CF-Connecting-IP: 1.2.3.4" -H "True-Client-IP: 1.2.3.4" https://<api>/debug/client-ip`. Chỉ chọn header vẫn hiện IP thật (edge đã ghi đè giá trị giả).
3. Đặt `CLIENT_IP_HEADER=<tên header đó>`, kiểm tra `used_for_limits`, rồi tắt `CLIENT_IP_DEBUG`. Header thiếu hoặc không phải một IP hợp lệ thì backend tự quay về địa chỉ kết nối.

Bật thông báo deploy/health lỗi trên Render và theo dõi 5xx/429/thời gian phản hồi. Tích hợp cảnh báo ngoài ứng dụng cần cấu hình tài khoản hosting; log trong code không tự gửi thông báo.

## 7. Backup, bảo trì và rollback

Free tier cần tự xuất database định kỳ, giữ bản ngoài máy chạy backend. Archive chứa dữ liệu riêng tư: dùng nơi chỉ người vận hành truy cập; không upload vào repo/artifact công khai.

Cài PostgreSQL client tools cùng major version với server. Cấu hình riêng `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE=verify-full`, `PGSSLROOTCERT` khi cần. Dùng direct connection hoặc session pooler tương thích pg_dump; tránh transaction pooler cho backup.

Từ root: `python scripts/ops/backup-database.py`. Script tạo `.backups/*.dump`, không đưa password vào argv/log, không ghi đè và kiểm tra archive bằng `pg_restore --list`. Kiểm tra cấu trúc archive chưa chứng minh restore thành công.

Thử `pg_restore` vào database staging trống rồi kiểm tra schema, dữ liệu/RLS và các luồng đăng nhập/đồng bộ. Không restore vào database đang phục vụ để thử. Cấu hình lịch backup ở môi trường vận hành và kiểm tra kết quả thực tế.

Chạy `python -m app.commands.maintenance` từ `backend` với đúng `.env` để dọn counter hết hạn; cấu hình lịch bảo trì sau deploy. API tự dọn các phút cũ của owner khi có request; maintenance dọn thêm owner không còn hoạt động.

Maintenance cũng dọn tối đa 1.000 câu trong cache lời giải hết hạn mỗi lần. Claim mới dọn tối đa 100 câu hết hạn; khi không còn request, chạy maintenance theo lịch để cache không lưu lâu hơn cần thiết. Bản ghi của ticket còn hạn không bị xóa để tránh đặt lại ngân sách thử.

Giữ bản deploy trước để rollback. Runtime migration thêm bảng, không xóa bảng học. Nếu rollback code, giữ migration và các dấu đồng bộ/tombstone; không xóa dữ liệu để rollback.

## Điều kiện mời beta

Domain HTTPS, Google login, đồng bộ hai thiết bị, cách ly tài khoản, reset, giới hạn API, log, backup/restore và kênh hỗ trợ đã được kiểm chứng. AI có thể giữ tắt trong beta tracker. Kiểm thử local chưa chạy các thao tác hosting/restore thực tế.

Tham khảo: [Render health checks](https://render.com/docs/health-checks), [FastAPI sau proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/), [Supabase production](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase backup](https://supabase.com/docs/guides/platform/backups).
