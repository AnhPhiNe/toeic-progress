# Bộ quy chuẩn Mầm

Nguồn chuẩn cho mọi màn hình của TOEIC Progress. Bản trực quan: `design/previews/design-system.html` (có nút Sáng/Tối và cột tương phản tính trực tiếp). Căn cứ chọn lựa: `design/design-references.md`.

Nguyên tắc: mọi màu, bo góc, cỡ chữ lấy từ token ở đây. Không đặt giá trị riêng trong từng màn.

## 1. Ý tưởng

App giúp sinh viên thấy mình mất điểm ở đâu và ôn lại đúng chỗ đó. Linh vật Mầm là chậu đất nung có mặt, cây trong chậu lớn dần theo điểm cao nhất đã đạt. Từ đó:

- **Xanh Mầm** là màu hành động chính (tăng trưởng).
- **Vàng nắng** là màu của phần điểm vừa tăng và ăn mừng.
- **Đất nung chỉ thuộc về linh vật**, không dùng cho giao diện.
- Nền trung tính hơi lạnh, không dùng kem.

## 2. Màu gốc

| Nhóm | 10 | 20 | 30 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|
| green | #F1F8EE | #DCEFD3 | #B9DFAA | #6DBE6A | #4FA65A | #387F48 | #2B6638 | #1D4526 |

| Nhóm | Các nấc |
|---|---|
| gray | 0 #FFFFFF · 5 #F6F8F7 · 10 #EEF1F0 · 20 #DFE4E2 · 40 #878F8C · 60 #5F6966 · 80 #3A4240 · 90 #232927 · 95 #171B1A · 98 #101312 |
| sun | 20 #FFF3D3 · 50 #F2B93B · 70 #B7850F · 80 #6F4F05 |
| red | 20 #FDE3E5 · 50 #C93C4B · 70 #B42F3E |
| indigo (Listening) | 20 #E7E7FB · 60 #5B5BD6 · 80 #3A3A9E |
| teal (Reading) | 20 #DDF2EE · 60 #2E8F7E · 80 #1F6457 |

## 3. Token theo vai trò

Tên theo dạng `lớp-ngữ cảnh`, học từ cách Khan Academy tổ chức (nền, viền, chữ, bóng × vai trò).

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| bg-base | gray-5 | gray-98 | Nền trang |
| bg-surface | gray-0 | gray-95 | Thẻ, hộp thoại, danh sách |
| bg-subtle | gray-10 | #212825 | Khối phụ trong thẻ, chip thường |
| bg-action | green-70 | green-50 | Nút chính, thanh tiến độ |
| bg-action-subtle | green-20 | #1F3424 | Mục đang chọn, chip đang chọn |
| bg-overlay | đen 45% | đen 60% | Lớp phủ sau hộp thoại |
| border-default | gray-20 | #2C3431 | Đường kẻ, viền thẻ |
| border-strong | gray-40 | #66716C | Viền ô nhập, nút phụ |
| border-action | green-70 | green-50 | Ô nhập đang chọn |
| fg-default | gray-90 | #E8EDEA | Chữ chính |
| fg-muted | gray-60 | #A3ADA8 | Chữ phụ, chú thích |
| fg-on-action | trắng | #0E1A10 | Chữ trên nút chính |
| fg-action | green-80 | #8FD486 | Liên kết, nút nhẹ |
| fg-disabled | gray-40 | #56605B | Chữ vô hiệu |

**Miền học tập**

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| learn-wrong-bg / -fg | red-50 / trắng | #E86A76 / #1A0A0C | Ô câu sai |
| learn-wrong-soft / -text | red-20 / red-70 | #3A1E22 / #F2A2AA | Nền và chữ báo lỗi |
| learn-unsure-bg / -fg | sun-50 / gray-95 | sun-50 / #1A1404 | Ô AI chưa chắc |
| learn-unsure-soft / -text | sun-20 / sun-80 | #3A3014 / #F5CF77 | Khối hỏi lại |
| learn-correct-soft / -text | green-20 / green-80 | #1F3424 / #8FD486 | Đúng, đã thuộc |
| learn-lis / -soft / -text | indigo-60 / -20 / -80 | #8C8CF0 / #25254A / #B9B9F7 | Listening, Part 1–4 |
| learn-rea / -soft / -text | teal-60 / -20 / -80 | #4FC1AC / #16332E / #8ADBCB | Reading, Part 5–7 |
| learn-gain | sun-50 | sun-50 | Phần điểm vừa tăng |

**Tương phản (đã kiểm tra trên trang, cả hai chế độ đều đạt):** chữ thường ≥ 4,5:1, viền và chữ lớn ≥ 3:1. Ví dụ chế độ sáng: chữ chính 14,8:1; chữ phụ 5,7:1; chữ trên nút chính 4,9:1; số trên ô câu sai 5,0:1; viền ô nhập 3,3:1.

## 4. Chữ

- **Hiển thị:** Nunito 800–900. Dùng cho tiêu đề, con số điểm, tên màn.
- **Nội dung:** Be Vietnam Pro 400–700. Dùng cho mọi chữ còn lại.
- Cả hai có đủ dấu tiếng Việt (bảng Google Fonts có tập `vietnamese`).

| Vai trò | Font | Cỡ / độ đậm |
|---|---|---|
| score | Nunito | 56 / 900 (thẻ nhỏ 44) |
| title | Nunito | 28 / 900 |
| heading | Nunito | 20 / 800 |
| body | Be Vietnam Pro | 15 / 400 |
| label | Be Vietnam Pro | 13,5 / 600 |
| caption | Be Vietnam Pro | 12,5 / 500 |

Không viết hoa toàn bộ cho nhãn, kể cả tên nhóm trên sidebar.

## 5. Hình khối và độ nổi

| Thành phần | Bo góc |
|---|---|
| Ô câu hỏi | 6px |
| Ô nhập | 12px |
| Nút | 14px |
| Thẻ | 18px |
| Hộp thoại | 28px |
| Chip | tròn hẳn |

- **Danh sách:** phẳng, chỉ có đường kẻ `border-default`.
- **Thẻ:** viền mảnh `border-default`, không bóng.
- **Hộp thoại:** bóng `shadow-dialog`, bo lớn nhất.
- **Nút chính:** bậc bóng đặc 5px màu `shadow-action`; khi bấm lún xuống 3px.
- Không lồng thẻ trong thẻ; khối phụ bên trong thẻ dùng `bg-subtle`, không viền.

## 6. Thành phần

- **Nút:** chính (một nút mỗi màn), phụ (viền `border-strong`), nhẹ (chữ `fg-action`, không nền), vô hiệu (`bg-subtle`, `fg-disabled`).
- **Chip:** `bg-subtle`; đang chọn `bg-action-subtle` + `fg-action`.
- **Ô nhập:** viền `border-default`; đang chọn viền `border-action` + vòng `bg-action-subtle` 3px; lỗi viền `learn-wrong-bg` + dòng `learn-wrong-text` ngay dưới.
- **Ô câu hỏi:** trắng có số; sai `learn-wrong-*`; chưa chắc `learn-unsure-*`.
- **Nhãn Part:** P1–P4 `learn-lis-soft/-text`, P5–P7 `learn-rea-soft/-text`.
- **Điều hướng:** mục đang chọn `bg-action-subtle` + `fg-action` đậm; tên nhóm chữ thường `fg-muted`.
- **Màn trống:** Mầm + một câu nói rõ việc + một nút chính.

## 7. Chuyển động

- Một khoảnh khắc lớn duy nhất: ăn mừng ở màn kết quả.
- Còn lại: phản hồi khi bấm (≤150ms), chuyển trạng thái ô câu hỏi, mở hộp thoại.
- Tôn trọng `prefers-reduced-motion`.

## 8. Chữ viết trong giao diện

- Nút nói đúng việc sẽ xảy ra: "Lưu và xem kết quả", "Ghi chi tiết 5 câu sai".
- Chỉ nêu số liệu có trong dữ liệu; không chúc mừng khi kết quả đi xuống.

## 9. Không dùng

Nhãn chữ hoa nhỏ trên mọi khối; chuỗi "A · B · C"; viền màu dày một bên thẻ; gradient trang trí, chữ gradient, kính mờ; thẻ lồng thẻ; mọi khối cùng bo góc và bóng; emoji làm biểu tượng điều hướng; câu chung chung; số liệu không có thật; màu đất nung ngoài linh vật; màu đặt tay trong từng màn; hơn một nút chính trên một màn.

## 10. Rà soát trước khi duyệt một màn

1. Mọi màu là token ở mục 3?
2. Chỉ một nút chính?
3. Bo góc và độ nổi đúng vai trò ở mục 5?
4. Không có mục nào ở mục 9?
5. Đã xem cả chế độ sáng và tối, và ở bề rộng 375px?
