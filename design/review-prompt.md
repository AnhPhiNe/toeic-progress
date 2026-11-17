# Prompt rà soát giao diện vừa thay đổi (dán nguyên khối vào phiên mới)

```
Bạn là người rà soát giao diện (UI/UX + frontend) cho dự án TOEIC Progress, nhánh `feat/design-system`. Mục tiêu: kiểm tra các thay đổi giao diện gần đây đã ổn chưa TRƯỚC khi làm tiếp. Chỉ rà soát và báo cáo; KHÔNG sửa code, KHÔNG commit, trừ khi tôi bảo.

## 1. Đọc trước
- design/session-report-2026-11-08.md (những gì đã làm, đã kiểm chứng, chưa kiểm tra)
- design/audit-desktop-manual-steps.md (bối cảnh AI-first của màn Ghi điểm; số bước bấm trong đó là ước tính)
- Ghi nhớ của dự án (đặc biệt: giữ phong cách Neo, tránh "AI slop", sửa từng thành phần, mockup trước khi sửa)

## 2. Phạm vi: 9 commit từ 15ff054 đến HEAD
cc53e8f (KPI), fe47880 (streak), 67e2a30 (nhãn KPI, biểu đồ, thẻ Kết quả), ab67b06 (thanh bên + thanh trên), 2a7676a (đếm ngược), 0d4ae77 (Ghi điểm Full Test dán ảnh), ff9fa2c (thẻ tóm tắt P1-P7), 0067ab1 (gập ngày/thời lượng, "chưa ghi giờ"), 6148ab2 (nút phụ). Dùng `git log` và `git diff 15ff054..HEAD` để xem. Các file chưa commit ExamHistoryView.tsx, history.css và current-overview.png là phần Lịch sử đang làm dở của chủ dự án: KHÔNG đánh giá, KHÔNG đụng.

## 3. Cách rà soát
A. Chạy app (npm run dev, cổng 3000; backend tùy chọn). Dữ liệu mẫu: đặt localStorage `toeic_onboarding_done_v1`=`true` và dữ liệu trong `toeic_progress_bundle_v3` (profile, sessions, mistakes). Chụp bằng Playwright, đọc ảnh thật; đừng kết luận chỉ từ code.
B. Với MỖI thành phần dưới đây, kiểm tra ở: 1440x900 và 1280x720 (sáng), 1440x900 chế độ tối (thêm class `dark` vào <html>), 1024x768, và với trạng thái trống / ít dữ liệu / nhiều dữ liệu:
 1. Tổng quan: 3 thẻ KPI (nhãn chữ màu, căn giữa), thẻ streak (5 trạng thái: chưa có chuỗi, đã học hôm nay, sắp mất chuỗi, tuần hoàn hảo, chuyển động lửa; tôn trọng prefers-reduced-motion), biểu đồ (trục chia đều, nhãn trên điểm, có đề cùng ngày "(2)", 1 điểm, 12+ điểm, điểm rơi mạnh, chiều cao theo màn hình), thẻ Kết quả gần nhất (chênh lệch tăng/giảm, mốc bậc kế tiếp, 3 tầng "bước tiếp theo", trạng thái chưa có điểm Part).
 2. Thanh bên (mục đang chọn một lớp, huy hiệu số, chấm vàng Sổ tay, menu hồ sơ: mở, Esc đóng, đổi chế độ tối, Cài đặt; thu gọn Ctrl+B và menu mở khi thu gọn) và thanh trên (chỉ tên trang, "Còn N ngày thi" trung tính/cam, nút Ghi điểm, "Chỉ lưu trên máy").
 3. Ghi điểm Full Test (máy tính): vùng dán ảnh, khách chưa đăng nhập (đòi Google), nút "Ngày: Hôm nay · giờ, ghi chú", mở chi tiết, "Nhập tay" (lưới 200 số, cửa sổ mở rộng, "‹ Quay lại dán ảnh"), thẻ tóm tắt P1-P7 sau khi chấm câu sai rồi quay lại, lưu đề không đụng thời lượng (phải lưu durationMinutes=0 và lịch sử hiện "Chưa ghi giờ"), sửa một đề cũ (phải mở thẳng Nhập tay và giữ thời lượng cũ), khôi phục bản nháp có câu sai.
C. Kiểm tra hồi quy: điện thoại 390x844 (Ghi điểm và Tổng quan phải GIỮ NGUYÊN như trước), Luyện Part và Từ vựng trong modal Ghi điểm (chưa thiết kế lại, chỉ cần không hỏng).
D. Chạy: `cd frontend && npx tsc --noEmit -p . && npx vitest run`, và e2e liên quan: `npx playwright test desktop-wrong-questions official-score-on-grid desktop-detail-flow timing-modal-flow results-lifecycle overlay-integrity` (Playwright tự mở cổng 3100). Đã biết hỏng SẴN TỪ TRƯỚC (đừng tính vào thay đổi mới): 8 bài e2e đọc ảnh/thời gian/điểm/nháp ở result-timing-and-raw-drafts, metrics-readiness, durable-form-drafts; 2 bài điện thoại 390px cùng nhóm; 4 bài history.spec.ts (56, 94, 109, 150); 7 bài aiMistakeExtractor.test.ts (có thể do đăng nhập Google, chưa xác nhận). Nếu thấy bài hỏng KHÁC danh sách này, kiểm tra bằng cách cất tạm thay đổi liên quan (`git stash push -- <file>`; nhớ `git stash pop`) để biết có phải do thay đổi mới không.

## 4. Tiêu chí đánh giá
- Đúng chức năng và số liệu (đối chiếu với dữ liệu mẫu bạn tạo).
- Còn dấu hiệu "AI slop" không: pill thừa, thẻ lặp, chữ nói trùng, khung lồng khung, màu không có nghĩa.
- Đọc rõ không: tương phản, cỡ chữ, chữ bị cắt/xuống dòng, khoảng cách lệch, nhãn đè lên đường.
- Phong cách Neo còn nhất quán (viền 2px, bóng cứng) giữa các màn.
- Chế độ tối: chữ/viền/nền đủ tương phản, không còn màu sáng cố định.
- Bàn phím và truy cập: Tab, Enter, Esc, focus nhìn thấy, aria-label cho nút chỉ có icon.
- Dữ liệu: đề lưu "chưa ghi" thời lượng có làm sai biểu đồ, kế hoạch tuần (studyPlan chỉ cộng số phút > 0), lịch sử, sao lưu/đồng bộ không (backend cho phép 0).

## 5. Báo cáo (tiếng Việt, ngắn gọn, có bằng chứng)
Với mỗi phát hiện ghi: mức độ (Hỏng / Nên sửa / Gợi ý), nơi (file:dòng hoặc màn + kích cỡ + chế độ), mô tả, ảnh chụp hoặc kết quả lệnh, cách tái hiện, đề xuất sửa nhỏ nhất. Cuối báo cáo: (a) danh sách đã kiểm tra ổn, (b) những gì KHÔNG kiểm tra được và vì sao, (c) có nên tiếp tục việc kế tiếp không (nhập tay tối giản; Luyện Part và Từ vựng).
Quy tắc trung thực: nói rõ cái gì bạn đã tự chạy/thấy, cái gì chỉ suy ra từ code; không khẳng định "ổn" nếu chưa chụp/chạy; không ẩn lỗi có sẵn từ trước; nếu một bước thất bại (ví dụ không chạy được e2e) hãy nói và đưa kết quả còn lại.
```
