# Kiểm thử AI thật — 22–23/10/2026

## Phạm vi

Người dùng đã cho phép kiểm tra các tính năng AI thật bằng tài khoản chủ và cung cấp bảy ảnh kết quả từ website đang luyện. Kiểm thử trên frontend/API production đang phục vụ; các sửa mới ở nhánh `codex/frontend-readiness-fixes` chưa deploy. Chỉ tạo thẻ mang nhãn QA riêng, không chỉnh câu học cũ. Không ghi điểm Full Test từ bộ ảnh chưa đủ câu. Các lần đọc admin trước đây không được mở rộng sang các thẻ QA mới.

## Ma trận thực tế

| Luồng | Dữ liệu | Kết quả quan sát |
| --- | --- | --- |
| Phân tích Part 5, paste linh hoạt | Câu tự soạn có dòng `Câu hỏi` / `101`; chọn B, đáp án nguồn A | Đã đạt ở lượt trước; giữ lý do/đáp án, lưu/reload/ôn và đối chiếu đúng thẻ trên Supabase sau khi người dùng cho phép |
| Part 6 nhiều đoạn | Ba đoạn về sửa văn phòng, câu nối However/Therefore | Đúng However, giữ đủ ngữ cảnh liên quan, nhãn AI đề xuất; lưu được |
| Part 7 nhiều ảnh và bảng | Hai fixture tự soạn: email + bảng giá workshop | Đúng Data Basics vì Member rate $0; giữ đáp án nguồn C/lựa chọn A; không lặp OCR trong preview; nghĩa phương án nằm trong lời giải |
| Thêm câu cùng bài | Câu hỏi lunch preference trên cùng hai ảnh | Giữ hai ảnh; xóa lựa chọn/đáp án câu trước; đúng B với bằng chứng từ email; lưu được |
| Quét nhiều câu từ ảnh | Hai fixture, yêu cầu 153/154/155; ảnh chỉ chứa 153/154 | Đọc đúng hai câu, không tạo 155. Bản production cũ chưa trình bày số câu thiếu; bản sửa local đã bổ sung |
| Lời giải theo ticket sau quét | Hai câu vừa lưu | Lời giải tự đến sau lưu; câu 154 thiếu đáp án được bổ sung B với nhãn AI đề xuất; câu 153 có đáp án nguồn cố tình sai A vẫn giữ A và báo nghi vấn C, cho người học quyết định |
| Phân tích lại thẻ đã lưu | Thẻ Part 5 thủ công về `must be submitted` | Mở Sửa → AI → Lưu thay đổi; đúng B, giữ lựa chọn A và lý do; cập nhật đúng thẻ cũ |
| Đọc ảnh kết quả thật | Bảy ảnh người dùng cung cấp | Đúng 49/49 câu sai nhìn thấy; không thiếu/thừa/trùng số; phân bố Part khớp; chưa lưu điểm vì thiếu ảnh 92–94 |
| Quyền AI và phạm vi tester | Đăng nhập lại tài khoản tester pending | Đúng identity tester, không thấy dữ liệu/nhãn QA chủ; lưu thủ công và reload giữ một thẻ QA riêng; AI vẫn bị vô hiệu hóa, không đổi grant |
| Retry ticket sau lỗi thật | Chưa gây lỗi provider trên production | Chưa thử lỗi thật; có kiểm thử tự động giả lập lỗi, thử lại và giới hạn ticket. Không cố gây outage/hết quota để kiểm thử |
| Giải thích thẻ Part 7 chỉ có ảnh | Phát hiện từ call chain, kiểm chứng bằng E2E | Production cũ bỏ ảnh trong request on-card; đã sửa local và kiểm thử, cần smoke sau deploy |

Form tạo mới hiện chỉ hỗ trợ Reading Part 5–7. Hỗ trợ Listening Part 1–4 trong backend/legacy không có nghĩa form mới có đường vào cho các Part này; không ghi là đã live-test đủ bảy Part.

## Đối chiếu độc lập bảy ảnh thật

Subagent và agent chính đối chiếu bằng mắt trước khi gọi AI, dùng ô đỏ có X để xác định câu sai. Chữ phương án đỏ bên cạnh dấu tích xanh vẫn là câu đúng. Không thấy câu bỏ trống; câu 186–188 xuất hiện lặp ở hai ảnh và đều đúng.

| Part | Số câu sai | Số câu |
| --- | ---: | --- |
| 1 | 1 | 3 |
| 2 | 4 | 13, 14, 22, 31 |
| 3 | 11 | 40, 43, 45, 47, 48, 49, 52, 54, 55, 65, 66 |
| 4 | 7 | 75, 78, 80, 81, 82, 87, 91 |
| 5 | 8 | 104, 105, 108, 112, 125, 126, 127, 128 |
| 6 | 3 | 138, 142, 143 |
| 7 | 15 | 154, 157, 164, 166, 168, 169, 170, 184, 191, 192, 193, 194, 195, 198, 200 |

Đọc danh sách số câu từ ô nhập đang hiển thị trong form, bung các khoảng như `47-49`, đối chiếu với danh sách trên: expected 49, found 49, missing `[]`, extra `[]`, duplicates 0. Chỉ đọc DOM, không đọc token/localStorage/session ẩn.

Ảnh có câu 1–91 và 95–200, thiếu 92–94. UI hiện ước tính 655 từ danh sách 49 câu sai, nhưng con số đó chưa xác nhận được cho cả đề khi ba câu chưa có ảnh; form đã đóng mà không lưu điểm. Kết quả 49/49 chỉ áp dụng bộ ảnh này, không phải tỷ lệ chính xác chung của AI.

## Số thao tác và bằng chứng

Đợt mở rộng thực hiện sáu thao tác AI trực tiếp từ UI: Part 6, Part 7 hai ảnh, câu dùng lại ảnh, quét batch, phân tích lại Part 5 và đọc bảy ảnh kết quả. Sau lưu batch, ứng dụng tự gửi lời giải theo ticket cho hai câu. Đây là các lời gọi OpenAI trả phí dù không tính thêm lượt quota ứng dụng cho ticket; không có billing log để báo chi phí USD chính xác. Không chủ động retry generation trong lượt này.

Ảnh bằng chứng nằm trong `scratch` (Git ignored):

- `ai-suite-part6-preview.jpg`
- `ai-suite-part7-table.jpg`
- `ai-suite-batch-read.jpg`
- `ai-suite-ticket-explanations.jpg`
- `ai-suite-real-results-49.jpg`
- `ai-suite-tester-pending.jpg`
- `ai-suite-tester-owner-search.jpg`

Sau khi người dùng đăng nhập lại tester, Sổ tay trống. Người dùng xác nhận đã xóa/reset dữ liệu tester trước đó, giải thích vì sao thẻ QA cũ không còn. Tạo mới đúng một thẻ `QA isolation 23-10-2026` (`Every guest ____ a badge at reception.`), chọn B/đáp án nguồn A, lưu thủ công; UI Đã đồng bộ, reload vẫn có thẻ. Tìm `QA AI` trả không có thẻ, reset bộ lọc khôi phục đúng một thẻ tester. Không thấy các bài thi/thẻ chủ. Đây là kiểm tra đường vào ứng dụng bình thường với hai tài khoản; chưa phải phép thử gọi PostgREST độc lập bằng JWT tester để cố đọc owner khác.

## Bản sửa phát hiện trong đợt này

1. Giải thích thẻ ảnh gửi `sourceImageIds`; chặn lời giải đến muộn nếu đổi owner/rời trang/sửa câu hoặc ảnh/xóa thẻ; giữ lời giải mới đã có. Client kiểm tra owner/current task qua session, CAPTCHA và request. Form phân tích một câu cũng truyền owner/current guard vào client, thay vì chỉ bỏ response sau khi đã gửi.
2. Đọc ảnh kết quả dùng callback hiện tại, giữ thao tác thêm/bỏ đánh dấu trong lúc chờ; vô hiệu hóa response sau đóng form/chuyển chế độ/đổi tài khoản; chặn gửi chéo phiên trong auth/CAPTCHA.
3. Ghi điểm và sinh các thẻ câu sai trong cùng một lần ghi bundle; quota lỗi không để session đã lưu mà draft thất bại. Cập nhật khiên tự động cùng transaction; hiệu ứng/onboarding hậu lưu không làm báo sai rằng lưu thất bại.

Hai subagent bị hết hạn mức khi kiểm thử đang dở. Agent chính đã nhận phần code, bổ sung kiểm thử atomicity và sửa các selector/harness E2E chưa hoàn tất. Không lấy thông báo agent hoàn tất làm bằng chứng kiểm thử.

## Xác nhận code trước deploy

- Frontend unit: 362 đạt / 51 files.
- Nhóm E2E ảnh, result lifecycle, handoff, edit conflict: 16 đạt.
- TypeScript, lint, build đạt; build còn cảnh báo kích thước bundle và annotation Zod như trước.
- Bộ E2E tổng thể sau đợt sửa: 210 đạt trong một lần chạy (4,4 phút).
- Sau khi nối guard form một câu: thêm một E2E mới xác nhận owner/guard được truyền và mất hiệu lực khi đóng; 20 ca liên quan đạt (gồm ca mới và 19 ca AI/ảnh chạy lại). Tổng 211 kịch bản E2E khác nhau đã xác nhận đạt; không tuyên bố một lần chạy toàn bộ 211 trên snapshot cuối.
- Build và lint chạy lại sau guard cuối: đạt. `git diff --check` đạt.

## Còn cần xác nhận

Không tự công bố production sẵn sàng hoàn toàn từ các smoke test này. Cần deploy bản sửa rồi smoke lại các luồng đã đổi. Kiểm tra chuyển tài khoản/nguồn dữ liệu trên UI đã đạt, nhưng không thay thế kiểm tra RLS với JWT của hai tài khoản trên môi trường staging. Nếu muốn ghi điểm thật cho bộ ảnh kết quả cần bổ sung 92–94. Dữ liệu QA mới vẫn được giữ riêng để đối chiếu/dọn có chủ đích, chưa xóa; tab production kết thúc ở tài khoản tester.
