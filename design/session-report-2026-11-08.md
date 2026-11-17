# Báo cáo phiên làm việc: tinh chỉnh giao diện desktop (08/11/2026, nhánh `feat/design-system`)

## Bối cảnh và quy tắc làm việc
- Yêu cầu ban đầu "thiết kế lại toàn bộ vì AI slop" đã được chuyển thành: **giữ phong cách Neo, sửa từng thành phần**.
- Quy tắc đã chốt: trước khi phác hay sửa một phần giao diện, **tham khảo ngoài trước** (sản phẩm thật, thư viện UI), phác ảnh cho chủ dự án duyệt, rồi mới sửa code; nói rõ nguồn nào không xem được.
- Nguồn đã dùng: Refero (chỉ một lượt, sau đó hết hạn mức), Mobbin (bản miễn phí chỉ vài màn; chặn khung trình duyệt trong app), neobrutalism.dev (Charts, Sidebar, Dropdown, Dialog, Table), shadcn/ui, Flowbite, DaisyUI, Ant Design, bài về đếm ngược ngày thi, mẫu "AI đọc rồi xác nhận". Dribbble xem rồi bỏ (toàn ảnh trình diễn).

## Các commit (cũ đến mới)
| Commit | Nội dung |
|---|---|
| `cc53e8f` | 3 thẻ KPI: bỏ pill góc, emoji, đường kẻ chân thẻ |
| `fe47880` | Streak: lửa SVG hai lớp có chuyển động (cháy/yếu/xám), vòng "Nay" bật tích, dòng nhắc "Học để giữ chuỗi", số cam khi sắp mất chuỗi, ngày bỏ lỡ xám có viền. Đã thử lưới 12 tuần rồi bỏ |
| `67e2a30` | Nhãn KPI chữ màu, căn giữa. Biểu đồ: đường xanh viền đen, trục chia đều, nhãn luôn trên điểm có viền trắng, cao theo màn hình. Thẻ Kết quả: bỏ pill/hộp lồng, chênh lệch tăng giảm cỡ lớn, mốc bậc CEFR kế tiếp, ngày dd/mm ("Hôm nay"), tên đề lên đầu, khối "bước tiếp theo" 3 tầng. Thêm `ScoreReportCard.test.ts` |
| `ab67b06` | Thanh bên: một lớp nhấn, huy hiệu vòng đỏ nhạt, menu hồ sơ (Chế độ tối, Cài đặt). Thanh trên: chỉ tên trang, bỏ "Hành trình /", bỏ ô phím N, bỏ nút trăng |
| `2a7676a` | Đếm ngược: chữ thường, cam khi ≤ 30 ngày, không đỏ, không nhấp nháy |
| `0d4ae77` | Ghi điểm Full Test (máy tính): mặc định vùng "Dán ảnh kết quả vào đây", lưới 200 số và công cụ cũ sau "Nhập tay", cửa sổ hẹp lại, trạng thái khách chưa đăng nhập. Sửa 13 bài e2e (hàm `openManualEntry`) |
| `ff9fa2c` | Thẻ tóm tắt dạng bảng: điểm, số câu sai, hàng P1 đến P7 |
| `0067ab1` | Ngày và Thời lượng gập vào chi tiết. Đề mới không nhập thời lượng lưu là 0 (chưa ghi), hiển thị "Chưa ghi giờ" |
| `6148ab2` | "Nhập tay" và nút chi tiết thành nút có viền; "Ngày: Hôm nay · giờ, ghi chú ▾"; ghi chú vào chi tiết |

## Chưa commit (không phải của phiên này)
`frontend/src/features/study-sessions/components/ExamHistoryView.tsx`, `history.css` (phần Lịch sử chủ dự án đang làm dở), `design/previews/img/current-overview.png`. Phiên này không sửa các file đó (chỉ cất tạm rồi trả lại khi so sánh test).

## Đã kiểm chứng
- TypeScript sạch sau mỗi thay đổi. Test đơn vị dashboard 14 đạt, `study-sessions` 47 đạt.
- Các bài e2e Ghi điểm: khoảng 36 đạt ở lượt lớn nhất; sau các lần sửa nhỏ chỉ chạy lại một phần.
- Chụp từ app thật (Playwright 1440×900) cho từng thay đổi. Ảnh: `design/audit-2026-11-08/` (trước) và `design/audit-2026-11-08/after/` (sau); mockup: `design/previews/`.
- Test hỏng đã xác minh là **có sẵn từ trước** (bằng cách cất tạm thay đổi): 8 bài về đọc ảnh/thời gian/điểm/nháp và 2 bài điện thoại 390px (`result-timing-and-raw-drafts`, `metrics-readiness`, `durable-form-drafts`); 4 bài trong `history.spec.ts`. Thêm 1 bài `history.spec.ts` hỏng do phần Lịch sử đang làm dở (nút "Sắp xếp theo Tổng"). Chưa xác nhận 7 bài AI trong `aiMistakeExtractor.test.ts` (đòi đăng nhập Google) có sẵn từ trước không.

## Chưa kiểm tra (cần kiểm tra ở phiên mới)
1. AI đọc ảnh thật: chưa thấy thẻ tóm tắt với kết quả AI thật (máy chủ giả lập vướng captcha khách).
2. Chế độ tối của toàn bộ phần đã đổi.
3. Thanh bên khi thu gọn, tablet, điện thoại (phần Ghi điểm điện thoại không đổi).
4. Cửa sổ thấp (~650px): Tổng quan vẫn cuộn nhẹ ~48px (nghi có sẵn, chưa kiểm).
5. Thẻ streak ở ~1280px chật (chưa rõ có sẵn hay do phiên này).
6. Nút "Ẩn chi tiết" nằm dưới ô ghi chú, còn nút mở ở trên vùng dán ảnh (nhảy vị trí khi mở).

## Điểm cần quyết định
- Hạn mức lượt AI (kiểm kê ghi mặc định: khách 3, tài khoản 10 lượt/tháng; giá trị thật chưa kiểm).
- Dải "AI chưa chắc" cần biết backend có trả độ tin cậy từng mục không.
- Chấm vàng ở Sổ tay được giữ vì báo "câu Reading chưa ghi chi tiết" (khác với số "3" là câu đến hạn).
- Thời lượng "chưa ghi" chỉ áp dụng cho máy tính và đề mới; điện thoại và đề cũ giữ nguyên.

## Việc còn lại (theo thứ tự đề xuất)
1. Nhập tay tối giản (hai ô điểm L/R, một ô gõ số câu sai).
2. Luyện Part và Từ vựng theo ảnh phác đã duyệt (`design/previews/mock-logger2.html`).
3. Dải "AI chưa chắc" và hàng "Thời gian" trong thẻ tóm tắt.
4. Kiểm tra chế độ tối, tablet, điện thoại.
5. Các trang chưa động tới: Kế hoạch, Lịch sử, Phân tích điểm, Sổ tay, Từ vựng.

## Tài liệu liên quan
- `design/audit-desktop-manual-steps.md`: kiểm kê thao tác thủ công và đề xuất AI-first (số bước bấm là ước tính).
- Mockup đã duyệt: `mock-logger.html`, `mock-logger2.html`, `mock-chrome2.html`, `mock-streak-full.html`, `mock-result-tone.html` trong `design/previews/`.
