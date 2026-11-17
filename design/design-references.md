# Tham khảo trước khi làm bộ quy chuẩn thiết kế

Ngày 05/11/2026. Mục đích: chọn hướng màu, chữ, hình khối và thành phần dùng chung có căn cứ, tránh "AI slop" (những lựa chọn mặc định không ai thật sự quyết định).

## 1. Nguồn đã xem

| Nguồn | Loại | Lấy gì |
|---|---|---|
| Study4, Prep, Mochi (đã dùng thử thật, xem `memory: competitor-ux-findings`) | Sản phẩm cùng lĩnh vực | Luồng học, phản hồi khi sai, màn trống, linh vật |
| Duolingo — hướng dẫn minh hoạ và bài "Shape language" | Bộ quy chuẩn chính thức (một phần) | Hình khối tròn, ít chi tiết, màu nền sáng làm nền cho linh vật |
| Khan Academy — Wonder Blocks và bài viết dựng lại hệ màu | Bộ quy chuẩn chính thức | Cách tổ chức token màu theo vai trò, kiểm tra tương phản |
| Các bài về AI slop (capitalandcompute, 925studios, noqta) | Bài viết chuyên môn | Danh sách "dấu hiệu" và cách sửa |
| Skill `ui-ux-pro-max` | Dữ liệu thiết kế có sẵn | Danh sách font có hỗ trợ tiếng Việt, hướng dẫn UX |

## 2. Bài học rút ra

**Duolingo (hình khối và linh vật)**
- Mọi hình đều bo tròn; hình nhọn bị coi là lạc phong cách.
- Nhân vật dựng từ ít hình đơn giản; quá ít thì trừu tượng, quá nhiều thì rối. Nhịp điệu giữa các hình làm nên cá tính.
- Nền sáng, thoáng để linh vật và nội dung chính nổi lên. Màu chữ chính là một màu xám đậm riêng, không phải đen tuyền.

**Khan Academy (cách tổ chức màu)**
- Hai tầng: bảng màu gốc theo độ sáng 0–100, và token theo vai trò.
- Token đặt tên theo: miền → lớp → ngữ cảnh → cường độ. Lớp gồm nền, viền, chữ/biểu tượng, đổ bóng. Ngữ cảnh gồm cơ bản, hành động chính, trung tính, vô hiệu, thành công, cảnh báo, nguy hiểm, lớp phủ.
- Có miền riêng cho học tập (đúng, sai, tiến độ).
- Tính tương phản cho mọi cặp màu ngay từ đầu (4,5:1 cho chữ thường, 3:1 cho chữ lớn và đường viền).
- Đặt tên rõ ràng giúp làm chế độ tối chỉ trong vài ngày.

**Các dấu hiệu AI slop cần tránh**
- Chỉ dùng một font mặc định (Inter, Roboto…), không có font hiển thị riêng.
- Gradient tím xanh, chữ gradient.
- Thẻ nào cũng cùng bo góc, cùng bóng; thẻ lồng thẻ; dashboard là lưới ô đều nhau.
- Viền màu dày một bên của thẻ bo tròn.
- Kính mờ, phát sáng không có lý do.
- **Đời thứ hai (xuất hiện khi người ta né đời thứ nhất):** nền kem + điểm nhấn đất nung; nhãn chữ hoa nhỏ phía trên mọi khối; chuỗi "A · B · C"; mũi tên ở mọi liên kết; đánh số 01/02/03 không cần thiết; tô màu một chữ trong tiêu đề.
- Cách sửa chung: rút màu, chữ, bố cục từ chính sản phẩm; viết hướng thiết kế ra một file và mọi màn đều theo đó; rà soát trước khi ra mắt.

## 3. Tự soi các mockup đã làm

| Điểm trong mockup hiện tại | Vấn đề | Hướng sửa |
|---|---|---|
| Nhãn chữ hoa nhỏ: "SAI NHIỀU NHẤT Ở", "ĐIỂM ƯỚC TÍNH", "HỌC / LUYỆN ĐỀ / TIẾN BỘ" | Dấu hiệu đời thứ hai | Dùng tiêu đề chữ thường, cỡ và độ đậm khác nhau |
| Chuỗi "ETS 2024 Test 06 · hôm nay", "Đoạn đơn · đoạn kép" | Dấu hiệu đời thứ hai | Viết thành câu hoặc tách dòng có nghĩa |
| Nền kem/xanh rất nhạt + chậu đất nung | Gần đúng combo "nền kem + đất nung" | Màu đất nung **chỉ** ở linh vật. Giao diện dùng trung tính xám lạnh nhẹ + xanh Mầm |
| Gần như mọi khối bo 16–28px, cùng kiểu bóng | Thẻ đồng dạng | Bo góc và độ nổi khác nhau theo vai trò |
| Chỉ dùng Plus Jakarta Sans | Một font cho mọi thứ | Thêm một font hiển thị cho tiêu đề và con số lớn |
| Màu sai đỏ/san hô, chưa chắc vàng, đúng xám… đặt tay từng màn | Màu chưa có vai trò cố định | Token học tập: đúng, sai, chưa chắc, Listening, Reading |

## 4. Hướng đề xuất cho bộ quy chuẩn

**Màu: rút ra từ sản phẩm**
- Ý tưởng gốc là "mầm lớn lên theo điểm". Màu chính là **xanh Mầm** (tăng trưởng). Màu nhấn là **vàng nắng** (phần điểm vừa tăng, ăn mừng).
- Nền và bề mặt dùng **trung tính hơi lạnh** (xám rất nhạt), không dùng kem. Đất nung chỉ thuộc về linh vật.
- Hai tầng như Khan: bảng gốc 0–100, rồi token theo vai trò (nền, viền, chữ, bóng × cơ bản, hành động, trung tính, vô hiệu, thành công, cảnh báo, nguy hiểm, lớp phủ).
- Miền học tập riêng: câu đúng, câu sai, AI chưa chắc, Listening, Reading, đến hạn ôn.
- Kiểm tra tương phản mọi cặp ở cả chế độ sáng và tối.

**Chữ: một font hiển thị + một font nội dung, đều có tiếng Việt**
- Ứng viên font hiển thị: **Nunito** (tròn, thân thiện, hợp hình khối Mầm; dùng cho tiêu đề và con số điểm).
- Ứng viên font nội dung: **Be Vietnam Pro** (thiết kế cho dấu tiếng Việt) hoặc giữ **Plus Jakarta Sans**.
- Không dùng: DM Sans (không có tiếng Việt), Comic Neue, Baloo (quá trẻ con cho sinh viên).
- Cần thử thực tế với chữ có nhiều dấu: "Mất điểm nhiều nhất ở Phần đọc hiểu".

**Hình khối**
- Bo tròn theo vai trò: chip tròn hẳn, nút ~14px, thẻ ~18px, hộp thoại ~28px, ô lưới câu hỏi ~6px.
- Độ nổi theo vai trò: nội dung phẳng, thẻ có viền mảnh, hộp thoại có bóng, nút chính có "bậc" bóng đặc như đang dùng.

**Chuyển động**
- Chỉ một khoảnh khắc lớn: ăn mừng ở màn kết quả. Còn lại là phản hồi nhỏ khi bấm, chạm ô, lưu.
- Tôn trọng "giảm chuyển động" của hệ điều hành.

**Chữ viết trong giao diện**
- Nói đúng việc nút làm ("Lưu và xem kết quả"), không dùng câu chung chung, không bịa số liệu.

**Quy trình**
- Hướng thiết kế viết thành `design/DESIGN.md`; mọi màn mới đối chiếu với file đó và danh sách dấu hiệu ở mục 2 trước khi duyệt.

## 5. Nguồn
- Duolingo, hướng dẫn minh hoạ: https://design.duolingo.com/illustration
- Duolingo, "Shape language": https://blog.duolingo.com/shape-language-duolingos-art-style/
- Khan Academy, dựng lại hệ màu: https://blog.khanacademy.org/how-we-rebuilt-khan-academys-color-system-from-the-ground-up
- Khan Academy, Wonder Blocks: https://www.github.com/Khan/wonder-blocks
- How to Fix AI Slop in Web Design: https://capitalandcompute.net/blog/fix-ai-slop-design/
- AI Slop Web Design guide: https://www.925studios.co/blog/ai-slop-web-design-guide
- AI design slop, overused UI patterns: https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026
