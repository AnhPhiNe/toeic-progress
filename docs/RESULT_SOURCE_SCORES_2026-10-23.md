# Điểm nguồn trong ảnh kết quả và vị trí đăng xuất — 23/10/2026

## Yêu cầu và hành vi

Điểm của trung tâm/website có thể khác bảng quy đổi tham khảo của ứng dụng. Luồng đọc ảnh kết quả nay trả thêm `scores: { listening, reading, total }`, mỗi giá trị có thể là `null` khi không nhìn thấy rõ. Prompt chỉ chép điểm kết quả hiện tại được ghi trên ảnh; không đổi số câu đúng/sai/phần trăm thành điểm, không tự điền kỹ năng từ tổng và không tự cộng L/R để giả làm tổng nhìn thấy.

Sau khi đọc ảnh, khung “Điểm từ đề” cho xem/sửa L, R, tổng và chọn dùng L/R hoặc chỉ tổng. Nút Áp dụng mới đổi nguồn điểm lưu sang `MANUAL_SECTIONS`/`MANUAL_TOTAL`. Các câu sai/bỏ trống vẫn được giữ để sinh thẻ Sổ tay. Nếu nguồn chỉ có tổng thì không tạo điểm kỹ năng. Nếu tổng và L/R không khớp, yêu cầu sửa hoặc chủ động chọn chỉ tổng.

Khi đã phát hiện điểm hoặc người dùng sửa khung điểm, nút lưu yêu cầu áp dụng điểm nguồn hoặc chủ động chọn Dùng điểm ước tính; tránh vô tình lưu con số quy đổi trong lúc điểm nguồn vẫn chưa được xác nhận. Bản nháp điểm/các sửa tay được giữ khi chuyển layout phone/desktop. Backend cũ không trả scores vẫn đọc câu sai bình thường và có đường nhập điểm nguồn thủ công.

Đăng xuất vẫn gọi cùng cơ chế đăng xuất cục bộ của Supabase Auth. Theo yêu cầu giao diện mới, nút nằm dưới phần Xóa toàn bộ dữ liệu trong Cài đặt trên cả phone/desktop, có khoảng cách và màu trung tính. Không nằm trên header hoặc lặp thêm trong sheet Tài khoản. Lỗi đăng xuất hiện tại nút, không làm xóa dữ liệu học; chế độ khách không hiển thị nút này.

## Kiểm tra

- 365 frontend unit test đạt.
- 326 backend test đạt, gồm điểm nguồn đầy đủ, chỉ tổng, chỉ một kỹ năng, không có điểm và phản hồi điểm sai thang/bước; mỗi test provider giả lập chỉ một request.
- 29 E2E liên quan đạt: điểm nguồn khác ước tính, xác nhận trước lưu, sửa điểm, chỉ tổng, xung đột tổng/L/R, nhập tay khi ảnh không có điểm, giữ câu sai/draft/reload, đổi layout, các lifecycle AI trước đó, nút đăng xuất đúng vị trí trên 375/1280px, lỗi đăng xuất và chế độ khách.
- TypeScript, lint, build và whitespace check đạt. Build còn cảnh báo bundle/Zod của thư viện như trước.

Ảnh minh chứng local (Git ignored): `scratch/settings-logout-bottom-2026-10-23.png`, `scratch/source-score-review-2026-10-23.png`. Ảnh dùng dữ liệu/mock Auth/OpenAI của E2E; chưa phải kiểm thử trích điểm mới bằng provider thật.

## Triển khai

Đợt bổ sung này **có thay đổi backend**, khác đợt readiness chỉ sửa frontend trước đó. Cần cập nhật Render backend và Vercel frontend; triển khai backend trước để trả scores/capability mới. Không đổi schema Supabase: dùng lại các trường điểm/nguồn điểm và wrongQuestions hiện có. Chưa commit, push hoặc deploy.

Bộ bảy ảnh kết quả người dùng gửi trước đó chỉ chứa danh sách câu, không có điểm nguồn. Cần một ảnh tổng kết có L/R hoặc tổng để xác minh vision thật sau khi chạy bản backend mới. Không gọi thêm OpenAI thật trong đợt sửa này.

Định dạng nullable/required của output schema đối chiếu [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
