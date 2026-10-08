# ĐẶC TẢ SẢN PHẨM — TOEIC PROGRESS

**Phiên bản 2.14** · Cập nhật 2026-10-08 · Thay thế toàn bộ SPEC v1
> Cập nhật kiến trúc dữ liệu 2026-10-06: lưu trữ server chuyển sang bảng nghiệp vụ có cột kiểu riêng, xem mục 6.4.

> **Phạm vi v2.14:** Sổ tay và modal nhập lỗi theo bản phác thảo người dùng duyệt ngày 08/10/2026 (mục 4.6), cùng hợp đồng dữ liệu/AI liên quan (mục 6.2, 6.5), đã triển khai và kiểm thử local trên nhánh `stabilize-data-and-ai`. Đã thử prompt/provider OpenAI thật với 11 câu/ca biên và 6 lượt bổ sung sau chỉnh prompt/schema, kết quả và giới hạn đánh giá ở `AI_READING_EVAL.md`; OAuth/quota app/đồng bộ/backup trên staging chưa kiểm chứng. Các phân hệ khác chưa được chốt lại trong đợt này; những mô tả/trạng thái cũ của chúng cần đối chiếu riêng trước khi dùng làm yêu cầu triển khai.

> **v2 khác v1 ở đâu:** v1 được viết trước khi code. Sau ba đợt phát triển, một số phần đã lệch thực tế, hai tính năng được xây mà không hề có trong spec, và spec tự mâu thuẫn với chính nó ở chỗ Spaced Repetition. v2 viết lại theo đúng những gì tồn tại và những gì đã quyết định, đồng thời bổ sung **nguyên tắc lọc tính năng** — thứ v1 không có, và là lý do những tính năng lạc đề lọt được vào sản phẩm.
>
> **v2.1 bổ sung:** hai chức năng mới (Kế Hoạch, Phiên Ôn Tập), kiến trúc điều hướng được dọn lại để mọi mục đều là chức năng thật, và mục 1.4 ghi rõ bốn thứ sản phẩm làm được mà các web luyện đề bên ngoài không làm được.
>
> **v2.2 sửa một sai lầm của chính v2.1:** mục 4.1 từng yêu cầu Tổng Quan đổi vai thành "bảng lệnh hôm nay". Đã xây, đã gỡ bỏ — nó phá bố cục hai cột và lặp lại thông tin các thẻ bên cạnh đã có. Nguyên tắc ở mục 1.4 cũng được siết lại cho đúng: sản phẩm phải trả lời "giờ tôi nên làm gì", nhưng không phải mọi màn hình đều gánh câu hỏi đó.

> **v2.3–2.4:** Tổng Quan dựng lại theo ảnh tham khảo người dùng đưa — dải bốn chỉ số, biểu đồ ghi số trên từng chấm, nhịp học, kỹ năng, buổi học gần đây. Thẻ "Hôm nay" và thẻ Mục tiêu dải mốc đã thử rồi gỡ (mục 4.1).

---

## 1. ĐỊNH VỊ SẢN PHẨM

### 1.1. Vấn đề

Chinh phục TOEIC ở vùng điểm cao đòi hỏi độ chính xác gần như tuyệt đối. Người tự học ở giai đoạn bứt phá gặp hai rào cản:

1. **Rào cản tâm lý.** Mất động lực, chuỗi học đứt quãng, điểm đi ngang nên không cảm nhận được tiến bộ.
2. **Thiếu chẩn đoán lỗi sâu.** Làm đề xong chỉ đếm tổng câu đúng, không biết mất điểm ở Part nào và vì nguyên nhân gì — bẫy paraphrase, ngữ pháp, tốc độ nghe, hay phân bổ thời gian sai.

Rào cản thứ hai là cái ít công cụ nào giải. Các web luyện đề chấm điểm rất tốt, nhưng dữ liệu chết ngay sau khi đóng tab, và không web nào biết bạn làm ETS hôm qua, Hacker tuần trước.

### 1.2. Định vị: sở hữu dữ liệu, không sở hữu nội dung

Đây là **lằn ranh quyết định mọi tính năng**:

| Sản phẩm **KHÔNG** làm | Sản phẩm **CÓ** làm |
| :--- | :--- |
| Cung cấp đề thi, câu hỏi | Ghi nhận kết quả từ **bất kỳ nguồn đề nào** |
| Ghi kết quả | Ước tính Raw → Scaled tham khảo hoặc nhập điểm từ kết quả đề |
| Bộ từ vựng, flashcard dựng sẵn | Theo dõi **số từ bạn đã học** như một chỉ số |
| Bài giảng, video, lý thuyết | Phân tích lỗi của **chính bạn** theo thời gian |
| Cộng đồng, bảng xếp hạng | Kỷ luật và nhịp độ cá nhân |

**Nội dung học là nghề của web khác — họ làm tốt hơn và đó là mô hình kinh doanh của họ.** Giá trị không thể thay thế của sản phẩm này nằm ở chỗ nó là nơi duy nhất có dữ liệu xuyên suốt nhiều nguồn đề, nhiều tháng, kèm phân loại nguyên nhân sai do chính người học ghi lại.

### 1.3. Nguyên tắc lọc tính năng

Trước khi thêm bất cứ thứ gì, hỏi đúng hai câu:

1. **Nó tạo ra nội dung học, hay xử lý dữ liệu của người học?** Tạo nội dung thì không làm.
2. **Nếu bỏ nó đi, người dùng có mất dữ liệu hay mất kỷ luật không?** Không mất gì thì nó là tính năng trang trí.

*Ví dụ áp dụng:* Bộ đếm nhịp làm bài (mục 4.3) thoạt nhìn giống công cụ "trong lúc làm bài" nên rất dễ bị loại nhầm. Nhưng nó không cung cấp nội dung — nó huấn luyện **kỷ luật phân bổ thời gian**, và gắn trực tiếp với nhóm lỗi `TIME_PRESSURE` trong Sổ tay. Nó thuộc vế phải của bảng trên.

### 1.4. Câu hỏi sản phẩm trả lời

| | Câu hỏi được trả lời |
| :--- | :--- |
| Các web luyện đề bên ngoài | *"Tôi vừa làm được bao nhiêu điểm?"* — điểm số, phần trăm, đúng sai. Hết. |
| Sản phẩm này **phải** trả lời | *"Vậy giờ tôi nên làm gì?"* |

**Sản phẩm** phải trả lời được câu hỏi thứ hai — nhưng không phải **mọi màn hình** đều phải tự mình trả lời nó.

*Đây là bản sửa sau một lần làm sai.* Bản trước viết "mọi màn hình phải kéo được về câu hỏi thứ hai", và hệ quả là Tổng Quan bị nhồi thêm một bảng việc cần làm, lặp lại đúng những gì các thẻ bên cạnh đã nói (xem hộp ghi chú ở mục 4.1). Nhồi câu trả lời vào khắp nơi không làm sản phẩm hữu ích hơn, chỉ tạo ra trùng lặp và phá bố cục.

Cách chia đúng: **Kế Hoạch** (mục 4.2) chịu trách nhiệm trả lời "giờ tôi nên làm gì". **Tổng Quan** tóm gọn "tôi đang ở đâu". Mỗi màn hình làm một việc và làm cho tốt.

Bốn năng lực sau là thứ các web bên ngoài **không làm được**, kể cả về nguyên tắc, vì chúng chỉ có dữ liệu của riêng chúng. Đây là trọng tâm phát triển:

1. **Chẩn đoán theo nguyên nhân, không theo Part.** Web ngoài nói "Part 3: 35/39". Sản phẩm này phải nói được "60% điểm mất đến từ bẫy paraphrase, rải đều Part 3, 4 và 7 — đây là lỗ hổng kỹ năng, không phải lỗ hổng Part". Phân Tích đã tổng hợp dữ liệu từ `MistakeEntry.category` và chỉ ước tính điểm mất khi đủ ngưỡng dữ liệu.
2. **Phát hiện tái phạm.** "Bạn đánh dấu bẫy đảo ngữ là đã thông suốt ba tuần trước, nhưng đề hôm nay lại sai đúng nhóm đó." Cần lịch sử lỗi xuyên nhiều nguồn đề và nhiều tháng — không web nào có.
3. **Đường cong mệt mỏi, thu thập tự động.** Bộ đếm nhịp đã biết mốc từng pha; chỉ cần ghi lại pha nào vượt giờ là có dữ liệu thật cho `TIME_PRESSURE` mà người dùng không phải gõ gì.
4. **Xếp ưu tiên theo lợi ích thu được.** "Sửa bẫy từ vựng Part 7 ước tính +25đ; sửa tốc độ Part 5 được +8đ — làm cái đầu trước." Đây chính là câu trả lời cho mục 1.4.

---

## 2. NGƯỜI DÙNG & ĐÒN BẨY TÂM LÝ

### 2.1. Chân dung

- Người tự luyện đề độc lập từ các bộ chuẩn (ETS, Hacker, YBM...), trên web hoặc trên giấy.
- Cần một nơi ghi nhận, đo lường và phân tích hiệu suất theo thời gian.
- **Mục tiêu điểm là biến số, không phải hằng số.** Sản phẩm hiện phục vụ một người nhắm 990, nhưng mọi tính năng phải viết theo `profile.targetScore` để sau này mở rộng cho người nhắm 600–800 mà không phải viết lại.

### 2.2. Đòn bẩy tâm lý

| Cơ chế | Ứng dụng | Tác động |
| :--- | :--- | :--- |
| **Loss Aversion** | Streak ngọn lửa và khiên bảo vệ. Khiên lấp vào **đúng ngày bị lỡ**, giữ chuỗi nhưng không giả mạo "đã học hôm nay" | Giữ nhịp tối thiểu mỗi ngày |
| **Goal Gradient** | Đếm ngược ngày thi và nhịp điểm cần tăng mỗi tuần để kịp `targetScore` | Tăng tốc giai đoạn nước rút |
| **Status & Mastery** | Rank Tier bảy bậc theo thang TOEIC | Kích thích chinh phục nấc thang |
| **Cognitive Closure** | Sổ tay chuyển lỗi từ "Cần ôn lại" sang "Đã thông suốt" qua lịch ôn có giãn cách | Cảm giác kiểm soát lỗ hổng |

> **Rank Tier theo mục tiêu.** So trực tiếp điểm hiện tại với `targetScore` ở các ngưỡng Tân Binh <50%, Đồng 50%, Bạc 70%, Vàng 85%, Bạch Kim 92%, Kim Cương 97%, Đại Sư 100%. Không làm tròn tỷ lệ trước khi xếp bậc. Với mục tiêu 990, các điểm TOEIC đầu tiên chạm từng bậc là 495/695/845/915/965/990. Tên bậc không chứa số điểm; bậc cao nhất là “Đại Sư — Chạm Mục Tiêu”.

---

## 3. KIẾN TRÚC THÔNG TIN

### 3.1. Vấn đề của kiến trúc cũ *(đã xử lý)*

Sidebar từng có tám dòng, nhưng chỉ bốn dòng rưỡi là chức năng thật:

| Dòng hiện tại | Thực chất |
| :--- | :--- |
| Tổng Quan | Chức năng thật |
| Phân Tích Điểm Số | Chức năng thật |
| Phòng Thi ETS | Chức năng thật |
| Tài Liệu & Quy Đổi | Chức năng thật |
| Sổ Tay Bắt Bẫy | Nửa vời — là danh sách để xem, **không có hành động ôn** |
| Lộ Trình S&W | Trang tĩnh, không nối dữ liệu |
| **Kế Hoạch & Mục Tiêu** | **Tên đúng, ruột rỗng** — bấm vào chỉ mở modal Cài Đặt |
| **Sao Lưu & Dữ Liệu** | Tiện ích, không phải chức năng — cũng mở modal Cài Đặt |

Hai dòng cuối không phải là lỗi cẩu thả. *"Kế Hoạch & Mục Tiêu"* là cái tên đúng cho một chức năng đáng tồn tại nhưng chưa ai xây — sidebar đang tự gọi tên chỗ còn thiếu.

### 3.2. Kiến trúc hiện tại

```
HỌC TẬP
  1. Tổng Quan        Tóm gọn: điểm, streak, mục tiêu
  2. Kế Hoạch         Việc cần làm và mục tiêu
  3. Phòng Thi        Bộ đếm nhịp, có lưu dữ liệu

THEO DÕI
  4. Phân Tích        Chẩn đoán nguyên nhân, xếp ưu tiên
  5. Sổ Tay Lỗi Sai   Ghi lỗi và ôn tập
  6. Tài Liệu         Quy đổi · Chứng chỉ · Chiến thuật · Lộ trình S&W

──────────────────────────────────────────
  Hồ sơ học viên → Cài đặt, sao lưu và dữ liệu mẫu
  (một lối vào ở đáy sidebar; Cài đặt cũng có ở header)

(Modal) Nhập Điểm   Full Test · Luyện Part lẻ · Từ vựng · Ghi nhanh lỗi sai
```

Sáu mục điều hướng, **cả sáu đều là chức năng thật**. Nhãn trong sidebar được rút gọn để dễ quét; tên đầy đủ vẫn dùng cho nhãn truy cập. Hồ sơ ở đáy mở Cài đặt, nơi chứa sao lưu và dữ liệu mẫu.

**Những thay đổi đã thực hiện:**

- Thêm **Kế Hoạch** (mục 4.2) và **Phiên Ôn Tập** bên trong Sổ Tay (mục 4.6).
- `Lộ Trình S&W` gộp vào Tài Liệu.
- `Kế Hoạch & Mục Tiêu` trở thành màn Kế Hoạch; sao lưu và dữ liệu mẫu ở trong Cài đặt, truy cập qua hồ sơ ở đáy sidebar hoặc nút header.
- `Phòng Thi ETS` giữ nguyên vị trí điều hướng nhưng bắt đầu lưu dữ liệu (mục 4.3).

---

## 4. ĐẶC TẢ TỪNG PHÂN HỆ

### 4.1. Tổng Quan (Dashboard)

**Vai trò: tóm gọn và trực quan.** Màn hình mở đầu trả lời trong vài giây câu hỏi "tôi đang ở đâu". Việc cần làm thuộc về Kế Hoạch (mục 4.2) và Sổ Tay (mục 4.6), không nằm ở đây.

Bố cục (v2.4):

```
  Mỗi ngày, gần mục tiêu hơn.                      Thứ Tư, 23 tháng 9
┌─ ⚠ Tái phạm (một dòng, thu gọn) ─────────────────────────┐
├─ CỘT TRÁI (8/12) ──────────────┬─ CỘT PHẢI (4/12) ───────┤
│  Gần nhất│Tiến bộ│Mục tiêu│Chuỗi│  Chuỗi Ngày Học         │
│  (một thẻ, bốn ô ngăn vạch)    ├─────────────────────────┤
│  Biểu đồ tiến bộ (giãn)        │  Kỹ năng hiện tại (L/R) │
└────────────────────────────────┴─────────────────────────┘
  footer ── cả đáy hai cột LẪN footer nằm trong màn hình (≥ 1280px)
```

- **Dải chỉ số:** một thẻ, bốn ô — điểm gần nhất, tiến bộ, mục tiêu, chuỗi học. Mỗi ô: ô icon tô màu + nhãn, con số lớn cùng màu, và một **nhãn màu** thay cho dòng chữ xám (tên đề · "825 → 960" · "Còn 30 điểm" · "Chưa học hôm nay"). Màu: xanh dương, xanh lá (đỏ khi giảm), hồng, hổ phách. Không số nào để đen.
- **Biểu đồ tiến bộ:** điểm tổng theo thời gian, **ghi số điểm trên từng chấm**, chấm mới nhất tô đặc, đường mục tiêu có nhãn nằm phía trên đường. Trần trục là `targetScore`. "Lần đầu" loại các lượt làm lại vì điểm làm lại bị thổi phồng do nhớ đáp án. Không dùng hiệu ứng vẽ đường: Recharts chỉ vẽ chấm sau khi hiệu ứng xong, và hiệu ứng có lúc không bao giờ xong.
- **Chuỗi Ngày Học:** giữ nguyên thẻ và lưới bảy ô đã chốt. Một ngày được tính là đã học khi có buổi học hoặc ghi từ vựng với `count > 0`; ngày dùng khiên chỉ nối chuỗi, không được hiển thị là đã học. `currentStreak` được tính lại từ các ngày nguồn, không làm nguồn dữ liệu gốc.
- **Kỹ năng hiện tại** (theo mẫu người dùng đưa): L/R từ bài Full Test **gần nhất** — nhãn, điểm / 495, %, thanh. Màu thanh là danh tính kỹ năng — Listening **chàm** (`indigo-600`), Reading **xanh ngọc** (`teal-600`), người dùng chọn theo mẫu — không đổi theo trạng thái. Một dòng gợi ý: "Còn X điểm ở Reading để chạm mục tiêu." *(Độ chính xác từng Part đã thử đặt ở đây và gỡ — trùng với Phân Tích. Chênh lệch từng kỹ năng so với đề trước cũng gỡ cùng.)*
- **Mọi con số tính theo `targetScore`, không phải 990.**

**Quy tắc trình bày:**
- Mọi thẻ (trừ Chuỗi Ngày Học) chung **một** bề mặt: nền trắng, viền `slate-200`, bóng nhẹ. Thẻ tách khỏi trang nhờ nền trang `#EAEFF5` đậm hơn, không nhờ tô màu thẻ. *(Đã thử mỗi thẻ một tông nền — bị chê chói và rời rạc. Đừng quay lại.)*
- Màu chỉ mang nghĩa, mỗi màu **một** việc: xanh dương = điểm / biểu đồ / hành động chính · xanh lá / đỏ = tăng / giảm · hồng = mục tiêu · hổ phách = chuỗi học · chàm = Listening · xanh ngọc = Reading. Chàm↔xanh ngọc cách nhau ΔE 27 (mù màu đỏ-lục: 22). **Đánh đổi đã biết, người dùng chấp nhận:** xanh ngọc gần xanh lá "tăng" (ΔE 4.9) và chàm gần xanh dương "điểm" (ΔE 6.7) — chúng nằm ở thẻ khác nhau và luôn có nhãn đi kèm. Bộ cyan/tím trước đó tách tốt hơn (mọi cặp ≥ 16) nhưng người dùng chọn màu theo mẫu.
- **Khớp màn hình (≥ 1280px):** lưới hai cột cao tối thiểu bằng khung nhìn trừ phần trên lưới, đệm dưới của `<main>` **và footer** (đo bằng JS, đo lại khi đổi cỡ cửa sổ hoặc khi cảnh báo tái phạm mở/đóng). Mép dưới hai thẻ và cả footer đều nằm trong màn hình khi vừa mở trang. Biểu đồ co giãn (tối thiểu 190px). Đã đo, footer chạm đúng đáy màn hình ở 730 / 768 / 900 / 1080px. Ở 700px hai thẻ vẫn trọn, footer lấn 22px. Dưới 440px chỗ trống thì thôi khớp.
- **Máy phóng to 125%** (màn 1600×900 → khung nhìn ~1280×730) là cỡ mục tiêu chính — người dùng dùng đúng cỡ này. Cột phải (Chuỗi Ngày Học + Kỹ năng) là thứ quyết định chiều cao tối thiểu, nên hai thẻ này giữ đệm `p-4` và khoảng cách hẹp.
- Dải chỉ số giữ gọn (~133px) để nhường chiều cao cho biểu đồ.
- Chữ nhỏ nhất 12px.

> **Đã thử và đã gỡ bỏ trên màn hình này:**
> - *Bảng lệnh hôm nay* (nhiều dòng việc) — phá bố cục, lặp số liệu của các thẻ khác.
> - *Thẻ "Hôm nay: ôn N lỗi sai"* — một việc, một nút; vẫn bị gỡ vì người dùng thấy rối. Lối vào phiên ôn nằm ở Sổ Tay và Kế Hoạch.
> - *Thẻ Mục tiêu với dải mốc Rank* — gỡ vì trùng với ô "Mục tiêu" trong dải chỉ số.
> - *Bảng "Buổi học gần đây"* — gỡ cho gọn; lịch sử đầy đủ ở Phân Tích.
> - *Độ chính xác từng Part trong thẻ Kỹ năng* — gỡ, trùng với Phân Tích.
>
> Đừng đề xuất lại. Muốn thêm gì vào Tổng Quan thì phải **thay thế** thứ đang có.

*Bỏ khỏi spec:* thanh XP tới cấp kế tiếp và châm ngôn ngẫu nhiên mỗi ngày — xem mục 7.

### 4.2. Kế Hoạch ★ chức năng mới

Câu trả lời có cấu trúc cho *"giờ tôi nên làm gì"*. Đây là chức năng lấp vào cái tên `Kế Hoạch & Mục Tiêu` đang rỗng ruột.

**Đầu vào — tất cả đã có sẵn:** `examDate`, `targetScore`, điểm hiện tại, điểm nghẽn theo nguyên nhân từ Sổ tay, nhịp tăng điểm thực tế.

**Đầu ra:**

```
Còn 45 ngày · cần +30đ · nhịp 5đ/tuần

Tuần này (3/7 ngày đã học)
  ☑ 1 Full Test            đã làm ETS Test 04
  ☐ 2 buổi Part 7          điểm nghẽn lớn nhất của bạn
  ☐ Ôn 12 thẻ đến hạn

Nhịp thực tế 8đ/tuần — đang đi trước kế hoạch.
```

- Sinh mục tiêu tuần từ khoảng cách điểm và số ngày còn lại.
- Ưu tiên việc theo lợi ích thu được (mục 1.4 điểm 4), không phải theo thứ tự Part.
- **Theo dõi kế hoạch so với thực tế.** Đây là thứ streak đơn thuần không tạo được: streak chỉ hỏi "hôm nay có học không", kế hoạch hỏi "có học đúng thứ cần học không".
- Khi lệch nhịp, đề xuất điều chỉnh thay vì chỉ báo đỏ.

**Vì sao web ngoài không làm được:** chúng không biết ngày thi của bạn, không biết bạn luyện từ mấy nguồn đề, và không có sổ tay lỗi nên không biết điểm nghẽn. Cả ba mảnh chỉ sản phẩm này có.

### 4.3. Phòng Thi — Bộ Đếm Nhịp Làm Bài (Pacing Trainer)

> *Tính năng này không có trong v1. Nó được xây ở đợt ba và v2 ghi nhận chính thức.*

Đây **không phải** đồng hồ đếm ngược thông thường — các web luyện đề đã có sẵn. Giá trị nằm ở **mốc nhịp theo từng Part kèm chiến thuật**, thứ các web đó không cung cấp:

- **Năm chế độ:** Full Test 120 phút · Sprint Reading 75 phút · Tốc độ phản xạ Part 5 trong 12 phút · Sức bền Part 7 trong 55 phút · Pomodoro 25 phút.
- Mỗi chế độ chia thành các pha gắn với khoảng câu hỏi cụ thể (ví dụ *Part 5, câu 101–130, 12 phút, tối đa 25–30 giây mỗi câu*), kèm lời nhắc chiến thuật riêng cho từng pha.
- **Phục vụ hai nhóm:** người luyện đề giấy từ sách, vốn không có timer sẵn; và người muốn tập riêng kỷ luật phân bổ thời gian.

**Đã lưu lượt Phòng Thi:** khi Nộp Bài, thời gian thật được truyền sang Nhập Điểm và các pha đã đánh dấu "xong pha" được lưu để phân tích. Tiếp tục dùng dữ liệu này cho:

1. Khi Nộp Bài, chuyển **thời gian thật đã dùng** sang form Nhập Điểm.
2. Ghi lại **pha nào vượt giờ và vượt bao nhiêu**, để dựng đường cong mệt mỏi (mục 1.4 điểm 3) mà người dùng không phải gõ thêm gì.

Chỉ hiển thị xu hướng vượt giờ khi có ít nhất ba lượt cùng chế độ đã bấm "xong pha"; dưới ngưỡng thì hướng dẫn người học thao tác.

### 4.4. Nhập Điểm (Session Logger — modal)

- **Full Test:** tên nguồn đề, ngày, thời gian làm; số câu đúng từng Part (Listening 6/25/39/30, Reading 30/16/54) để ước tính tham khảo. Có tùy chọn nhập điểm Listening/Reading hoặc chỉ tổng từ kết quả đề; điểm nhập được ưu tiên. Chi tiết Part không bắt buộc khi nhập điểm trực tiếp.
- **Luyện Part lẻ:** chọn Part, số câu làm, số câu đúng, thời gian. Vẫn tính vào streak. **Dữ liệu phải lưu có cấu trúc** (`practicePart`, `practiceCorrect`, `practiceTotal`), không nhét vào chuỗi `notes` như hiện tại — nếu không nó vĩnh viễn không vào được biểu đồ.
- **Từ vựng:** tab thứ ba trong form Nhập Điểm. Ghi riêng theo ngày (`vocabLog: {date, count}` với `count` là số nguyên dương), không gắn vào buổi học và không thêm mục điều hướng.
- **Ghi nhanh lỗi sai:** thêm câu sai thẳng vào Sổ tay ngay trong form, không phải chuyển trang.
- **Làm lại đề:** nhận diện tên đề trùng, đánh số lần làm, so sánh với lần trước và lần đầu.
- **Mặc định form để trống.** Điền sẵn điểm cao khiến một cú bấm nhầm ghi nhận kỷ lục giả.

#### Lịch sử luyện đề — bản duyệt 09/10/2026

- Giữ top bar hiện tại. Desktop dùng bảng; màn hình nhỏ chuyển thành danh sách với ngày, tên đề, kết quả và thao tác, không yêu cầu kéo ngang để xem/sửa.
- Tên đề là nút mở chi tiết, dùng được bằng bàn phím. Dòng phụ ghi lần làm/thời gian, giảm badge có khung màu. Tabs Tất cả/Full Test/Luyện Part giữ số bản ghi; tìm theo tên đề/ghi chú; bộ lọc Mọi lần làm/Lần đầu/Làm lại ẩn khi chỉ xem Luyện Part.
- Cột “So với bài trước” là chênh lệch tổng điểm với Full Test L&R có điểm liền trước theo ngày + thời gian tạo, kể cả khác đề; không gọi là xu hướng hay kết luận tiến bộ. Tooltip/nhãn truy cập ghi đề/ngày/điểm tham chiếu; lọc hoặc sắp xếp bảng không thay đổi mốc so sánh.
- Bài Luyện Part hiện tổng câu đúng/tổng số câu và tỷ lệ đúng; không lặp “Part lẻ” ở cột so sánh. Sắp xếp điểm giữ bản ghi chưa có điểm ở cuối thay vì coi là 0.
- Chuẩn hóa tên đề theo cùng NFKC/khoảng trắng/hoa thường với Sổ tay và form điểm. Lượt làm được nhóm theo loại bài/kỹ năng; bài Luyện Part không làm tăng lần làm Full Test. Giữ số lần đã ghi qua việc xóa bản ghi, xử lý số trùng/tên trống, không sửa dữ liệu điểm để tính metadata.
- Phân trang năm bài để bảng gọn và dễ thấy footer; nút Trước/Sau mở các bài còn lại. Tìm kiếm/lọc/sắp xếp áp dụng trên toàn bộ lịch sử. Xóa bản ghi cuối ở trang cuối phải hiển thị lại trang còn dữ liệu. Xóa cần xác nhận, hủy không ghi dữ liệu.
- Modal chi tiết có focus trap/Escape/trả focus và body cuộn riêng, header/footer không che nội dung. Hiện tổng/Listening/Reading hoặc kết quả luyện Part, nguồn điểm, từng Part; dữ liệu thiếu hiện “Chưa ghi”. Ghi chú và so với lần đầu của cùng đề thu gọn. Sửa kết quả dùng form hiện có.
- Modal gom số lỗi Sổ tay theo tên đề qua mọi lần làm, hỗ trợ liên kết sessionId cũ; tên nguồn được gỡ hoặc đổi rõ ràng phải được tôn trọng. Không gọi đây là lỗi riêng của lượt làm. Nút Mở Sổ tay mang cùng bộ lọc tên đề; bản ghi không có tên chỉ tính lỗi còn liên kết trực tiếp và không trộn mọi lỗi chưa gắn đề.
- Không thêm DB/API, bảng đề hay liên kết lượt làm mới trong đợt này.

### 4.5. Phân Tích (Analytics)

**Bản duyệt ngày 09/10/2026:** giữ top bar, hai thẻ biểu đồ cạnh nhau trên desktop và khối “Ưu tiên luyện tiếp” bên dưới. Thẻ dùng chung `CARD`; Listening chàm, Reading xanh ngọc. Trên màn hình hẹp, các thẻ xếp dọc.

- **Bộ chọn phạm vi có tìm kiếm:** mặc định “Đề gần nhất”; chọn một tên đề, “Tổng quan 5 lượt gần nhất”, hoặc “Tất cả”. Danh sách tên dùng chung từ lịch sử và Sổ tay, chuẩn hóa Unicode/khoảng trắng/hoa thường; không tạo danh mục đề hoặc liên kết lỗi tới lượt làm mới.
- **Theo một đề:** dùng kết quả Full Test L&R mới nhất của tên đề đó, kể cả làm lại. Hiện ngày kết quả; không lấy chi tiết Part hoặc điểm L/R của kết quả cũ để bù cho kết quả mới thiếu dữ liệu.
- **Tổng quan:** chọn năm lượt gần nhất hoặc toàn bộ Full Test L&R có kết quả, kể cả làm lại; loại bản ghi đã xóa. Số liệu Part chỉ tính lượt đủ số câu hợp lệ của cả bảy Part; điểm mỗi kỹ năng tính trung bình các điểm kỹ năng có ghi trong cùng phạm vi và ghi “TB”. Không tự điền 0 cho dữ liệu thiếu. Quy tắc first-attempt của Tổng Quan/Kế Hoạch không thay đổi.
- **Độ chính xác 7 Part:** biểu đồ cột từ 0–100%, nhãn phần trăm, chân cột vuông và đỉnh bo nhẹ. Tooltip hiện số câu đúng hoặc trung bình có phần thập phân, tránh hiển thị 6/6 bên cạnh tỷ lệ trung bình 92%. Ghi số lượt thực có chi tiết Part khi xem tổng quan.
- **Chuyển động biểu đồ:** cột mọc từ 0% trong 500ms; donut vẽ theo chiều kim đồng hồ từ vị trí 12 giờ trong 600ms. Khi đổi bộ lọc, các hình chuyển tới tỷ lệ mới trong 300ms, không quay cả donut hoặc lặp liên tục. Nhãn %, số tổng và tên nhóm lỗi đứng yên; màu nhóm lỗi giữ đúng danh tính khi tỷ lệ/thứ tự trong danh sách thay đổi. Hover sáng nhẹ. Tắt chuyển động biểu đồ khi `prefers-reduced-motion: reduce`, kể cả khi tùy chọn hệ thống đổi trong lúc đang xem trang.
- **Lỗi thường gặp trong Sổ tay:** donut lớn, màu cố định theo sáu nhóm nguyên nhân; tên lỗi và cột % cách 28px. Đếm các lỗi đã ghi của tên đề được chọn, gom qua mọi lần làm; tổng quan năm lượt gom lỗi của các tên đề trong cửa sổ, “Tất cả” gồm cả lỗi chưa gắn đề. Luôn ghi rõ đây là lỗi đã ghi, không phải toàn bộ câu sai khi thi; không hiển thị “độ phủ /7”.
- **Thiếu dữ liệu:** đề chỉ có ghi chú vẫn chọn được và xem được lỗi; phần điểm/Part hiện trạng thái chưa có dữ liệu cùng nút nhập kết quả.
- **Ưu tiên luyện tiếp:** chỉ nêu Part có tỷ lệ đúng thấp nhất và nhóm lỗi thường gặp nhất trong phạm vi; bỏ dự báo điểm “+30đ” và các kết luận tiến bộ không có dữ liệu. Nút Listening mở phiên tập trung; Reading mở bộ đếm đúng Part 5/6/7.
- **Mở Sổ tay:** mang bộ lọc tên đề/phạm vi đang chọn sang Sổ tay; người học vẫn đổi hoặc đặt lại bộ lọc được. Bộ lọc điều hướng tạm thời thuộc tài khoản hiện tại, không thay đổi dữ liệu lưu.
- Các phân tích kế hoạch, lịch sử và bộ đếm thời gian có màn hình riêng; trang này không bổ sung biểu đồ mới, DB/API hoặc liên kết bắt buộc tới từng lượt làm.

### 4.6. Sổ Tay Bẫy (Mistake Notebook)

#### Phạm vi và trạng thái

Sổ tay ghi lại câu người học đã làm sai từ nguồn đề bên ngoài, lựa chọn và cách nghĩ của họ, rồi hỗ trợ xem lại và ôn tập. **Mỗi lần nhập một câu**, có thể kèm đoạn văn liên quan của Part 6/7. Không nhập hàng loạt nhiều câu trong đợt này.

| Phần | Trạng thái ngày 08/10/2026 |
| :--- | :--- |
| Thêm/sửa/xóa thẻ, bộ lọc, giải thích có cấu trúc, một modal ôn chung | Đã có trên nhánh `stabilize-data-and-ai` |
| Modal nhập gọn hai bước, textarea lớn, bỏ checkbox gửi AI | Đã triển khai local theo bản duyệt; kiểm thử viewport 320/375/768/1024/1440px và zoom 125% |
| Tách phương án trên máy, lựa chọn/lý do thành trường riêng, lưu thẻ thiếu đáp án | Đã triển khai; kiểm thử dữ liệu giả từ input tới API, sync RPC, SQL extra và backup |
| Ngày ôn tương thích API/backup, chống ghi đè thẻ mới khi ôn, nhãn nguồn đáp án trong phiên ôn | Đã sửa và có test hồi quy local |
| Provider AI thật | Đã thử 11 request với prompt/schema/grounding hiện tại; còn điểm chất lượng dịch/độ gọn cần tinh chỉnh, xem `AI_READING_EVAL.md` |
| Auth/quota/CAPTCHA và đồng bộ nhiều thiết bị trên dịch vụ thật | Chưa kiểm chứng trong đợt này; đồng bộ để sau theo yêu cầu người dùng |

#### Một bản ghi và danh sách

- **Một bản ghi gồm:** Part, câu hỏi/ngữ cảnh, phương án gốc, trạng thái lựa chọn của người học, lý do chọn nếu có, đáp án và nguồn đáp án, giải thích/mẹo, nhóm nguyên nhân, tag, trạng thái và lịch ôn. Lý do người học là dữ liệu riêng; không dùng phần phân tích AI thay thế lời họ đã nhập.
- **Sáu nhóm nguyên nhân:** bẫy từ vựng và paraphrase · ngữ pháp nâng cao · tốc độ nghe và nối âm · áp lực thời gian · mất tập trung và đọc ẩu · khác.
- **Sửa được bản ghi:** giữ ID, ngày tạo, trạng thái và lịch ôn; không ghi đè lịch ôn mới từ thiết bị khác bằng bản chụp lúc mở form. Giữ nghĩa của phương án không đổi chữ. Nếu sửa câu hỏi/ngữ cảnh, đáp án hoặc phương án làm giải thích cũ không còn phù hợp, bỏ giải thích AI có cấu trúc và yêu cầu người học kiểm tra lại; giữ bản nháp trong form để họ chỉnh.
- **Bộ lọc:** ba tab Tất cả / Đến hạn / Thông suốt; phần mở từ nút **Lọc** xếp **Đề → Part → Nguyên nhân**, tìm kiếm hiện ngoài trên màn rộng. Đề có Tất cả đề / Chưa gắn đề / các tên nguồn có thẻ. Kết hợp các tiêu chí; badge Lọc đếm cả đề. Số thẻ ở ba tab tính trong phạm vi đề/Part/nguyên nhân/tìm kiếm hiện tại; nút Ôn chỉ lấy thẻ đến hạn trong phạm vi đó. Đặt lại xóa tất cả tiêu chí.
- **Nguồn đề (duyệt 08/10/2026):** tên đề tùy chọn, chọn gợi ý hoặc nhập mới; gợi ý lấy từ các thẻ và lịch sử làm bài. Trim/gộp khoảng trắng, gom tên chỉ khác hoa/thường; không tự đoán tên từ nội dung AI. Thẻ cũ chưa có tên dùng `sessionId` tra buổi làm bài nếu còn. Lưu tên vào `sourceTestName` (tối đa 300 ký tự), chuỗi rỗng là chủ động bỏ nguồn; null/thiếu trường vẫn nhận nguồn cũ nếu có. Tên lưu trên thẻ không phụ thuộc việc còn lịch sử buổi học. Lưu & thêm tiếp giữ tên đề; tạo thẻ trong lúc lọc một đề điền sẵn đề đó. Có thể gắn/gỡ tên đề qua Sửa; giữ lịch ôn. Backup/schema API/SQL extra giữ trường mới, không cần migration. Tên đề là metadata người học, không gửi AI hoặc khiến model đoán lại đáp án.
- **Phần đầu trang (chốt phạm vi 08/10/2026):** giữ nguyên top bar toàn ứng dụng. Bỏ tiêu đề lớn lặp tên trang trong phần nội dung (vẫn giữ heading cho screen reader); gom tab trạng thái, tìm kiếm/Lọc và nút ôn/thêm vào thanh công cụ có thể xuống dòng. Nút ôn dùng nhãn ngắn "Ôn N thẻ". Thứ tự DOM theo thứ tự nhìn thấy, không đảo thứ tự bằng CSS.
- **Độ dài danh sách:** mặc định hiện tối đa 5 thẻ trong kết quả lọc. Nếu có nhiều hơn, chân bảng ghi "Hiển thị 5/N thẻ" và có **Xem tất cả (N)**; mở hết có **Thu gọn** để trở lại 5 thẻ. Đổi tìm kiếm/đề/Part/nguyên nhân/trạng thái hoặc Đặt lại trở về mức 5. Tìm kiếm, lọc, số đếm và phiên ôn vẫn dùng toàn bộ tập thẻ phù hợp, không chỉ 5 thẻ đang hiển thị; không xóa dữ liệu hay gọi AI khi mở/thu gọn.
- **Trình bày (2026-10-07, đã duyệt mockup):** mỗi dòng chỉ có Part, câu hỏi (tối đa 2 dòng), trạng thái ôn bằng chữ ("Ôn hôm nay", "Quá hạn N ngày", "Ôn sau N ngày", "Thông suốt") và menu ⋯ (Ôn câu này, Sửa, Đánh dấu đã thuộc / Ôn lại từ đầu, Xóa). Mở dòng: đoạn trích, phương án A–D kèm nghĩa và từ loại viết tắt tiếng Anh (`prompt (adj): nhanh chóng`; Part 7 chỉ bản dịch), phương án đã chọn tô đỏ, đáp án tô xanh, một hộp "Mẹo 10s"; phần giải thích còn lại thu gọn sau "Xem giải thích". Viền đen dày chỉ ở khung danh sách và nút chính. Không còn nút một chạm Cần ôn/Thông suốt trên từng dòng.

- **Thẻ chưa có đáp án:** hiện "Chưa có đáp án", vẫn sửa/xóa được; không tính vào số thẻ đến hạn, không đưa vào phiên ôn và không cho đánh dấu đã thuộc. Sau khi bổ sung đáp án hợp lệ, thẻ cần ôn mới được xét theo lịch. Thiếu đáp án là trạng thái nội dung, không thêm một bậc lịch ôn.

#### Modal nhập lỗi — đã triển khai local theo bản duyệt

**Một form, hai cách hoàn tất (bản gọn duyệt 08/10/2026).** Người dùng mới mở form trống. **Lưu nhanh** ghi trực tiếp sau kiểm tra hợp lệ, không gọi AI hoặc bắt mở preview. **Phân tích với AI** mở bước kiểm tra kết quả trước khi lưu. AI và nhập thủ công dùng chung dữ liệu; không chuyển sang form dài khác khi AI lỗi. Bỏ mẫu minh họa khỏi form thường dùng.

**Bước 1 — Thêm lỗi sai**

1. **Câu hỏi + phương án:** một textarea để dán nguyên câu hỏi và các lựa chọn. Nhận `(A)`, `A.`, `A)`, `A:`; phương án có nhãn có thể cùng dòng. Không có nhãn: mỗi phương án một dòng, gán A–D theo thứ tự. Tách nội dung trên máy, không gọi AI hay tiêu quota chỉ để nhận diện phương án. Liên kết **Sửa** mở phần chỉnh câu hỏi/từng phương án khi cần; nếu tách không chắc thì báo lỗi tại đây và yêu cầu chỉnh trước phân tích. Không tự điền phương án thiếu hoặc lấy nội dung một câu khác làm phương án.
   Phía trên hiện tên đề nhỏ cùng **Đổi**, hoặc **Chưa gắn đề / Gắn đề**. Bấm thay ngay dòng tên bằng ô tìm kiếm; danh sách chọn hiện các tên từ Sổ tay và lịch sử, có **+ Thêm tên đề “…”** khi chưa có tên khớp và **Chưa gắn đề** để bỏ nguồn. Chọn/Enter xong tự thu gọn; Escape hoặc bấm ngoài hủy thay đổi chưa chọn. Tên mới được lưu cùng thẻ/lượt học, không tạo bản ghi điểm khi chỉ chọn/thêm tên vào bản nháp. Form nhập điểm dùng chung component/gợi ý và chuẩn hóa tên (hoa/thường, Unicode, khoảng trắng); không bắt nhập điểm để ghi lỗi. Không mở rộng danh mục đề bằng ID hay tính năng lượt làm trong đợt này. Bước kiểm tra hiện tên đề nhỏ cạnh Part khi có. Các bullet định dạng trước nhãn A–D được bỏ khi tách, không lọt vào phương án.
2. **Bạn đã chọn:** nút chữ A–D gọn (nhãn truy cập rõ, nội dung đầy đủ có trong ô dán), không lặp lại phương án thành bốn thẻ lớn. Thêm **Không nhớ** và **Bỏ trống**; bắt buộc chọn một trạng thái, không mặc định A. Part 2 chỉ có A–C. Không đánh dấu đúng/sai ở bước nhập.
3. **Lý do chọn (nếu muốn):** không bắt buộc, bắt đầu trống. AI không suy ra lý do/tâm lý nếu người học không viết.
4. **Có đáp án từ đề:** thu gọn mặc định, bấm mới mở A–D. Chọn key thì summary hiện "Đáp án từ đề: B" và có Bỏ chọn; key là tùy chọn, không có thì AI tự giải khi đủ ngữ cảnh. Không có textarea lời giải nguồn mặc định. **Thêm đoạn đọc · Part 6/7** là phần thu gọn riêng, chỉ bổ sung nếu câu dán chưa đủ ngữ cảnh. Không bắt người làm Part 5 mở chung hai tính năng. Nếu phát hiện nhiều câu hỏi, yêu cầu giữ một câu trước khi gửi.
5. Hành động chính **Lưu nhanh** (sửa thẻ: **Lưu thay đổi**), phụ **Phân tích với AI**. Lưu nhanh không đưa nội dung tới provider. Nếu chưa xác định Part, mở phần Sửa với lỗi yêu cầu chọn trước lưu; nếu thẻ cũ có giải thích không còn phù hợp sau sửa nội dung/lý do, mở kiểm tra và cảnh báo thay vì lưu âm thầm. Lưu mới thành công hiện xác nhận và **Thêm lỗi tiếp** (giữ tên đề, xóa câu/key/lựa chọn/lý do) hoặc Đóng; bấm liên tiếp không ghi trùng. Bỏ checkbox consent và banner quota/hướng dẫn dài khỏi form. Chỉ bấm Phân tích mới gửi nội dung; dán, sửa hoặc mở modal không tự gọi AI. Thông tin provider ở trang quyền riêng tư; hợp đồng API vẫn kiểm tra provider hiện tại (mục 6.5).

**Bước 2 — Kiểm tra và lưu**

- Mặc định chỉ hiện Part, câu hỏi/ngữ cảnh, phương án và nghĩa ngắn nếu có, phương án đã chọn, đáp án với nhãn nguồn, cùng **Mẹo 10s**. Lý do đã chọn, bản dịch, phân tích và từ vựng đặt sau **Xem giải thích**, thu gọn ban đầu. Không lặp lại nhãn nguồn bằng một đoạn cảnh báo riêng nếu không có thông tin thiếu/mâu thuẫn cần xử lý.
- Nguồn đáp án luôn rõ: **Đáp án từ đề** (`PROVIDED`), **AI đề xuất** (`AI_PROPOSED`) hoặc **Chưa có đáp án** (`MISSING`). Nhập thủ công là đáp án người học cung cấp, không tự tuyên bố đó là đáp án ETS đã kiểm chứng. Khi người học tự bổ sung thay vì lấy từ đề, dùng nhãn **Đáp án đã nhập**.
- **Sửa** cho chỉnh nội dung trong cùng bản nháp; giữ dữ liệu khi quay lại. Part/nhóm lỗi/tag là thông tin phụ trong phần sửa, không đặt thành một khối mặc định trên màn hình kiểm tra. Part không xác định được thì yêu cầu chọn trước lưu, không âm thầm gán Part 5. Nhóm lỗi chưa xác định dùng Khác.
- Hành động chính **Lưu lỗi sai**, phụ **Lưu & thêm tiếp**, kèm **Quay lại**. Bấm lưu là xác nhận bản nháp; không thêm checkbox "đã kiểm tra". Lưu thành công mới đóng hoặc mở form trống tiếp theo. Không ghi thẻ trùng khi bấm liên tiếp.
- AI lỗi, hết lượt hoặc tắt: giữ câu hỏi, phương án, lựa chọn, lý do và nguồn đáp án; cho tiếp tục thủ công. Bản nháp thủ công không hiện các mục giải thích AI giả. Vẫn lưu được khi chưa có đáp án, với nhãn và điều kiện ôn đã nêu ở trên.
- Lỗi tại trường liên quan, không dùng `alert()` cho kiểm tra form. Lưu thất bại giữ bản nháp và cho thử lại. Đóng bằng nút X, Escape hoặc bấm ngoài khi có nội dung chưa lưu phải xác nhận bỏ; chuyển giữa hai bước không mất dữ liệu.

**Giao diện đã duyệt ngày 08/10/2026**

- Giữ phong cách hiện tại: Plus Jakarta Sans, khung modal bo 16px, viền đậm và bóng lệch; Lưu nhanh xanh ngọc, Phân tích là hành động phụ xanh dương. Modal desktop tối đa khoảng **740–768px**.
- **Textarea dán đề bản gọn cao tối thiểu 210px, 8 dòng**, kéo cao thêm được; nội dung không dùng monospace. Tắt spellcheck trong câu/đoạn đọc tiếng Anh. Nội dung nhập, phương án, câu hỏi/giải thích ở bước kiểm tra dùng cùng font **16px**, line-height khoảng 1.6; nhãn/phần phụ nhỏ hơn theo phân cấp. Lý do bắt đầu một dòng, giãn khi nhập tới khoảng 120px và kéo cao được.
- Ô đề nền xanh nhạt, ô lý do vàng nhạt; phương án đang chọn xanh dương. Đỏ/xanh lá chỉ dùng khi có kết quả để biểu thị phương án sai/đúng. Chế độ tối giữ phân cấp và độ tương phản tương ứng.
- Không slogan, thanh bước lặp với tiêu đề, dòng "đã nhận N phương án", mô tả dài dưới từng trường hoặc khối phân loại/tag mặc định. Hướng dẫn định dạng đặt trong placeholder/help theo nhu cầu; chỉ hiện lỗi tách khi có vấn đề.
- Điện thoại dùng chiều rộng màn hình, nút chọn chữ A–D thành một hàng có thể wrap; hai nhóm lựa chọn/key xếp dọc. Phương án ở preview vẫn một cột trên điện thoại. Nội dung modal cuộn và hành động cuối vẫn truy cập được. Giữ nhãn truy cập, bàn phím, focus và Escape theo mục 5.3. Kiểm tra 320/375/768/1024/1440px, sáng/tối và zoom 125%.
- Khi còn nội dung dưới vùng cuộn: nút **↓** tròn 44px nổi ở chính giữa mép dưới, có nhãn truy cập và tooltip "Còn nội dung bên dưới" khi hover/focus. Mũi tên nảy nhẹ 4px, hai nhịp khi xuất hiện rồi dừng; vùng bấm đứng yên. Tắt hiệu ứng nếu bật reduced motion. Bấm cuộn tới cuối (tôn trọng reduced motion), tự ẩn khi tới cuối/không có overflow; xuất hiện lại khi cuộn lên hoặc mở thêm nội dung. Không thêm hàng thông báo vào layout, không che hàng nút lưu. Danh sách tên đề nằm trên vùng cuộn, hỗ trợ Up/Down/Enter/Escape; Escape đầu tiên chỉ đóng picker, không đóng modal.

#### Phiên ôn tập

**Luồng một phiên:**

```
Hiện đoạn trích và câu hỏi
  → người học chọn A–D (nghĩa phương án ẩn tới khi trả lời)
  → app tự chấm, tô đáp án và phương án đã chọn, hiện nghĩa từng phương án
  → một dòng kết quả kèm lịch mới ("Đúng · ôn sau 3 ngày", "Vẫn nhầm như lần trước · ôn lại ngày mai")
  → Mẹo 10s; giải thích chi tiết thu gọn
```

- **Một luồng ôn duy nhất:** trắc nghiệm khi đáp án khớp một phương án có thật; nếu có đáp án nhưng không đủ phương án để chấm thì lật thẻ và tự chấm Nhớ / Chưa nhớ. Thẻ chưa có đáp án bị loại trước khi mở phiên. Chốt danh sách ID/thứ tự lúc mở; khi chấm, đọc bản ghi mới nhất và chỉ cập nhật trường lịch ôn, không thay toàn bộ thẻ bằng bản chụp cũ. Nếu câu hỏi/phương án/đáp án đã đổi trong khi ôn, yêu cầu tải lại thẻ trước khi chấm; thẻ bị xóa thì bỏ qua.
- **Nguồn đáp án:** thẻ `AI_PROPOSED` phải hiện nhãn AI đề xuất trong cả trắc nghiệm và lật thẻ; kết quả được chấm theo đề xuất đó, không gọi là đáp án nguồn đã kiểm chứng. Nhãn không hiện đáp án trước khi người học trả lời.
- **Lịch giãn cách:** mỗi bản ghi có `nextReviewDate`. Nhớ thì giãn theo bậc 1 → 3 → 7 → 14 → 30 ngày; quên thì quay về bậc đầu. Đúng ở bậc cuối thì tự chuyển "Thông suốt". *Đây là quyết định chốt, thay cho mâu thuẫn trong v1 giữa mục 1.2 và mục 3.4.*
- **Ôn sớm** ("Ôn câu này" với thẻ chưa đến hạn hoặc đã thông suốt): sai thì đặt lại lịch về ngày mai; đúng thì giữ nguyên lịch, để không thể đẩy thẻ lên "Thông suốt" bằng cách làm nhiều lần trong một ngày. Muốn bỏ qua lịch thì dùng "Đánh dấu đã thuộc" trong menu ⋯.
- Tổng Quan/điều hướng chỉ đếm các thẻ đủ điều kiện ôn; thiếu đáp án không làm tăng badge. Lối vào trực tiếp phiên ôn từ Tổng Quan là yêu cầu cần đối chiếu với UI hiện tại, không coi là đã hoàn thành.
- Ưu tiên trong phiên: thẻ quá hạn lâu nhất trước, rồi tới nhóm nguyên nhân đang là điểm nghẽn lớn nhất.

#### Phát hiện tái phạm

*Xem mục 1.4 điểm 2 — đây là năng lực khác biệt mạnh nhất của sản phẩm.*

Khi ghi nhận lỗi mới thuộc nhóm nguyên nhân mà người học **đã từng đánh dấu là thông suốt**, hệ thống đối chiếu và cảnh báo trên Tổng Quan. Người học chủ động bấm đưa các thẻ liên quan về ôn lại; không tự hạ trạng thái khi chỉ mở màn hình. Ghi lại thời điểm khi đánh dấu đã thuộc để đối chiếu đúng mốc, không lấy ngày tạo thẻ làm thời điểm tuyên bố thông suốt.

#### Điều kiện nghiệm thu Sổ tay v2.14

- Dán một câu có nhãn, không nhãn mỗi phương án một dòng, cùng dòng có nhãn; sửa được trường hợp tách không rõ. Nguồn nhiều câu không được lấy đáp án đầu tiên rồi gán cho câu khác.
- Lựa chọn A–D/Không nhớ/Bỏ trống và lý do trống giữ đúng qua AI, sửa, lưu, tải lại, đồng bộ và xuất/nhập backup. AI không thay lời người học hoặc bịa phương án/lý do.
- Thẻ có đáp án nguồn, AI đề xuất và thiếu đáp án hiển thị nhãn đúng ở preview/sổ tay/ôn tập; thẻ thiếu đáp án không vào lịch ôn.
- Quay lại, chuyển thủ công, AI lỗi/hết lượt, lỗi ghi dữ liệu và xác nhận đóng không làm mất bản nháp; hai nút lưu không tạo bản ghi trùng.
- Ôn rồi đồng bộ và xuất/nhập backup thành công với cả dữ liệu cũ và mới. Thay đổi ở thiết bị khác trong lúc ôn không bị ghi đè bởi bản chụp cũ.
- Kiểm tra bản nháp dài hợp lệ ở backend vẫn đọc được ở frontend; các trường nguồn, lựa chọn, lời người học và giải thích tồn tại qua toàn bộ vòng lưu/đồng bộ/backup.
- UI đúng kích thước, cỡ chữ, màu và mức thu gọn đã duyệt; bàn phím, màn hẹp, dark mode và zoom không mất nội dung/hành động.

Không web luyện đề nào làm được điều này, kể cả về nguyên tắc, vì nó đòi hỏi lịch sử lỗi xuyên nhiều nguồn đề trong nhiều tháng. Đây là vòng lặp khép kín: ghi lỗi → ôn → **kiểm chứng bằng đề sau** → phát hiện chưa thật sự thuộc.

### 4.7. Tài Liệu & Quy Đổi

> *Tính năng này cũng không có trong v1.*

- **Bộ quy đổi Raw sang Scaled** để thử "nếu đúng thêm năm câu Part 7 thì được bao nhiêu". Khởi tạo từ bài Full Test gần nhất, cho phép chỉnh tay. Nhãn phải phân biệt rõ đâu là kết quả thật, đâu là con số đang thử.
- **Bảng đối chiếu chứng chỉ quốc tế:** TOEIC với CEFR, IELTS, VSTEP và TOEFL iBT, căn cứ Khung năng lực ngoại ngữ sáu bậc (Thông tư 01/2014/TT-BGDĐT) và tham chiếu ETS.
- **Chiến thuật phân bổ thời gian, checklist trước ngày thi, tổng hợp các bẫy thường gặp.**
- **Lộ trình S&W** (gộp từ phân hệ riêng): giới thiệu thang 400, cấu trúc Speaking 11 câu và Writing 8 câu. Thuần tĩnh cho tới khi có dữ liệu S&W thật.

### 4.8. Cài Đặt & Dữ Liệu

- Tên, `targetScore`, `examDate`, mục tiêu phút tối thiểu mỗi ngày.
- **Sao lưu JSON v3:** gồm hồ sơ, buổi học, lỗi sai, lượt Phòng Thi, checklist, từ vựng, ngày dùng khiên và kế hoạch tuần. Dữ liệu lưu trong một gói `toeic_progress_bundle_v3`; lần đầu mở ứng dụng tự chép khóa v1 sang gói mới, không xóa các khóa gốc. Một lần `localStorage.setItem` là điểm commit nguyên khối.
- **Khôi phục:** kiểm tra toàn bộ tệp trước khi ghi, báo tối đa 10 lỗi kèm vị trí, từ chối tệp phiên bản mới hơn. Chỉ chuẩn hóa nhóm lỗi lạ thành “Khác” và trường không bắt buộc bị thiếu, đồng thời báo các sửa đổi. Xem trước số bản ghi trong tệp so với máy, có nút xuất bản hiện tại và xác nhận trước khi thay thế. Tệp v1 thiếu Phòng Thi/checklist/từ vựng/ngày dùng khiên thì giữ nguyên các phần đó trên máy.
- **Dữ liệu mẫu là tùy chọn.** Người dùng mới bắt đầu với hồ sơ trắng, không phải dữ liệu của người khác.

---

## 5. HỆ THỐNG THIẾT KẾ

### 5.1. Chế độ màu

**Sáng là mặc định, tối là tùy chọn.**

*Quyết định này thay thế "Modern Dark Pro" của v1 — bản sắc đó đã không còn đúng với sản phẩm thực tế.*

Theme lưu ở `localStorage['toeic_theme_v1']`. Một script đồng bộ đặt trong `<head>` gắn class trước khi trình duyệt vẽ khung hình đầu tiên; React đọc lại trạng thái từ chính class đó. **Không được chuyển script này thành module hay defer** — sẽ nháy màn hình mỗi lần tải trang.

### 5.2. Bảng màu ngữ nghĩa

| Vai trò | Sáng | Tối |
| :--- | :--- | :--- |
| Nền trang | `#EAEFF5` | `#0B111E` |
| Nền card | `#FFFFFF` | `#121A2B` |
| Nền sidebar | `#F7F9FC` | `#0E1526` |
| Hành động chính | `blue-600` | `blue-600` |
| Streak | `amber` — thẻ Chuỗi Ngày Học nền hổ phách, số streak ở dải chỉ số `amber-600` | như chế độ sáng |
| Listening | `indigo-600` (tối: `indigo-400`) | như chế độ sáng |
| Reading | `teal-600` (tối: `teal-400`) — người dùng chọn theo mẫu | như chế độ sáng |
| Mục tiêu | `pink-600` | `pink-400` |
| Thành công, đã thông suốt | `emerald` | như chế độ sáng |
| Lỗi sai, cần ôn | `rose` | như chế độ sáng |

Sidebar dùng nền xám rất nhạt và các mục không viền; mục đang mở nổi trên nền trắng với một vạch chàm mảnh, thay cho ô xanh viền toàn bộ. Chỉ hai nhãn nhóm ngắn `Học tập` và `Theo dõi`, tên mục hiển thị ngắn nhưng nhãn truy cập giữ tên đầy đủ. Đáy sidebar chỉ còn hồ sơ mở Cài đặt; sao lưu và dữ liệu mẫu nằm trong modal đó. Chế độ tối giữ cùng phân cấp và độ tương phản.

**Màu phải mang nghĩa.** Nền thẻ luôn trắng (tối: `#111A2C`); không tô nền thẻ theo chủ đề — ngoại lệ duy nhất là thẻ Chuỗi Ngày Học. Tổng Quan và Phân Tích dùng chung `CARD` / `SKILL_COLORS` trong `surfaces.ts`; màn hình mới phải import từ đó thay vì tự viết lớp màu.

### 5.3. Bố cục & chữ

- Font `Plus Jakarta Sans`, card bo `rounded-2xl`, pháo giấy khi phá kỷ lục điểm.
- **Mobile-first.** Viết mặc định cho màn hẹp rồi mới thêm `sm:`, `md:`, `xl:`. Không bao giờ để một grid nhiều cột mà thiếu biến thể responsive.
- **Nhãn co được, dữ liệu giữ nguyên.** Nhãn dùng `min-w-0 truncate`, con số và badge dùng `shrink-0`. Không dùng `max-w-[...]` cứng.
- **Kiểm ở 375, 768, 1024 và 1440.** 1024 là điểm dễ vỡ nhất vì vừa đủ chia hai cột nhưng chưa đủ chỗ cho nội dung.
- **Hộp thoại** phải có `role="dialog"`, `aria-modal`, `aria-labelledby`, đóng được bằng Escape, bẫy focus bên trong, và trả focus về chỗ cũ khi đóng.

---

## 6. KIẾN TRÚC KỸ THUẬT

### 6.1. Tech stack

React 18 · Vite 6 · TypeScript chế độ strict · Tailwind 3.4 · `recharts` · `lucide-react` · `canvas-confetti`.

Lưu trữ khách: **LocalStorage**, một gói dữ liệu có phiên bản. Các khóa v1 được giữ lại khi migrate. Chưa dùng IndexedDB.

Backend nghiệp vụ dùng Python + FastAPI; Supabase cung cấp PostgreSQL và Auth. Google OAuth là lựa chọn mặc định; email OTP chỉ bật sau khi có SMTP. URL/publishable key ở frontend, service-role/Gemini key chỉ ở FastAPI. Chưa cấu hình dịch vụ vẫn dùng khách trên máy.

### 6.2. Mô hình dữ liệu

Nguồn sự thật là `frontend/src/shared/types/index.ts`. Các thực thể chính:

- `UserProfile` — tên, `targetScore`, `examDate`, cấu hình khiên và mục tiêu mỗi ngày. Streak suy ra từ ngày học/từ vựng/ngày dùng khiên.
- `StudySession` — một buổi làm đề hoặc luyện Part; điểm Raw và Scaled, `partScores`, `attemptNumber`, thời gian, ghi chú.
- `MistakeEntry` — một lỗi sai; Part, ngữ cảnh, đáp án, nhóm nguyên nhân, tag, trạng thái.
- `SessionAttemptMeta` — lần làm thứ mấy, chênh lệch so với lần đầu và lần trước.
- `VocabLog` — ngày và số từ đã học. `ShieldDay` — ngày khiên đã lấp; hai loại đều có `updatedAt`/`deletedAt` để đồng bộ.

**Hợp đồng Sổ tay v2.14 — đã triển khai local:** giữ `userChoice` cho A–D và bổ sung `userChoiceState` (`CHOSEN`/`UNKNOWN`/`BLANK`), `userReason` cho nguyên văn lý do; `answerProvidedBy` (`SOURCE`/`LEARNER`) phân biệt đáp án lấy từ đề và đáp án người học nhập tay. `CHOSEN` cần phương án khớp; hai trạng thái còn lại không có `userChoice`. Giữ `userMistake` để hiển thị bản ghi cũ/client cũ, không dùng nó làm nguồn ghi đè các trường mới. Dữ liệu cũ có `userChoice` hợp lệ hoặc tiền tố chuẩn `(A) ...` do form cũ ghi thì nhận là CHOSEN; không suy lựa chọn từ lời kể tùy ý, thiếu căn cứ dùng UNKNOWN. Không tự tách lý do từ văn bản cũ thiếu cấu trúc; giữ nguyên `userMistake` để xem.

Các trường mới phải đi qua type frontend, validation backend, backup và sync; lưu trong `extra` của bảng `mistakes` hiện có, không đổi endpoint, khóa localStorage hay tạo migration SQL chỉ để thêm metadata. Giữ gói/backup v3 và khả năng nhập v1/v2. Chuẩn hóa `lastReviewedAt` mới thành ISO timestamp có múi giờ; `nextReviewDate` vẫn là ngày `YYYY-MM-DD`. Ngày-only đã được lưu bởi code cũ phải được nhận ở đường đọc local, nhập backup và API, chuẩn hóa thành `00:00:00Z` của ngày đó, không đoán giờ lịch sử hoặc đổi lịch hẹn. Các sửa đổi khi nhập backup phải được báo trong preview.

**Nợ kiến trúc đã biết, cần trả trước khi mở công khai:**

1. Đã có bước chuyển dữ liệu v1/v2 sang gói v3, gồm kế hoạch tuần; các lần đổi schema sau vẫn cần migration riêng và bài kiểm thử tương ứng.
2. Xóa một buổi học **không xóa các lỗi sai liên kết** qua `sessionId`.
3. Sáu màn hình có URL riêng, deep link và Back/Forward qua History API. Ba trang công khai có URL riêng và tải trực tiếp được.
4. `AnalyticsView.tsx` hơn 2000 dòng, cần tách hook và component con.
5. Có Vitest cho logic, ESLint và Playwright cho luồng trình duyệt; CI chạy cả ba. Error boundary giữ nguyên dữ liệu hỏng và cho xuất bản thô để phục hồi.
6. `<input type="date">` hiển thị theo locale trình duyệt (MM/DD/YYYY), lệch với định dạng DD/MM/YYYY dùng ở mọi nơi khác trong app.

### 6.3. Ước tính và nhập điểm TOEIC

Bảng tra Raw sang Scaled cho từng kỹ năng (0–100 thành 5–495), tổng 10–990. Hàm `calculateFromPartScores()` cộng Part 1–4 thành Raw Listening và Part 5–7 thành Raw Reading.

**Bảng tham khảo cũ của app chưa có nguồn gắn với từng đề và chưa được hiệu chuẩn.** Giao diện gọi kết quả là "Ước tính tham khảo". [ETS hiệu chỉnh điểm theo độ khó từng đề](https://www.cn.ets.org/Media/Research/pdf/RM-17-05.pdf), nên không có một bảng câu đúng → điểm chính thức dùng cho mọi đề. Giữ nguyên bảng hiện có (`legacy-reference-v1`), không tự viết bảng mới thiếu nguồn hay tính lại dữ liệu lịch sử.

`scoreSource` phân biệt `ESTIMATED`, `MANUAL_SECTIONS`, `MANUAL_TOTAL`. Nhập L/R: mỗi kỹ năng 5–495, tổng tự cộng; nhập tổng: 10–990, không suy ra L/R. Điểm theo bước 5. Số câu đúng từng Part vẫn có thể ghi để phân tích, không ghi thì để trống. Biểu đồ tổng dùng điểm đã lưu; phân tích kỹ năng chỉ dùng bài có đủ L/R. Bản ghi cũ thiếu nguồn điểm vẫn đọc được; form sửa nhận diện các điểm đã nhập khác bảng tham khảo để giữ chúng. Metadata mới round-trip trong `extra` của bảng `study_sessions`, không cần migration. Backend và sao lưu kiểm tra tính hợp lệ của các bản ghi có nguồn điểm mới.

### 6.4. Tài khoản và đồng bộ

- **Vận hành beta (2026-10-06):** bộ đếm API theo owner/scope trong PostgreSQL, chỉ service role giữ lượt; ingress guard theo IP và concurrency có bộ nhớ giới hạn trong mỗi process. HTTP 429/503 kèm Retry-After; failed flush không tự lặp tức thì. Log metadata JSON với request ID do server tạo, không log nội dung/khóa/query. `/health` là liveness, `/ready` kiểm tra PostgREST và bảng cần thiết, cache 15 giây/timeout 3 giây. Staging/production từ chối cấu hình thiếu khóa database, API limits, secret đủ dài, hostname và HTTPS origin; AI có thể tắt để triển khai tracker. Backup/staging smoke đã có công cụ, cần kiểm chứng trên môi trường thật; chưa có chứng nhận sức chịu tải hay deploy public. Xem `docs/DEPLOYMENT.md`.

- **Xóa nội dung (2026-10-06):** dấu xóa nằm trong `sync_tombstones` riêng, chỉ giữ ID/owner/loại/thời điểm/phiên bản. Nội dung bản ghi và bảng con đã xóa bị xóa khỏi bảng nghiệp vụ và bản legacy. Xóa trắng tài khoản chạy qua FastAPI trong giao dịch, reset hồ sơ/checklist và ghi mốc reset để thiết bị cũ không tải ngược dữ liệu lên. FE bỏ response đang chạy khi reset; export chỉ gồm dữ liệu đang hiệu lực. Reset khách không tác động tài khoản; reset tài khoản không xóa gói guest riêng hay file backup đã tải.

- Server dùng `user_profiles`, `study_sessions`, `mistakes`, `vocabulary_logs`, `weekly_plans`, `pacing_runs`, `exam_checklist`, `streak_shields`; bảng con `study_session_parts`, `weekly_plan_tasks`, `pacing_run_phases`. `exam_history` là view Full Test; `sync_records` là view tương thích giao thức, không phải nguồn lưu trữ. Migration 3 giữ nguyên ID/cursor, chuyển dữ liệu trong giao dịch và giữ bảng cũ ở `sync_records_legacy` cho phục hồi. RLS bảo vệ cả bảng chính và bảng con theo owner. Trường chưa thuộc schema được giữ trong `extra`.

- Dữ liệu khách nằm ở gói riêng; đăng nhập không xóa gói này. Dữ liệu từng tài khoản có gói cục bộ theo user ID. Khi cả tài khoản và máy có dữ liệu, hỏi **Gộp** (mặc định), **Dùng tài khoản**, hoặc **Dùng máy này**.
- Mọi bản ghi, kể cả hồ sơ, checklist theo mục, từ vựng theo ngày và ngày dùng khiên, có `updatedAt`/`deletedAt`. Xóa mềm. Gộp theo ID; bản mới hơn thắng, trùng thời điểm thì bản xóa thắng. Một RPC Postgres kiểm tra phiên bản trong chính giao dịch ghi để yêu cầu đến muộn không ghi đè bản mới. Lựa chọn dùng máy này tạo bản xóa cho mục chỉ có trên server.
- FastAPI xác thực token qua Supabase Auth rồi lấy owner từ phiên; client không chọn user ID. RPC ghi/cursor và quota chỉ cấp cho service role. RLS chặn đọc chéo và chặn danh tính ẩn danh đọc dữ liệu tài khoản. Xóa tài khoản qua FastAPI xóa Auth user và dữ liệu FK. Đồng bộ gửi phần thay đổi, cursor chỉ cập nhật sau khi snapshot cục bộ ghi thành công.
- Khi đăng nhập mà mất mạng hoặc đồng bộ lỗi, chặn ghi tài khoản và báo trạng thái; cho phép quay về gói khách. Streak luôn suy ra từ ngày học, ngày từ vựng và ngày dùng khiên.
- **Trạng thái triển khai:** có FastAPI, migration v3, kiểm thử API và PostgreSQL cục bộ. Chưa có dự án staging/production nên chưa xác minh OAuth, PostgREST và Gemini thật. Hướng dẫn cấu hình/deploy ở `backend/README.md`.

---

### 6.5. AI hỗ trợ nhập/phân tích lỗi và beta miễn phí

- Bản đầu nhận một câu hỏi cùng phương án/ngữ cảnh bằng văn bản; không nhận ảnh/PDF. Luồng nhập mới theo mục 4.6, tách lựa chọn và lý do thành trường riêng trước gọi AI. Endpoint extraction giữ đường dẫn hiện tại và nhận `input` tùy chọn (`question`, `options`, `context`, `part`, `userChoiceState`, `userChoice`, `userReason`, `sourceAnswer`). Giữ `text` cho client cũ; client mới lấy capability `structured_mistake_input` từ `/health`, không tự gửi nhóm input cho backend cũ chưa hỗ trợ và vẫn cho nhập thủ công. Input có cấu trúc được kiểm tra và gửi nguyên nhóm sang provider; grounding dùng options/sourceAnswer của nhóm đó, không tìm đáp án trong lời người học. API trả lại lựa chọn/lý do do người học cung cấp thay cho trường AI tự kể. Kiểm tra số câu 101–200, nhãn câu, nhóm phương án/đáp án lặp ở backend trước quota AI/provider; đây là kiểm tra định dạng, không cam kết hiểu mọi đoạn văn không có ranh giới rõ.
- Khách dùng tracker trước, AI tạo danh tính ẩn danh khi cần. Dữ liệu học chỉ đồng bộ sau khi đăng nhập Google.
- Mặc định khách 3 lượt, tài khoản 10 lượt/tháng, cả app 20 lượt/ngày và 2 lượt/phút; cấu hình theo quota Gemini Free thực tế. Giữ lượt người dùng một lần trong giao dịch PostgreSQL; UUID chống gửi trùng. Backend có failover giới hạn theo thứ tự 3.8 Flash → 3.7 Flash → 3.6 Flash → 3.5 Flash; từng outbound attempt giữ RPM/TPM/RPD riêng trong database.
- Gmail trong `AI_UNLIMITED_EMAILS` ở backend được miễn mọi cap AI tháng/ngày/phút và spam theo tài khoản/IP khi Supabase Auth trả email đã xác nhận và Google identity khớp email có `email_verified=true`. Không tin `user_metadata` hay email từ client. Vẫn giữ idempotency, counter/audit, RLS và giới hạn tài nguyên/provider; không cấp quyền dữ liệu người khác. UI lấy quyền từ backend, không hardcode email.
- OpenAI trực tiếp qua Responses API dùng `gpt-6-luna`, effort `medium` mặc định, strict JSON theo `OpenAIDraftOutput` rồi chuyển sang `MistakeDraft`, `store=false`, output tối đa 8.192 token (gồm reasoning), timeout 45 giây. Không retry hoặc chuyển sang provider khác khi lỗi. `/health` thông báo provider; API từ chối provider không khớp trước gọi AI. Luồng mới không có checkbox gửi AI: thao tác bấm **Phân tích với AI** mới gửi request có `consent=true` cùng provider đã xác định, không gửi khi dán/sửa/mở modal. Đổi provider trong lúc mở form phải cập nhật thông tin và cho người học bấm lại, không tự gửi hoặc tự retry extraction. Trang quyền riêng tư phải mô tả đúng các provider có thể dùng. Quota app thường vẫn áp dụng; tài khoản được miễn vẫn phát sinh phí OpenAI. Gemini là chế độ tương thích deploy cũ tới khi operator đổi `AI_PROVIDER`.
- AI trả dữ liệu có cấu trúc: `optionNotes` (nhãn, từ loại viết tắt `n/v/adj/adv/prep/conj/pron/det` hoặc rỗng với cụm/câu, nghĩa ngắn) và `explanation` (quickTip, translation, questionType, evidence trích nguyên văn, paraphrase, analysis, keyVocabulary; mục không áp dụng là rỗng). Backend ghép `trapTip` có nhãn để tìm kiếm/client cũ; grounding bỏ ghi chú của phương án không có trong nguồn. Tổng `trapTip` sau ghép phải nằm trong giới hạn **4.000 ký tự** mà frontend/backend/sync chấp nhận, kể cả nhãn và nghĩa phương án; không để từng trường hợp lệ nhưng bản nháp cuối bị frontend từ chối. Giữ các mục có cấu trúc đầy đủ; phần văn bản tương thích nếu cần rút gọn phải theo đoạn và có dấu rút gọn, không cắt phương án/đáp án gốc. Part dựa vào nguồn và dạng bài; thiếu căn cứ thì yêu cầu người học chọn trước lưu. Nhóm "đọc ẩu"/"áp lực giờ" chỉ khi người học tự kể. Part 7 cần đoạn bằng chứng liên quan, không bịa nội dung audio/đoạn văn. `options` và `questionContext` giữ tiếng Anh nguồn. `optionNotes`/`explanation` lưu trong `extra`; Gemini/bản ghi cũ không có thì hiển thị `trapTip`.
- **Đầu vào người học là nguồn sự thật:** lựa chọn, UNKNOWN/BLANK và nguyên văn lý do đã nhập phải được giữ; AI chỉ nhận xét dựa trên đó. Không để `userChoice` AI trả về thay thế trạng thái/lựa chọn trong form. Không có lý do thì không tạo lý do mới. Phương án được gán nhãn trên máy vẫn phải có đúng nội dung gốc; backend kiểm tra lựa chọn và đáp án nguồn trong tập phương án của đúng một câu đó. Hợp đồng lưu/đọc bản ghi cũ theo mục 6.2; các trường mới đi qua backup/sync.
- **Chất lượng giải thích Reading (prompt và kiểm tra đầu ra OpenAI đã cập nhật 08/10/2026):** Part 5 ưu tiên cấu trúc/từ loại/nghĩa/collocation; Part 6 xét thêm mạch văn; Part 7 dùng bằng chứng/paraphrase trong bài. Nghĩa A–D chỉ gồm bản dịch/dạng từ: ưu tiên nghĩa trong câu, có thể thêm 1–2 nghĩa cùng từ loại thường gặp trong TOEIC Listening & Reading, không liệt kê từ điển hay trộn lý do chọn/loại. Giới hạn nghĩa 120 ký tự, không rút ngắn làm mất ý. Bản dịch giữ các cụm mang nghĩa của câu nguồn (kể cả revised/latest/additional), nhất quán với nghĩa phương án. Phân tích Reading tách dòng dấu hiệu, lý do chọn và từng phương án nhiễu; cho phép nhắc lại nghĩa quyết định nhưng không chép toàn bộ danh sách. Giao diện giữ xuống dòng và tách câu của phân tích cũ để dễ đọc, không sửa nội dung đã lưu. Đầu ra OpenAI mới thiếu/trùng/để trống ghi chú phương án bị từ chối; không áp ràng buộc mới này hồi tố lên thẻ đã lưu hoặc Gemini. Validator kiểm tra cấu trúc, không xác minh ngữ nghĩa. [Bộ đánh giá Reading](AI_READING_EVAL.md) kiểm tra các từ nhiều nghĩa và các Part; chưa coi test dùng phản hồi giả là bằng chứng chất lượng model thật.
- Đáp án nguồn tùy chọn: có nguồn hợp lệ ưu tiên `PROVIDED`, báo mâu thuẫn nếu AI chọn khác. Không có nguồn và đủ dữ liệu thì AI tự giải, trả `AI_PROPOSED` khớp phương án gốc. Thiếu ngữ cảnh/không đủ phương án/nguồn lỗi thì `MISSING`, không đoán bừa. `answerSource` được giữ khi lưu, đồng bộ và backup trong metadata `extra`, không cần migration. Preview/sổ tay/ôn tập đều phân biệt 'Đáp án AI đề xuất' với nguồn người dùng cung cấp; kiểm tra trước lưu. Gemini giữ chính sách cần nguồn cũ.
- **Cân bằng Gemini (2026-10-07):** theo xác nhận của người dùng, mỗi key thuộc tài khoản/project có quota độc lập. Cấu hình đơn giản `GEMINI_API_KEYS` là mảng chuỗi, không cần project ID; từng key được gán nhóm bằng hash ổn định. Chọn key ít request đang chạy, sau đó lâu chưa dùng. `GEMINI_PROJECTS` vẫn hỗ trợ nhóm nâng cao nếu có key chung project; không dùng đồng thời hai chế độ. `ai_provider_state` và `ai_provider_attempts` chỉ lưu hash và metadata vận hành, chỉ service role truy cập. Hết RPM/TPM đặt cooldown ≥60 giây; RPD ≥24 giờ từ lúc phát hiện; tôn trọng Retry-After dài hơn. Hết cooldown chỉ một probe thử hồi phục. Quota không rõ phạm vi khóa cả nhóm của key; timeout/mất kết nối không gửi lại trong cùng lượt. Tổng số lượt app không tăng theo số key. Dùng migration `20261007000000_gemini_provider_pool.sql` đã có, không tạo/chạy lại migration khi đổi cách nhập. Key/Turnstile và test staging thật cần xong trước khi bật AI; xem `backend/README.md`.
- Người học chủ động bấm Phân tích để gửi tới provider đang cấu hình; kết quả là bản nháp. Nguồn đáp án tùy chọn đối với OpenAI, Gemini giữ chính sách cần nguồn khi dùng chế độ cũ. Khi không có đáp án, AI lỗi hoặc thiếu ngữ cảnh, vẫn cho lưu thủ công với `answerSource=MISSING` và không đưa thẻ đó vào ôn. Không tạo phương án thiếu, không suy diễn lý do sai và không biến đáp án AI thành PROVIDED chỉ vì người học đã bấm Lưu. AI không lưu thẻ thay người học; chỉ hai hành động lưu ở bước kiểm tra mới ghi dữ liệu học.
- Không có đáp án nguồn nhưng đủ dữ liệu: AI tự giải, phương án được chọn hiện xanh lá kèm **AI đề xuất**. Strict schema của request có cấu trúc giới hạn `correctAnswer` trong chính các phương án gốc hoặc chuỗi rỗng; không tái tạo câu đã điền hay thêm dấu câu vào đáp án. Thiếu ngữ cảnh quyết định vẫn dùng MISSING, không tô một phương án xanh chỉ từ mẹo/phân tích.
- Kế hoạch tuần đi cùng gói v3 và backup. Mỗi tuần là một bản ghi; sửa đồng thời trên hai máy dùng bản mới hơn thắng.
- Bắt đầu ngân sách 0 đồng, dùng cá nhân rồi beta 20–30 người; thông báo beta miễn phí có giới hạn, gói nâng cao có thể trả phí khi chính thức. Chưa tích hợp thanh toán.

---

## 7. NHỮNG THỨ KHÔNG LÀM

Mục này tồn tại để khỏi phải tranh luận lại. Mỗi dòng kèm lý do.

| Không làm | Vì sao |
| :--- | :--- |
| **Ngân hàng đề, câu hỏi trong app** | Biến tracker thành nền tảng luyện thi — khác hẳn về quy mô, bản quyền và hạ tầng. Và làm mất chính ưu thế "bất khả tri về nguồn đề" |
| **Chấm bài tự động** | Cùng lý do trên |
| **Module từ vựng, flashcard** | Các web chuyên dụng làm tốt hơn nhiều. **Chỉ theo dõi số từ đã học mỗi ngày như một chỉ số** — đó là dữ liệu, không phải nội dung |
| **Bài giảng, video, lý thuyết** | Không phải vai trò của sản phẩm |
| **Bảng xếp hạng, mạng xã hội** | Không phục vụ mục tiêu theo dõi tiến bộ cá nhân của sản phẩm |
| **Gia sư AI tổng quát** | Bản đầu tập trung trích nhập và phân tích lỗi từ văn bản người học đưa, xem mục 6.5 |
| **Bắt người dùng nhập tay thời gian từng Part** | Phải gõ bảy con số mỗi buổi. Chi phí nhập liệu vượt giá trị thu được. **Nhưng đo tự động thì được** — Bộ đếm nhịp đã biết mốc từng pha, ghi lại pha vượt giờ không tốn thao tác nào của người dùng (mục 4.3) |
| **Biểu đồ radar 7 Part** | Thang tối đa lệch nhau (6 câu so với 54 câu) làm méo hình, đánh lừa mắt |

---

## 8. LỘ TRÌNH

### Đợt Sổ tay v2.14 — đã triển khai local, chờ kiểm chứng dịch vụ thật

1. Thực hiện modal theo mục 4.6 và các trường/hợp đồng AI ở mục 6.2, 6.5; giữ giao diện danh sách hiện có.
2. Sửa ngày ôn/backup/API, cập nhật lịch ôn trên bản ghi mới nhất và khôi phục nhãn nguồn đáp án trong phiên ôn.
3. Đồng bộ prompt/grounding với phạm vi một câu; sửa giới hạn văn bản ghép, bổ sung kiểm thử cho các tình huống đã xác minh. Không gọi provider tính phí trong test tự động.
4. Đã chạy typecheck/lint, frontend/backend/database tests, Playwright và build cho triển khai local. Test AI dùng transport giả, test đồng bộ API/SQL không thay thế kiểm chứng Supabase thật. Còn kiểm chứng provider thực tế, staging và tình huống nội dung thực dài trước khi công bố public.

Các việc đã thống nhất cho đợt ổn định dùng cá nhân (Pomodoro ghi thời gian thực/tách bộ đếm theo danh tính, cửa sổ đề mới và gợi ý Part, launcher kế thừa `backend/.env`) giữ trong backlog sau khi chốt Sổ tay. Tối ưu bundle, kiểm chứng dịch vụ thật và chuẩn bị public là đợt riêng.

### Đã hoàn thành

- Nền tảng React, Vite, Tailwind; layout sidebar và topbar; chế độ sáng và tối.
- Lưu trữ LocalStorage, xuất nhập JSON, dữ liệu mẫu tùy chọn.
- Engine quy đổi ETS; ghi nhận Full Test và Part lẻ.
- Streak, khiên bảo vệ, Rank Tier, đếm ngược ngày thi, pháo giấy khi phá kỷ lục.
- Sổ tay lỗi sai với sáu nhóm nguyên nhân và bộ lọc.
- Phân tích: timeline, ma trận 7 Part, bảng lịch sử, theo dõi làm lại đề.
- Bộ đếm nhịp làm bài với năm chế độ.
- Tài liệu: quy đổi điểm, đối chiếu chứng chỉ quốc tế, chiến thuật, checklist.
- Chẩn đoán lỗi theo nguyên nhân, lịch ôn giãn cách, phát hiện tái phạm, màn hình Kế Hoạch.

### Vòng sau — đóng vòng lặp học tập

Đã xong:

- ~~Chẩn đoán theo nguyên nhân trong Phân Tích~~
- ~~Bộ đếm nhịp lưu dữ liệu và truyền thời gian sang Nhập Điểm~~
- ~~Dashboard và thang trục biểu đồ tính theo `targetScore`~~
- ~~Cấu trúc hóa dữ liệu luyện Part lẻ (nhiều Part một buổi)~~
- ~~Dọn điều hướng còn sáu mục, thêm màn hình Kế Hoạch~~
- ~~Phiên Ôn Tập và lịch giãn cách cho Sổ tay~~
- ~~Phát hiện tái phạm~~
- ~~Tổng Quan đổi vai thành bảng lệnh~~ — **đã thử, đã gỡ bỏ**, xem hộp ghi chú mục 4.1
- ~~Sửa được bản ghi lỗi sai và buổi học~~ — nút bút chì ở bảng lịch sử (Phân Tích) và trên từng thẻ Sổ tay. Sửa buổi học dùng lại form Nhập Điểm, giữ nguyên id/createdAt, quy đổi lại điểm, **không** chạm streak hay pháo giấy. Sửa thẻ lỗi giữ nguyên trạng thái và toàn bộ lịch ôn giãn cách.

Đã xử lý tiếp:

8. ~~Ma trận 7 Part và độ ổn định chuyển sang tối đa năm đề mới gần nhất.~~
9. ~~Mức vượt giờ từng pha từ dữ liệu Bộ đếm nhịp (từ ba lượt có đánh dấu pha).~~
10. ~~Từ vựng theo ngày và heatmap 12 tuần ở Phân Tích, giữ lưới Tổng Quan.~~

### Trước khi mở công khai

15. ~~Lớp migrate schema và xác thực dữ liệu nhập.~~ Gói v2 chuyển từ các khóa v1 và kiểm tra toàn bộ tệp sao lưu trước khi khôi phục.
16. ~~Routing cho sáu màn hình và ba trang công khai.~~
17. ~~Rank Tier tính tương đối theo `targetScore`.~~
18. ~~PWA cài được nhưng cần mạng.~~ Đã có manifest, icon 192/512 và service worker network-only; không cache dữ liệu học. Chân trang hiển thị trạng thái lưu trữ thực tế.
19. ~~Onboarding, routing, cấu hình ESLint/Playwright và CI.~~ Đã có thẻ bắt đầu cho người mới, URL riêng cho sáu màn hình và ba trang công khai, kiểm thử trình duyệt ở 375/768/1024/1440 và zoom 125%. Bản đầu chỉ tiếng Việt; i18n tiếng Anh sau ra mắt.
20. Kết nối Supabase staging/production và FastAPI; kiểm tra OAuth, đồng bộ hai tài khoản/hai thiết bị, Turnstile và quota AI thật. Beta dùng subdomain miễn phí; email OTP/SMTP và tên miền riêng là lựa chọn sau.
21. Điền tên đơn vị vận hành và email hỗ trợ trong `VITE_OPERATOR_NAME`/`VITE_SUPPORT_EMAIL` trước khi công bố trang pháp lý; hiện dùng nội dung tạm có ghi rõ chưa có kênh liên hệ.

---

*Tài liệu này là nguồn sự thật cho quyết định sản phẩm. Khi code và spec lệch nhau, sửa một trong hai — đừng để lệch.*
