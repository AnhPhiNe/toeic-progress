# TOEIC Progress — Python/FastAPI

Backend nghiệp vụ dùng FastAPI + Pydantic. Supabase cung cấp PostgreSQL và Auth; OpenAI/Gemini chỉ được gọi từ backend. Frontend không giữ khóa AI hay service-role key.

Lộ trình beta, migration vận hành, biến deploy, staging tests và backup/restore: [hướng dẫn beta](../docs/DEPLOYMENT.md). Backend có chống spam trước xác thực, bộ đếm API dùng chung qua PostgreSQL, log JSON có mã request, Trusted Host, kiểm tra cấu hình deploy và `/ready` kiểm tra database. Cần cấu hình hosting và kiểm chứng thực tế trước khi mời người dùng.

## Chạy trên Windows

Từ thư mục gốc của repo:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --env-file backend/.env --reload --port 8000
```

Nếu môi trường `.venv` đã có thì bỏ bước tạo. Backend chạy được khi chưa có khóa: `/health` báo dịch vụ nào đã được cấu hình; các API cần dịch vụ đó trả lỗi rõ ràng. Swagger ở `http://127.0.0.1:8000/docs`.

Frontend: sao chép `frontend/.env.example` thành `frontend/.env.local`, điền `VITE_API_URL=http://127.0.0.1:8000`, URL/publishable key của Supabase và Turnstile site key. Chạy `npm run dev`. Giá trị `VITE_*` là công khai; khóa bí mật chỉ nằm trong `backend/.env` hoặc môi trường hosting.

## Supabase

1. Tạo project Free riêng cho staging và dữ liệu thật. Áp dụng năm migration theo thứ tự tên trong `supabase/migrations/`. Project đã chạy migration 4 chỉ cần thêm `20261006020000_api_rate_limits.sql` rồi bật `API_LIMITS_ENABLED=true`. Migration 4 (`20261006010000_purge_deleted_content.sql`) xóa nội dung đã đánh dấu xóa trước đó; dữ liệu đang hiệu lực được giữ. Xem docs/DEPLOYMENT.md để cấu hình đúng thứ tự.
2. Điền `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), `SUPABASE_SECRET_KEY` (`sb_secret_...`) vào `backend/.env`. URL/publishable key của frontend phải thuộc cùng project. Secret key chỉ ở backend. Biến `SUPABASE_SERVICE_ROLE_KEY` vẫn được hỗ trợ cho cấu hình cũ dùng JWT; cấu hình mới dùng secret key.
3. Bật Google OAuth, Site URL và Redirect URLs cho localhost và domain frontend. Bản đầu ẩn email OTP; chỉ bật `VITE_ENABLE_EMAIL_OTP=true` sau khi cấu hình SMTP riêng.
4. Bật Anonymous Sign-Ins và Turnstile CAPTCHA trong Auth. Khách chỉ được tạo phiên ẩn danh khi dùng AI; phiên này không kích hoạt đồng bộ dữ liệu học.
5. Cấu hình Turnstile site key ở frontend và secret key ở backend. `TURNSTILE_HOSTNAMES` là mảng JSON các hostname frontend được chấp nhận, không có scheme/path. Backend xác minh token với action `toeic-ai`.

Mọi yêu cầu API xác thực token qua `/auth/v1/user`, không giải mã JWT rồi tin vào nội dung chưa xác minh. HTTP API lấy owner từ phiên đã xác thực. RPC ghi và quota chỉ cấp `EXECUTE` cho `service_role`; client không được sửa bộ đếm hoặc gọi RPC bằng user ID tự chọn. Anonymous JWT cũng bị chặn đọc dữ liệu tài khoản qua RLS.

## Gemini và hạn mức 0 đồng

Tạo Gemini API project trên Free Tier, giữ billing chưa liên kết. Thứ tự mặc định: `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` → `gemini-3.5-flash`. Xem hạn mức từng model thực tế trong [AI Studio](https://ai.google.dev/gemini-api/docs/rate-limits) rồi điều chỉnh cấu hình không vượt RPM/TPM/RPD đó. Không tự bật billing khi fallback.

Mẫu `.env` và Render Blueprint bắt đầu với `AI_ENABLED=false` để triển khai tracker trước. Sau khi có Gemini/Turnstile, bật `AI_ENABLED=true` và kiểm thử nhà cung cấp thật.

Mặc định: khách 3 lượt/danh tính ẩn danh; tài khoản 10 lượt/tháng; cả app 20 lượt/ngày, 2 lượt/phút; mỗi IP 5 lượt/ngày. Các bucket của app tính theo UTC. Đây là cấu hình app, không phải hạn mức bảo đảm của Google. Một UUID yêu cầu chỉ được giữ lượt người dùng một lần, kể cả lỗi nhà cung cấp. Mỗi lần thử model/key giữ quota provider riêng trước khi gọi; không nhân lượt người dùng khi fallback.

`AI_UNLIMITED_EMAILS` là mảng JSON các Gmail được miễn **toàn bộ hạn mức AI của app** (tháng/ngày/phút, tài khoản/IP), ví dụ `["your-account@gmail.com"]`; mặc định `[]`. Chỉ đặt ở backend `.env` hoặc Render, không ở biến `VITE_*`. Backend lấy email đã xác nhận và Google identity có `email_verified=true` từ Supabase Auth; không tin email/quyền do frontend hoặc `user_metadata` tự gửi. Danh sách chỉ cấp quyền dùng AI, không cấp quyền đọc dữ liệu người khác. Quyền được xác minh lại với Supabase trong mọi request. Ingress dùng hint HMAC của phiên đã xác minh, tối đa 1.024 mục/60 giây, chỉ để bỏ chặn IP cho phiên được nhận diện; hint không thay thế xác thực. AI của tài khoản được xác minh không tiêu bộ đếm spam ingress. Các API đồng bộ/xóa vẫn có giới hạn riêng. Vẫn giữ giới hạn request đang xử lý, kích thước, timeout, UUID chống gửi trùng và quota của nhà cung cấp. Request vẫn ghi counter/audit dùng chung; tài khoản thường có thể hết budget ngày khi tổng sử dụng tăng. Không cần migration mới: RPC service-role nhận `NULL` cho các cap được miễn. `/api/v1/ai/usage` và extraction trả `unlimited=true`, `limit=null`, `remaining=null` cho tài khoản đủ điều kiện. OpenAI tính phí cả những request của Gmail được miễn.

## OpenAI trực tiếp — GPT-6 Luna

Đặt các biến backend/Render:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=REPLACE_PRIVATE_KEY
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=medium
OPENAI_MAX_OUTPUT_TOKENS=8192
OPENAI_TIMEOUT_SECONDS=45
```

`OPENAI_API_KEY` là **một chuỗi key**, không phải mảng JSON. Dùng tài khoản OpenAI API có tín dụng; chi phí không nằm trong hạn mức ChatGPT. Key chỉ ở backend. Chuẩn bị key và các biến trước khi lưu/redeploy với `AI_ENABLED=true`. Không cần chạy migration mới khi chuyển từ Gemini. `AI_PROVIDER` mặc định `gemini` để các deploy cũ tiếp tục chạy tới lúc người vận hành chủ động đổi; `.env.example` và Blueprint mới chọn OpenAI khi triển khai mới.

Backend gọi cố định `https://api.openai.com/v1/responses`, model `gpt-6-luna`, `reasoning.effort=medium`, Structured Outputs theo schema sổ tay, `store=false`, Standard processing. Không gửi `temperature`/`top_p` cho cấu hình reasoning này. Có thể chọn `low` hoặc `high` bằng biến effort; medium là lựa chọn ban đầu cho việc trích xuất kèm phân tích. Giới hạn output 8.192 token bao gồm token suy luận; bản nháp chưa hoàn chỉnh/bị từ chối không được lưu. Mỗi lượt chỉ gửi một request; timeout hoặc lỗi quota/billing không tự gọi lại, xoay key hay chuyển sang Gemini. Log chỉ ghi request ID, status, thời gian và số token input/output, không ghi câu hỏi, đáp án hay key. Backend gửi safety identifier HMAC thay vì email/user ID thô.

`/health` công khai tên provider để frontend hiển thị đúng nơi nhận dữ liệu trước khi người học đồng ý. Yêu cầu gửi lại provider đã được đồng ý; đổi cấu hình trong lúc mở modal trả 409 trước quota hoặc gọi AI. Client cũ chỉ tương thích Gemini, không tự gửi nội dung đã đồng ý cho Google sang OpenAI.

Prompt OpenAI ở `app/services/toeic_prompt.py` tập trung TOEIC Reading: Part 5 phân biệt cấu trúc/từ loại/nghĩa/collocation; Part 6 thêm liên kết/mạch văn; Part 7 dựa vào bằng chứng và paraphrase trong bài. AI trả nghĩa từng phương án qua `optionNotes` và các mục giải thích qua `explanation`; backend ghép `trapTip` có nhãn để tương thích client cũ. Giữ nguyên tiếng Anh trong `options`. Nghĩa phương án chỉ gồm bản dịch/dạng từ, ưu tiên nghĩa trong câu và có thể thêm 1–2 nghĩa cùng từ loại thường gặp trong TOEIC Listening & Reading, tối đa 120 ký tự; không trộn lý do chọn/loại hay liệt kê từ điển. `analysis` dùng xuống dòng thật giữa dấu hiệu và từng phương án. Bản dịch phải giữ các cụm mang nghĩa của câu nguồn, kể cả tính từ như revised/latest/additional, và nhất quán với nghĩa phương án. Frontend tách câu trong phân tích cũ để dễ đọc, không sửa dữ liệu đã lưu.

Đầu ra OpenAI mới phải có đúng một ghi chú không rỗng cho mỗi phương án có nhãn A–D; nhãn trùng, phương án không nhãn/rỗng hoặc thiếu ghi chú trả lỗi bản nháp 502, không tự retry. Kiểm tra này chỉ áp dụng đầu ra OpenAI mới; bản ghi cũ và Gemini thiếu các trường có cấu trúc vẫn đọc như trước. Backend kiểm tra cấu trúc, không dùng từ điển hardcode để tự sửa nghĩa hay cam kết phát hiện mọi lỗi dịch. `trapTip` sau ghép được giới hạn 4.000 ký tự theo đoạn và ghi rõ rút gọn khi cần; các mục `explanation` đầy đủ vẫn được giữ. Bộ test dùng transport giả kiểm tra từ API tới grounding; đánh giá ngữ nghĩa thật dùng [bộ câu Reading](../docs/AI_READING_EVAL.md). Bản demo không phải kết quả live của provider.

Modal Sổ tay mới gửi nhóm `input` có cấu trúc cùng endpoint `/api/v1/ai/extract`: câu hỏi/phương án, ngữ cảnh, lựa chọn CHOSEN/UNKNOWN/BLANK, nguyên văn lý do và đáp án nguồn riêng. `/health` có `structured_mistake_input=true` để frontend biết backend hỗ trợ; deploy backend trước frontend mới. Lời kể chứa `Đáp án chuẩn:` không trở thành sourceAnswer. Request nhiều câu có nhãn/số câu hoặc nhóm phương án lặp bị từ chối trước quota AI/provider. Nhóm đầu vào người học được đưa vào hash chống gửi trùng; không log nội dung. Timestamp ôn mới có múi giờ; date-only cũ được nhận khi sync và chuẩn hóa UTC đầu ngày. Thẻ thiếu đáp án vẫn lưu được nhưng frontend không đưa vào ôn. Các field bổ sung nằm trong `extra`, không cần migration database mới.

Thẻ hỗ trợ `sourceTestName` tùy chọn/nullable, tối đa 300 ký tự, lưu qua schema sync và SQL `extra` hiện có. Chuỗi rỗng là người học gỡ nguồn; null/thiếu trường cho phép frontend nhận nguồn cũ qua `sessionId` và lịch sử làm bài. Tên đề không nằm trong input gửi model; người học tự chọn/nhập tên.

Đáp án nguồn là tùy chọn. Có đáp án hợp lệ trong input thì ưu tiên `answerSource=PROVIDED`; nếu AI trả phương án khác, grounding giữ đáp án nguồn và cảnh báo mâu thuẫn. Không có đáp án nguồn nhưng đủ câu hỏi/phương án/ngữ cảnh: AI tự giải và trả `AI_PROPOSED`. Với input có cấu trúc, strict schema ràng buộc `correctAnswer` chỉ là một phương án gốc hoặc chuỗi rỗng; tránh AI tự thêm dấu câu/chú thích khiến grounding không khớp. Grounding vẫn đối chiếu nhãn và nội dung; không đoán lại đáp án từ lời giải. Không tin `PROVIDED` khi input không có đáp án nguồn. Thiếu dữ liệu hoặc đáp án nguồn không khớp vẫn dùng `MISSING`/chuỗi rỗng; không tự thay nguồn lỗi bằng suy đoán. Gemini còn giữ chế độ cần đáp án nguồn. `answerSource` được lưu trên `Mistake`/`MistakeEntry`, backup và sync, vào cột `extra` hiện có, không cần migration. Phương án AI chọn hiện xanh lá kèm 'AI đề xuất' ở preview, sổ tay và sau khi trả lời trong ôn tập; người học vẫn kiểm tra trước khi lưu.

Giữ quota beta của tài khoản thường (3 lượt khách, 10/tháng, toàn app 20/ngày, 2/phút) và theo dõi usage trên OpenAI. Đây là giới hạn **lượt**, không phải trần hóa đơn USD. Gmail được miễn có thể dùng vượt các cap đó và vẫn phát sinh phí; đặt ngân sách/giới hạn trong project OpenAI theo mức đã chọn. Tham khảo [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [reasoning](https://developers.openai.com/api/docs/guides/reasoning), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

### Cân bằng key và fallback

Chạy migration `supabase/migrations/20261007000000_gemini_provider_pool.sql` sau năm migration trước, **trước khi bật AI với code mới**. Nó chỉ thêm hai bảng vận hành `ai_provider_state`, `ai_provider_attempts` và RPC service-role; không thay dữ liệu học. Readiness kiểm tra bảng mới khi AI bật. Tracker với `AI_ENABLED=false` vẫn chạy trước migration này.

Với cách dùng đã chốt — mỗi key từ một tài khoản/project riêng, không chung quota — chỉ cần `GEMINI_API_KEYS` là mảng JSON các chuỗi key. Không nhập email tài khoản hoặc project ID. Backend tự tạo nhóm hạn mức riêng từ hash ổn định của từng key, nên đổi thứ tự danh sách không làm mất cooldown/bộ đếm. Hỗ trợ tối đa 8 key độc lập. Một key cũ trong `GEMINI_API_KEY` vẫn tương thích.

```dotenv
GEMINI_API_KEY=
GEMINI_API_KEYS=["REPLACE_PRIVATE_KEY_1","REPLACE_PRIVATE_KEY_2","REPLACE_PRIVATE_KEY_3"]
GEMINI_PROJECTS=[]
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=["gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash"]
```

Giá trị trên là mẫu, không phải credential. Chỉ điền tại backend `.env` / Environment Variables của Render, không gửi vào chat, commit, screenshot hoặc biến `VITE_*`. Mặc định từng key/model dùng 5 RPM, 250.000 TPM, 20 RPD theo các biến `GEMINI_RPM_LIMIT`, `GEMINI_TPM_LIMIT`, `GEMINI_RPD_LIMIT`; chọn mức không vượt hạn mức thật của các key/model. Key trùng hoặc rỗng bị từ chối. Cách nhập đơn giản này dựa trên xác nhận của người vận hành rằng các key có quota độc lập; backend không tự xác minh project của key với Google.

Google tính quota theo project. Nếu sau này thêm nhiều key chung một project, dùng cấu hình nhóm nâng cao `GEMINI_PROJECTS` với `project_id` và `api_keys` để chúng dùng chung bộ đếm; để `GEMINI_API_KEYS=[]` và `GEMINI_API_KEY` trống khi dùng chế độ đó. Không kết hợp hai cách cấu hình.

- Ưu tiên model theo đúng thứ tự đã khai báo. Với danh sách độc lập, chọn key ít request đang chạy nhất, sau đó lâu chưa dùng. Mặc định 1 request/key; các nhóm nâng cao vẫn giới hạn tối đa 2 request/project.
- Quota RPM/TPM/RPD **dùng chung mọi key trong cùng project/model**, được giữ nguyên qua restart và dùng chung các worker. Kiểm tra 5 RPM, 250.000 TPM, 20 RPD trước khi gửi; token đầu vào được giữ theo chặn trên thận trọng của UTF-8 payload, không phải số token được Google đo chính xác. Mỗi outbound attempt, kể cả thất bại, tính vào giới hạn cục bộ.
- Hết RPM hoặc TPM: đặt cooldown ít nhất 60 giây. Hết RPD: 24 giờ từ lúc phát hiện, theo cấu hình đã chốt. Khi `Retry-After` / `RetryInfo` của Google dài hơn, dùng thời gian dài hơn. Google thực tế reset RPD lúc nửa đêm Pacific; bộ đếm cục bộ dùng ngày Pacific, còn cooldown 24 giờ chủ động có thể giữ lâu hơn thời điểm reset.
- Chỉ coi quota là riêng model khi lỗi có chi tiết `QuotaFailure` chỉ đúng model. Lỗi 429 không rõ phạm vi khóa cả project, không thử mù các key/model chung quota. Project khác chỉ được dùng trong hạn mức riêng của nó; giới hạn toàn app vẫn giữ chung.
- Hết cooldown không chạy job thử liên tục: request kế tiếp được cấp **một probe**; request khác chuyển sang nhóm còn khả dụng. Thành công mới gỡ dấu; lỗi đặt thời gian chờ mới. Lease 90 giây thu hồi slot nếu tiến trình mất kết nối hoặc restart.
- 404 model hoặc 5xx: tạm bỏ project/model đó để thử nhóm khả dụng. Chỉ xoay ngay key bị xác định `API_KEY_INVALID` / `API_KEY_EXPIRED`; key này bị vô hiệu tới khi thay credential (không tự hồi sau 24 giờ). Lỗi quyền chung, payload, bản nháp không hợp lệ, bị cắt hoặc bị chặn không tự nhân request. Timeout/mất kết nối có thể đã sinh kết quả nên không gửi lại trong cùng lượt.
- Tối đa 8 lần gọi/lượt và tổng thời gian gọi Gemini 60 giây (30 giây/lần); không ngủ trong request chờ 60 giây/24 giờ. Model sinh nội dung có thể mất hơn 12 giây, nên không dùng timeout ngắn đó mặc định. Hết khả dụng trả 429/503 và `Retry-After`; frontend vẫn cho nhập thủ công. Bộ đếm app giữ lượt một lần cho cả chuỗi, tổng 20 lượt/ngày và 2 lượt/phút không tăng theo số project; Gmail được miễn bỏ mọi cap app cho AI, vẫn chịu quota provider. Log Gemini ghi loại lỗi, thời gian và request ID để phân biệt timeout với lỗi kết nối; không ghi key, URL có credential hay nội dung câu hỏi.

Chưa có key/project thực tế và Turnstile thì giữ `AI_ENABLED=false`. Kiểm thử nhà cung cấp thật trên staging trước khi bật public; test tự động chỉ dùng transport giả và PostgreSQL trong bộ nhớ, không tiêu quota.

Khóa `RATE_LIMIT_SECRET` dùng để HMAC địa chỉ IP, cần tạo ngẫu nhiên ít nhất 32 ký tự và giữ cố định. Khi chạy sau reverse proxy, cấu hình Uvicorn chỉ tin các proxy của hosting để `request.client.host` đúng. Không đọc tùy ý `X-Forwarded-For` từ client. Giới hạn toàn app và tài khoản vẫn áp dụng dù IP bị gom chung.

Yêu cầu AI nhận 20–8.000 ký tự, không nhận tệp. Người học xác nhận gửi văn bản tới đúng provider OpenAI/Google đang được cấu hình. Endpoint extraction chỉ lưu hash và bộ đếm; câu hỏi/bản nháp chỉ được lưu vào dữ liệu học khi người dùng xác nhận lưu. Phương án không xuất hiện trong đầu vào bị bỏ. Đáp án nguồn dùng nhãn `Đáp án chuẩn:`, `Đáp án đúng:`, `Answer:` hoặc `Correct answer:`; OpenAI có thể tự giải khi thiếu nguồn và đánh dấu `AI_PROPOSED`, Gemini giữ chính sách cần nguồn. Kết quả vẫn là bản nháp cần người học kiểm tra.

## Dữ liệu và đồng bộ

Database dùng các bảng nghiệp vụ với cột có kiểu và ràng buộc riêng:

| Bảng | Nội dung |
|---|---|
| `user_profiles` | Hồ sơ, mục tiêu điểm và cấu hình học |
| `study_sessions` | Buổi học, tên đề, ngày học, thời gian, điểm và số câu đúng 7 Part |
| `study_session_parts` | Chi tiết các Part trong buổi luyện lẻ |
| `mistakes` | Câu hỏi, lỗi, đáp án, nhóm nguyên nhân và lịch ôn |
| `vocabulary_logs` | Ngày và số từ đã học; chưa có danh sách từng từ |
| `weekly_plans` / `weekly_plan_tasks` | Tuần và từng mục tiêu |
| `pacing_runs` / `pacing_run_phases` | Lượt bấm giờ và các pha |
| `exam_checklist` / `streak_shields` | Checklist và ngày dùng khiên |

`exam_history` là view lọc Full Test còn hiệu lực từ `study_sessions`. `sync_records` là view dựng lại định dạng JSON của giao thức đồng bộ, không còn là bảng lưu chính. Những trường bổ sung chưa thuộc schema được giữ trong `extra` để bảo toàn backup/khả năng tương thích. Các cột nghiệp vụ đã biết có kiểu riêng, không nằm trong `payload`.

Migration 3 chuyển dữ liệu hiện có trong một giao dịch, giữ nguyên ID, thời điểm, dấu xóa và phiên bản server. Bảng gốc được giữ ở `sync_records_legacy` để phục hồi; client và service key không đọc/ghi bảng này. Tài khoản bị xóa vẫn được FK dọn cả bản cũ. Dữ liệu legacy không hợp lệ làm migration dừng và rollback, không bị bỏ qua.

Migration 4 tách bản ghi đã xóa sang `sync_tombstones` chỉ có owner, loại, ID, thời điểm và phiên bản, không giữ nội dung. Nội dung ở bảng nghiệp vụ/bảng con và bản tương ứng trong `sync_records_legacy` bị xóa. Khi xóa trắng, `POST /api/v1/data/reset` thực hiện trong một giao dịch theo owner: dọn mọi nội dung học của tài khoản, reset hồ sơ/checklist, dọn toàn bộ bản legacy của owner và ghi mốc vào `learning_data_resets`. Quota AI và tài khoản đăng nhập vẫn giữ.

`learning_data_resets` bảo vệ khỏi thiết bị chưa nhận reset: mọi request có cursor cũ phải bỏ các thay đổi cũ và nhận snapshot chuẩn (`resetBarrier=true`) trước khi sửa tiếp. Frontend hủy áp dụng các response đang chạy khi reset và chỉ ghi cursor sau khi lưu snapshot. Việc nhập backup hay chọn dữ liệu máy là thao tác phục hồi có chủ đích; không diễn ra tự động. Không dọn dấu xóa theo thời gian khi chưa có giao thức hết hạn thiết bị.

Sau reset, máy đang dùng chỉ giữ dấu xóa trong gói tài khoản và xóa bản v2 của cùng tài khoản. Reset khách chỉ tác động gói khách và các khóa legacy thuộc khách. Dữ liệu guest riêng, tài khoản khác, bản dữ liệu còn trên máy chưa kết nối và tệp backup người dùng đã tải không được xóa từ xa. Máy khác loại nội dung cũ khi nhận reset. Export JSON mới chỉ gồm bản ghi đang hiệu lực, không gồm dấu xóa.

Các bảng chính và bảng con đều có RLS theo chủ sở hữu, chặn danh tính ẩn danh; client chỉ SELECT, ghi qua FastAPI. Chỉnh cột nghiệp vụ hoặc bảng con bằng quyền quản trị sẽ tăng phiên bản để các thiết bị nhận thay đổi. Xóa hàng ở bảng nghiệp vụ chuyển thành dấu xóa; hồ sơ chỉ được xóa qua xóa tài khoản. Khóa liên kết `mistakes.linked_session_id` trỏ buổi học cùng chủ sở hữu khi có; `session_id` giữ tham chiếu lịch sử khi tệp nhập thiếu buổi học tương ứng.

Gói cục bộ v3 gồm cả kế hoạch tuần. Chuyển v2 sang v3 giữ lại các khóa cũ; kế hoạch v1 từng dùng chung chỉ chuyển vào danh tính đang hoạt động khi migrate. Backup v1/v2 vẫn nhập được và giữ kế hoạch tuần đang có. Backup v3 kiểm tra kế hoạch và ID trước khi ghi.

`POST /api/v1/sync` nhận các bản ghi thay đổi, cursor và lựa chọn thay thế. PostgreSQL giữ khóa giao dịch theo owner, áp dụng quy tắc bản mới hơn thắng/xóa thắng khi trùng thời điểm, trả delta cùng cursor mới. Bản ghi bị từ chối do cũ vẫn trả phiên bản chuẩn. Chỉ lưu cursor sau khi ghi snapshot cục bộ thành công. Mỗi kế hoạch tuần là một bản ghi; hai thiết bị sửa cùng tuần dùng quy tắc phiên bản mới hơn thắng, không gộp từng task.

Giới hạn hiện tại: 10.000 bản ghi/tài khoản, 32 KiB/bản ghi, 4 MiB/request. Dữ liệu tài khoản chỉ sửa khi có mạng và đồng bộ đã thành công. Xóa tài khoản xóa Auth user cùng dữ liệu server qua FK; các bản cục bộ vẫn có thể xuất/xóa riêng.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -c backend/pyproject.toml
.\.venv\Scripts\python.exe -m ruff check backend
npm test
npm run test:db
npm run test:e2e
npm run build
```

`test:db` chạy PostgreSQL WASM trong bộ nhớ, áp dụng các migration và kiểm tra chuyển dữ liệu, RLS/cursor/quota, xóa nội dung/bảng con/bản legacy, mốc reset và request từ thiết bị cũ. Nó không thay thế kiểm chứng Supabase Auth/PostgREST thực tế. `test:rls` chỉ dùng staging với biến môi trường được ghi ở đầu script; không chạy trên dữ liệu thật. SQL migration 3/4 được sinh bằng `python scripts/database/generate-domain-migration.py` / `python scripts/database/generate-reset-migration.py`. Playwright chạy cổng 3100 riêng, cấu hình Supabase/AI bị tắt để không dùng dịch vụ thật.

## Deploy thử miễn phí

Frontend: Vercel, Root Directory `frontend`, framework Vite, build `npm run build`, output `dist`. `frontend/vercel.json` có rewrite cho deep link; xem các biến `VITE_*` trong README ở thư mục gốc. Backend: Render Python Web Service, root `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Blueprint ở `backend/render.yaml`. Chọn Free, dùng subdomain có sẵn và giữ cấu hình trong hạn mức.

Render Free có thể ngủ sau 15 phút không có traffic và mất khoảng một phút để khởi động lại. Dữ liệu bền vững nằm ở Supabase; không ghi database hoặc quota vào filesystem của Render. [Giới hạn Render Free](https://render.com/docs/free)

Điền `CORS_ORIGINS` là mảng JSON URL frontend chính xác; `TURNSTILE_HOSTNAMES` là hostname tương ứng. Điền các biến riêng cho staging và dữ liệu thật. Giữ kế hoạch beta 20–30 người trước khi tăng quy mô. Hiện chưa triển khai dịch vụ hay kiểm chứng OAuth/Gemini thật.

## Vận hành

Supabase Free không gồm sao lưu tự động: giữ chức năng export JSON cho người dùng và tạo bản dump database trước migration. Chạy `python -m app.commands.maintenance` từ `backend` để dọn counter hết hạn và request hash cũ. Guest counter được giữ theo danh tính; cần dọn Auth user ẩn danh không còn dùng bằng công cụ quản trị trước khi mở quy mô lớn. Không log token, khóa dịch vụ hoặc nguyên văn câu hỏi.

Beta miễn phí, AI có giới hạn; gói nâng cao có thể thu phí khi ra mắt chính thức. Các cờ/hạn mức đã được cấu hình riêng để thay đổi về sau; chưa tích hợp thanh toán.
