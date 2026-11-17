# Linh vật Mầm — bản mô tả và prompt

Dùng để tạo ảnh bằng Adobe Firefly (firefly.adobe.com), ChatGPT, Gemini, Midjourney, hoặc đưa cho họa sĩ.
Bản phác bằng code để tham khảo hình dạng: `design/previews/preview-mascot-mam.html` (cách B).

## 1. Nhân vật

- **Là gì:** một chậu đất nung nhỏ có khuôn mặt, trong chậu có một cây mầm. Chậu là "người", cây là "tiến độ".
- **Tính cách:** chăm chỉ, ấm áp, hay động viên; vui thật lòng khi bạn tiến bộ, bình tĩnh và an ủi khi điểm giảm. Không bao giờ chê.
- **Tỉ lệ:** chibi, chậu tròn trịa, hơi phình ở giữa; mặt chiếm khoảng nửa thân chậu; tay chân ngắn, tròn.
- **Mặt:** mắt to tròn màu nâu đen có 2 đốm sáng, má hồng, miệng nhỏ. Không có mũi.
- **Tránh:** lá mọc trên đầu một con vật (giống Mochi), ong/robot (giống Prep), cú xanh (giống Duolingo), viền đen dày, kiểu anime.

## 2. Màu

| Vai trò | Màu |
|---|---|
| Chậu | cam đất nung `#EE8B62`, viền chậu `#E8794F` |
| Đất | nâu `#6E4B30` |
| Lá | xanh lá tươi `#7BC86C` → `#3F9450` |
| Hoa (giai đoạn cuối) | vàng `#FFD36B`, nhụy `#F29E4C` |
| Má | hồng san hô `#FF8F80` |
| Màu chính của app | xanh lá `#3E8A4F`, nền `#EEF6EA` |

## 3. Những ảnh cần có

**Nét mặt / tư thế (cây ở giai đoạn "Ra lá"):**
1. Chào — một tay vẫy, cười.
2. Ăn mừng — hai tay dang, mắt cười híp, vài đốm lấp lánh.
3. An ủi — tay đặt trước ngực, mỉm cười nhẹ, mắt mở.
4. Suy nghĩ — một tay chống cằm (dùng khi đang tải, đang phân tích).
5. Ngủ — mắt nhắm, chữ "z" nhỏ (dùng cho màn trống).

**Bốn giai đoạn lớn dần (cùng một chậu, nét mặt vui):**
1. Nảy mầm — một cọng nhỏ, một lá non.
2. Ra lá — hai lá.
3. Xum xuê — thân cao, bốn lá.
4. Nở hoa — hoa vàng trên ngọn, chậu quấn ruy băng vàng.

**Kỹ thuật:** nền trong suốt (hoặc nền trắng để xoá nền sau), khung vuông, nhân vật ở giữa, ít nhất 1024×1024. Cùng góc nhìn chính diện, cùng ánh sáng cho mọi ảnh.

## 4. Prompt (tiếng Anh cho kết quả tốt nhất)

### Prompt gốc — tạo bộ nhân vật (character sheet)

```
Character design sheet of an original cute mascot: a small round terracotta flower pot with a friendly face, a tiny green sprout with two leaves growing from the soil inside. Chibi proportions, chubby rounded pot, short stubby arms and feet. Big glossy dark-brown eyes with two white highlights, rosy coral cheeks, small smile, no nose. Soft 3D vinyl-toy style, smooth matte clay texture, gentle studio lighting, soft shadows, no black outlines. Colors: terracotta orange pot (#EE8B62), dark brown soil, fresh green leaves (#7BC86C to #3F9450). Front view, plus five poses in a row: waving hello, celebrating with both arms up and sparkles, calm comforting smile with hand on chest, thinking with hand on chin, sleeping with closed eyes. Plain white background, consistent character across all poses.
```

### Prompt từng ảnh (đổi phần trong ngoặc vuông)

```
Original cute mascot: a small round terracotta flower pot with a friendly face and a tiny green sprout growing from its soil. Chibi proportions, short stubby arms and feet, big glossy dark-brown eyes with white highlights, rosy coral cheeks, no nose. Soft 3D vinyl-toy style, smooth matte clay texture, soft studio lighting, no outlines. [POSE: celebrating with both arms raised, eyes closed happily, small yellow sparkles around]. [STAGE: the sprout has two leaves]. Centered, front view, plain white background, square.
```

Gợi ý thay `[POSE]`:
- `waving hello with one hand, cheerful smile`
- `calm gentle smile, eyes open, one hand on its chest, comforting`
- `thinking, one hand on chin, eyes looking up`
- `sleeping peacefully, eyes closed, a small "z" floating above`

Gợi ý thay `[STAGE]`:
- `a single tiny stem with one small new leaf`
- `the sprout has two leaves`
- `a taller stem with four lush leaves`
- `a taller stem with two leaves and a yellow five-petal flower blooming on top; a yellow ribbon tied around the pot`

### Phương án động vật (nếu muốn so sánh)

```
Original cute mascot: a baby hedgehog with soft cream face and light brown rounded spines, hugging a small terracotta flower pot with a green sprout. Chibi proportions, big glossy eyes with white highlights, rosy cheeks. Soft 3D vinyl-toy style, matte clay texture, soft studio lighting, no outlines. Front view, plain white background, square.
```

## 5. Sau khi có ảnh

1. Chọn 1 ảnh ưng nhất làm "bản gốc", dùng nó làm ảnh tham chiếu (style/character reference) khi tạo các tư thế khác để giữ nhân vật đồng nhất.
2. Đưa ảnh vào đây: xoá nền và chuyển sang SVG (qua Adobe), nén cho web, rồi ghép vào mockup.
3. Nếu dùng lâu dài: nhờ họa sĩ vẽ lại bản cuối dựa trên ảnh đã chọn, để có file gốc chỉnh được và quyền sử dụng rõ ràng.
