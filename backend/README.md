# TOEIC Progress — Python/FastAPI

## Ảnh nguồn riêng tư

Tạo bucket `mistake-sources` qua Storage API/Dashboard, private, chỉ MIME `image/jpeg`, tối đa 1 MiB/tệp. Không tạo policy đọc/ghi trực tiếp cho anon/authenticated; backend dùng secret key và dẫn xuất thư mục từ danh tính Auth đã xác minh. Sau đó đặt `SOURCE_IMAGES_ENABLED=true`. Mặc định tắt để deploy backend trước khi bật tính năng. `SOURCE_IMAGE_ACCOUNT_LIMIT=200` giới hạn số tệp mỗi tài khoản; đây là kiểm tra trước upload, không phải quota giao dịch toàn project. Theo dõi Storage usage khi public.

Frontend chỉ lưu `sourceImageIds` (hash) trong thẻ/backup/Supabase; ảnh nằm trong Storage. Các câu cùng bài dùng chung ID. Link ký 10 phút chỉ giữ trong bộ nhớ và được tạo lại khi mở ảnh; không ghi link có token vào database/backup/log. AI tải ảnh từ thư mục của chính tài khoản và gửi bytes trực tiếp cho OpenAI, không tải URL tùy ý. Với ảnh đã lưu, context AI rỗng; chỉ giữ bằng chứng/giải thích ngắn. Thẻ cũ và form chữ vẫn hoạt động.

`POST /api/v1/mistake-images`: tối đa 3 ảnh, 2 MiB tổng; JPEG được tái mã hóa để bỏ metadata. `POST /api/v1/mistake-images/urls`: tạo link đọc ảnh của người sở hữu. Endpoint này không tính lượt AI. Lưu ảnh lâu dài yêu cầu tài khoản thường; khách không được upload vào bucket.

Xóa một thẻ không xóa ảnh dùng chung. Xóa trắng dọn ảnh cũ không còn được tham chiếu; xóa tài khoản dọn toàn bộ thư mục ảnh trước khi xóa Auth. Nếu dọn ảnh sau reset bị gián đoạn, backend trả cutoff để frontend thử dọn lại mà không reset lần nữa hoặc xóa ảnh mới. Ảnh chưa gắn thẻ do đóng form/lưu thất bại có thể còn trong kho và tính dung lượng cho tới lúc reset hoặc dọn có chủ đích. Backup JSON chỉ chứa liên kết ảnh, không chứa tệp; chuyển project/tài khoản cần xuất ảnh riêng.

Backend nghiệp vụ dùng FastAPI + Pydantic. Supabase cung cấp PostgreSQL và Auth; OpenAI chỉ được gọi từ backend. Frontend không giữ khóa AI hay service-role key.

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

Chuyển project: xem [hướng dẫn chuyển kết nối](../docs/SUPABASE_RECONNECT.md). Giữ migration/RLS/code đồng bộ; thay cấu hình theo project sau khi kiểm chứng staging.

1. Project mới chạy năm migration nền tảng theo thứ tự tên và `20261010000000_retire_gemini_provider.sql`. Migration pool ngày 07/10 được giữ làm lịch sử; OpenAI không cần nó. Project đã có pool chỉ chạy migration retire sau khi deploy backend OpenAI mới. Xem docs/DEPLOYMENT.md để cấu hình đúng thứ tự.
2. Điền `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), `SUPABASE_SECRET_KEY` (`sb_secret_...`) vào `backend/.env`. URL/publishable key của frontend phải thuộc cùng project. Secret key chỉ ở backend. Biến `SUPABASE_SERVICE_ROLE_KEY` vẫn được hỗ trợ cho cấu hình cũ dùng JWT; cấu hình mới dùng secret key.
3. Bật Google OAuth, Site URL và Redirect URLs cho localhost và domain frontend. Bản đầu ẩn email OTP; chỉ bật `VITE_ENABLE_EMAIL_OTP=true` sau khi cấu hình SMTP riêng.
4. Bật Anonymous Sign-Ins và Turnstile CAPTCHA trong Auth. Khách chỉ được tạo phiên ẩn danh khi dùng AI; phiên này không kích hoạt đồng bộ dữ liệu học.
5. Cấu hình Turnstile site key ở frontend và secret key ở backend. `TURNSTILE_HOSTNAMES` là mảng JSON các hostname frontend được chấp nhận, không có scheme/path. Backend xác minh token với action `toeic-ai`.

Mọi yêu cầu API xác thực token qua `/auth/v1/user`, không giải mã JWT rồi tin vào nội dung chưa xác minh. HTTP API lấy owner từ phiên đã xác thực. RPC ghi và quota chỉ cấp `EXECUTE` cho `service_role`; client không được sửa bộ đếm hoặc gọi RPC bằng user ID tự chọn. Anonymous JWT cũng bị chặn đọc dữ liệu tài khoản qua RLS.

## OpenAI trực tiếp — GPT-6 Luna

Đặt các biến backend/Render:

```dotenv
OPENAI_API_KEY=REPLACE_PRIVATE_KEY
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=medium
OPENAI_MAX_OUTPUT_TOKENS=8192
OPENAI_TIMEOUT_SECONDS=45
```

`OPENAI_API_KEY` là **một chuỗi key**, không phải mảng JSON. Dùng tài khoản OpenAI API có tín dụng; chi phí không nằm trong hạn mức ChatGPT. Key chỉ ở backend. Chuẩn bị key và các biến trước khi lưu/redeploy với `AI_ENABLED=true`. Backend chỉ dùng OpenAI, không có biến chọn provider.

Backend gọi cố định `https://api.openai.com/v1/responses`, model `gpt-6-luna`, `reasoning.effort=medium`, Structured Outputs theo schema sổ tay, `store=false`, Standard processing. Không gửi `temperature`/`top_p` cho cấu hình reasoning này. Có thể chọn `low` hoặc `high` bằng biến effort; medium là lựa chọn ban đầu cho việc trích xuất kèm phân tích. Giới hạn output 8.192 token bao gồm token suy luận; bản nháp chưa hoàn chỉnh/bị từ chối không được lưu. Mỗi lượt chỉ gửi một request; timeout hoặc lỗi quota/billing không tự gọi lại hay xoay key. Log chỉ ghi request ID, status, thời gian và số token input/output, không ghi câu hỏi, đáp án hay key. Backend gửi safety identifier HMAC thay vì email/user ID thô.

`/health` công khai `ai_provider=openai`. Frontend kiểm tra đúng bên nhận trước khi bật phân tích; extraction yêu cầu `provider=openai` và `consent=true`. Provider khác, thiếu bên nhận hoặc thiếu consent bị từ chối trước quota AI. Không tự gửi nội dung của client cũ đã đồng ý với bên khác sang OpenAI.

Prompt OpenAI ở `app/services/toeic_prompt.py` tập trung TOEIC Reading: Part 5 phân biệt cấu trúc/từ loại/nghĩa/collocation; Part 6 thêm liên kết/mạch văn; Part 7 dựa vào bằng chứng và paraphrase trong bài. AI trả nghĩa từng phương án qua `optionNotes` và các mục giải thích qua `explanation`; backend ghép `trapTip` có nhãn để tương thích client cũ. Giữ nguyên tiếng Anh trong `options`. Nghĩa phương án chỉ gồm bản dịch/dạng từ, ưu tiên nghĩa trong câu và có thể thêm 1–2 nghĩa cùng từ loại thường gặp trong TOEIC Listening & Reading, tối đa 120 ký tự; không trộn lý do chọn/loại hay liệt kê từ điển. `analysis` dùng xuống dòng thật giữa dấu hiệu và từng phương án. Bản dịch phải giữ các cụm mang nghĩa của câu nguồn, kể cả tính từ như revised/latest/additional, và nhất quán với nghĩa phương án. Frontend tách câu trong phân tích cũ để dễ đọc, không sửa dữ liệu đã lưu.

Đầu ra OpenAI mới phải có đúng một ghi chú không rỗng cho mỗi phương án có nhãn A–D; nhãn trùng, phương án không nhãn/rỗng hoặc thiếu ghi chú trả lỗi bản nháp 502, không tự retry. Kiểm tra này chỉ áp dụng đầu ra OpenAI mới; bản ghi cũ thiếu các trường có cấu trúc vẫn đọc như trước. Backend kiểm tra cấu trúc, không dùng từ điển hardcode để tự sửa nghĩa hay cam kết phát hiện mọi lỗi dịch. `trapTip` sau ghép được giới hạn 4.000 ký tự theo đoạn và ghi rõ rút gọn khi cần; các mục `explanation` đầy đủ vẫn được giữ. Bộ test dùng transport giả kiểm tra từ API tới grounding; đánh giá ngữ nghĩa thật dùng [bộ câu Reading](../docs/AI_READING_EVAL.md). Bản demo không phải kết quả live của provider.

Modal Sổ tay mới gửi nhóm `input` có cấu trúc cùng endpoint `/api/v1/ai/extract`: câu hỏi/phương án, ngữ cảnh, lựa chọn CHOSEN/UNKNOWN/BLANK, nguyên văn lý do và đáp án nguồn riêng. `/health` có `structured_mistake_input=true` để frontend biết backend hỗ trợ; deploy backend trước frontend mới. Lời kể chứa `Đáp án chuẩn:` không trở thành sourceAnswer. Request nhiều câu có nhãn/số câu hoặc nhóm phương án lặp bị từ chối trước quota AI/provider. Nhóm đầu vào người học được đưa vào hash chống gửi trùng; không log nội dung. Timestamp ôn mới có múi giờ; date-only cũ được nhận khi sync và chuẩn hóa UTC đầu ngày. Thẻ thiếu đáp án vẫn lưu được nhưng frontend không đưa vào ôn. Các field bổ sung nằm trong `extra`, không cần migration database mới.

Thẻ hỗ trợ `sourceTestName` tùy chọn/nullable, tối đa 300 ký tự, lưu qua schema sync và SQL `extra` hiện có. Chuỗi rỗng là người học gỡ nguồn; null/thiếu trường cho phép frontend nhận nguồn cũ qua `sessionId` và lịch sử làm bài. Tên đề không nằm trong input gửi model; người học tự chọn/nhập tên.

Đáp án nguồn là tùy chọn. Có đáp án hợp lệ trong input thì ưu tiên `answerSource=PROVIDED`; nếu AI trả phương án khác, grounding giữ đáp án nguồn và cảnh báo mâu thuẫn. Không có đáp án nguồn nhưng đủ câu hỏi/phương án/ngữ cảnh: AI tự giải và trả `AI_PROPOSED`. Với input có cấu trúc, strict schema ràng buộc `correctAnswer` chỉ là một phương án gốc hoặc chuỗi rỗng; tránh AI tự thêm dấu câu/chú thích khiến grounding không khớp. Grounding vẫn đối chiếu nhãn và nội dung; không đoán lại đáp án từ lời giải. Không tin `PROVIDED` khi input không có đáp án nguồn. Thiếu dữ liệu hoặc đáp án nguồn không khớp vẫn dùng `MISSING`/chuỗi rỗng; không tự thay nguồn lỗi bằng suy đoán. `answerSource` được lưu trên `Mistake`/`MistakeEntry`, backup và sync, vào cột `extra` hiện có, không cần migration. Phương án AI chọn hiện xanh lá kèm 'AI đề xuất' ở preview, sổ tay và sau khi trả lời trong ôn tập; người học vẫn kiểm tra trước khi lưu.

Giữ quota beta của tài khoản thường (3 lượt khách, 10/tháng, toàn app 20/ngày, 2/phút) và theo dõi usage trên OpenAI. Đây là giới hạn **lượt**, không phải trần hóa đơn USD. Gmail được miễn có thể dùng vượt các cap đó và vẫn phát sinh phí; đặt ngân sách/giới hạn trong project OpenAI theo mức đã chọn. Tham khảo [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [reasoning](https://developers.openai.com/api/docs/guides/reasoning), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Mẫu `.env` và Render Blueprint bắt đầu với `AI_ENABLED=false`. Sau khi có OpenAI key và Turnstile, bật AI và kiểm thử trên staging. Giới hạn app: khách 3 lượt, tài khoản 10/tháng, toàn app 20/ngày và 2/phút, IP 5/ngày; các bucket tính theo UTC. Giữ quota và UUID chống gửi trùng trước đúng một lần gọi OpenAI, kể cả khi provider báo lỗi.

`AI_UNLIMITED_EMAILS` là mảng JSON các Gmail được miễn **toàn bộ hạn mức AI của app** (tháng/ngày/phút, tài khoản/IP), ví dụ `["your-account@gmail.com"]`; mặc định `[]`. Chỉ đặt ở backend `.env` hoặc Render, không ở biến `VITE_*`. Backend lấy email đã xác nhận và Google identity có `email_verified=true` từ Supabase Auth; không tin email/quyền do frontend hoặc `user_metadata` tự gửi. Danh sách chỉ cấp quyền dùng AI, không cấp quyền đọc dữ liệu người khác. Quyền được xác minh lại với Supabase trong mọi request. Ingress dùng hint HMAC của phiên đã xác minh, tối đa 1.024 mục/60 giây, chỉ để bỏ chặn IP cho phiên được nhận diện; hint không thay thế xác thực. AI của tài khoản được xác minh không tiêu bộ đếm spam ingress. Các API đồng bộ/xóa vẫn có giới hạn riêng. Vẫn giữ giới hạn request đang xử lý, kích thước, timeout, UUID chống gửi trùng và quota của nhà cung cấp. Request vẫn ghi counter/audit dùng chung; tài khoản thường có thể hết budget ngày khi tổng sử dụng tăng. Không cần migration mới: RPC service-role nhận `NULL` cho các cap được miễn. `/api/v1/ai/usage` và extraction trả `unlimited=true`, `limit=null`, `remaining=null` cho tài khoản đủ điều kiện. OpenAI tính phí cả những request của Gmail được miễn.

### Dọn cấu hình đã bỏ

Backend chỉ dùng OpenAI; không còn biến chọn provider hay cơ chế xoay key/model. Sau khi deploy backend mới, gỡ `AI_PROVIDER` và mọi biến `GEMINI_*` khỏi Environment của Render. Chạy `20261010000000_retire_gemini_provider.sql` để dọn hai bảng/RPC của provider cũ. Migration chỉ dọn metadata vận hành, giữ dữ liệu học và quota AI chung. Giữ migration ngày 07/10 đã áp dụng; không sửa hoặc chạy lại file đó. Không rollback về backend cũ dùng pool sau khi đã dọn database.

AI nhận văn bản tối đa 8.000 ký tự, một ảnh tranh Part 1 hoặc tối đa 3 ảnh ngữ cảnh Part 7 (PNG/JPEG/WebP). Mọi lượt đều cần phương án bằng văn bản; Part 1 dán riêng bốn mô tả A–D, nhãn `Part 1 · Mô tả tranh` là nhãn app, không phải câu hỏi tiếng Anh được AI tạo. Part 1 cần một tranh khi phân tích, không tự lấy đáp án từ A–D nếu thiếu tranh. Part 7 dán câu hỏi cùng A–D; ảnh chỉ cung cấp ngữ cảnh bài đọc/email/bảng/biểu đồ. Ảnh vô tình dính câu khác/đáp án không được dùng thay câu và A–D đã dán. Client nhận ảnh tối đa 5 MB, chuẩn hóa tại máy về JPEG cạnh dài tối đa 2.048 px và 600 KiB/ảnh; API kiểm tra byte ảnh, MIME, raster thật, ảnh tĩnh, tối đa 1 MiB/ảnh và 2 MiB tổng, trước quota/provider. Body request vẫn giới hạn 4 MiB. `/health` có `part7_context_images=true` và `part1_picture_input=true`; frontend không tự bỏ ảnh khi gặp backend cũ.

Ảnh đi cùng text qua `input_image` với detail `high` trong đúng một request OpenAI. Chỉ bấm Phân tích với AI mới gửi với consent; tải/dán/xem ảnh không gọi provider. Ảnh chỉ tồn tại trong form để đối chiếu, không lưu vào Supabase/localStorage/backup. Thẻ lưu câu hỏi, phương án và ngữ cảnh đã trích để ôn. Trích chữ từ ảnh chưa thể được máy chủ xác minh bằng so khớp text: API cảnh báo đối chiếu OCR ngữ cảnh; schema ràng buộc câu hỏi đúng nguyên văn đã dán, grounding kiểm tra cả câu hỏi/A–D. Thiếu bốn phương án bị chặn trước quota; ảnh thiếu thông tin quyết định thì MISSING. Hash chống gửi trùng có cả nội dung và thứ tự ảnh, log không ghi ảnh/base64/tên tệp. Hai trường `question`/`context` lưu trong `extra`, không cần migration cho ảnh. Part 1 lưu mô tả ngắn của AI về chi tiết nhìn thấy trong `context`, có nhãn “Mô tả tranh · AI”, không phải transcript/trích nguyên văn. Người học đối chiếu trước lưu; ảnh không lưu cùng thẻ nên ôn lại bằng mô tả văn bản và muốn phân tích lại cần thêm tranh. Không suy đoán nghề/ý định hoặc nguyên nhân nghe sai. PDF/audio chưa được hỗ trợ.

Kiểm thử model thật dùng `python scripts/ai/evaluate-part7-images.py` từ repo gốc: một đợt tối đa 6 request bằng đề/ảnh tự tạo, không retry, không sửa dữ liệu học hay bật AI trên hosting. `--prepare-only` chỉ tạo fixture, không gọi AI. Report ghi output và token usage của các fixture, không chứa key. Unit/E2E dùng phản hồi giả vẫn chạy riêng; report live không thay thế kiểm chứng tài khoản/quota trên website.

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

Điền `CORS_ORIGINS` là mảng JSON URL frontend chính xác; `TURNSTILE_HOSTNAMES` là hostname tương ứng. Điền các biến riêng cho staging và dữ liệu thật. Giữ kế hoạch beta 20–30 người trước khi tăng quy mô. Hiện chưa triển khai dịch vụ hay kiểm chứng OAuth/AI trên môi trường đích.

## Vận hành

Duyệt tester và quota riêng: xem [hướng dẫn quyền AI](../docs/AI_ACCESS.md). Sau migration `20261011000000_ai_access_grants.sql`, bật `AI_ACCESS_MANAGED=true` để dùng bảng `public.ai_access_grants`. Tài khoản mới chờ duyệt; `status=active` và `monthly_limit` cấp lượt tháng riêng, `NULL` miễn hạn mức ứng dụng. Trong chế độ này, bảng là nguồn quyền duy nhất và danh sách email miễn cũ không ghi đè quyết định tạm khóa. Chưa áp dụng migration thì giữ cờ false; readiness sẽ không đạt nếu bật khi thiếu bảng.

Supabase Free không gồm sao lưu tự động: giữ chức năng export JSON cho người dùng và tạo bản dump database trước migration. Chạy `python -m app.commands.maintenance` từ `backend` để dọn counter hết hạn và request hash cũ. Guest counter được giữ theo danh tính; cần dọn Auth user ẩn danh không còn dùng bằng công cụ quản trị trước khi mở quy mô lớn. Không log token, khóa dịch vụ hoặc nguyên văn câu hỏi.

Beta miễn phí, AI có giới hạn; gói nâng cao có thể thu phí khi ra mắt chính thức. Các cờ/hạn mức đã được cấu hình riêng để thay đổi về sau; chưa tích hợp thanh toán.

Part 2–4 thống nhất gọi phần văn bản của nội dung nghe là Transcript: Part 2 dùng transcript câu hỏi và ba phản hồi A–C; Part 3/4 dùng transcript hội thoại/bài nói cùng một câu hỏi và A–D. App chỉ phân tích văn bản, không nhận hoặc xử lý audio.

Form sổ tay bắt buộc chọn Part 1–7 trước khi phân tích hoặc lưu, không tự nhận diện theo nội dung. Backend kiểm tra Part trong input có cấu trúc; schema output OpenAI ràng buộc Part đã chọn. Thẻ cũ giữ Part đã lưu khi mở sửa.

Local development: tài khoản được Supabase xác thực có thể gọi AI khi thiếu Turnstile secret, miễn OpenAI/database/rate-limit secret đã cấu hình. Guest vẫn bắt buộc CAPTCHA và bị chặn trước quota/provider nếu thiếu secret. Staging/production vẫn yêu cầu cấu hình Turnstile đầy đủ khi bật AI. Không có bỏ xác thực hoặc miễn quota do chạy local.

Form gọn: Part và Đề bắt buộc cùng hàng; câu hỏi, transcript/đoạn đọc và phương án dán trong một ô nguồn. Backend nhận `input.rawText` không kèm câu hỏi/phương án đã tách; Luna tách và giải trong cùng lần gọi. Trường lựa chọn, lý do và đáp án nguồn vẫn riêng. `inputIssue` phân biệt nhiều câu, thiếu câu hỏi và thiếu phương án; server trả 422 cụ thể, giữ nội dung người dùng. Nguồn trích được kiểm tra trước khi tạo bản nháp; không tự retry LLM khi output chưa hợp lệ. Capability `freeform_mistake_input` giúp frontend cũ/new tương thích. Luồng `input.question/options` cũ vẫn hỗ trợ.
