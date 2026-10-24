# ĐẶC TẢ SẢN PHẨM — TOEIC PROGRESS

> **Rà soát local 24/10/2026:** xem [FINAL_READINESS_2026-10-24.md](FINAL_READINESS_2026-10-24.md). Nháp giữ cả số câu chưa áp dụng; modal lồng nhau chỉ cho lớp trên nhận bàn phím. Ảnh kết quả trích thời gian đã làm trong cùng lần gọi AI, yêu cầu xác nhận, lưu giây chính xác và null cho phần không biết trong `resultTiming` của Full Test; không suy ra từ thời gian còn lại hoặc giới hạn đề. Điểm/thời gian riêng lẻ không đủ kết luận nguyên nhân lỗi. Không cần migration cho trường này; bản sửa chưa được triển khai production.

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

**Điều chỉnh giới hạn 09/10/2026 (ưu tiên quyết định này):** giữ bố cục và phong cách Neo hiện hữu; chỉ bỏ thanh “Cần ôn tập”, đổi nhãn “Phong độ” thành “So với bài đầu”. Thẻ Bài thi gần nhất giữ khung Listening/Reading, icon, màu và thanh điểm; bỏ dòng thiếu điểm tới trần và % trần. Ô nhỏ chỉ hiện số câu đúng khi có dữ liệu (giữ 0 thật), không lặp điểm /495 khi số câu chưa nhập. Công thức thống kê giữ nguyên; chỉ lấy Full Test L&R đang hiệu lực, bỏ kết quả S&W và bản ghi đã xóa. Trục biểu đồ bao phủ cả điểm thấp và mục tiêu. Ngày học lấy cùng nguồn với streak (buổi học, từ vựng có count >0, thời gian luyện thực), không lấy ngày khiên hoặc dấu lastStudyDate cũ thay dữ liệu thật. Thiếu điểm kỹ năng thì hiện “Chưa ghi”, không tự điền 0. Không thay đổi kết quả đã lưu. Ở desktop ≥1280px, thẻ tăng nhẹ khoảng đệm/cỡ số; lưới hai cột tận dụng chiều cao còn lại của màn hình, đo lại khi resize/zoom hoặc nội dung phía trên đổi. Đường biểu đồ vẽ 700ms khi vào trang, chuyển dữ liệu 300ms khi đổi bộ lọc; điểm và nhãn số nằm ở lớp tĩnh độc lập để luôn đọc được. Tắt chuyển động theo prefers-reduced-motion; nút nhấn nhẹ và thẻ không nhấc lên khi hover. Biểu đồ tiếp tục flex co giãn theo lưới, hai cột chung chiều cao bố cục; thẻ Bài thi gần nhất và hai ô kỹ năng cao theo nội dung, không bị giãn theo biểu đồ. Trước nút chi tiết có một dòng khoảng cách từ bài gần nhất tới mục tiêu hồ sơ, hoặc “Đã đạt mục tiêu” khi đủ điểm; khi khung quá thấp nội dung được cuộn tự nhiên, không cắt hoặc ép biểu đồ thấp hơn mức tối thiểu.

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

**Chốt giao diện 09/10/2026:** giữ bố cục Neo cũ, tay kéo (có thể bấm để chuyển lên/xuống hoặc dùng phím mũi tên trong cùng nhóm trạng thái), màu loại mục tiêu và nhóm đã hoàn thành riêng. Trong tab Tất cả, nhóm hoàn thành thu gọn mặc định, chỉ hiện số lượng; mở bằng chuột hoặc bàn phím. Đổi tuần hoặc quay lại tab Tất cả sẽ thu gọn lại. Tab Đã xong hiển thị đầy đủ danh sách. Bỏ banner gợi ý mục tiêu và phần đếm ngược ngày thi trong thẻ Chuyên Cần Tuần. Modal thêm/sửa rút gọn nhãn, luôn hiện chỉ tiêu (kể cả luyện Part); màu thẻ và ghi chú đặt trong mục tùy chọn thu gọn. Mẫu nhanh vẫn giúp điền sẵn. Chỉ tạo mục tiêu theo dõi tự động (Full Test, bài luyện Part, phút học); không có nút tick hoàn thành. Các cờ hoàn thành thủ công cũ không ghi đè tiến độ tự động. Mục tiêu CUSTOM cũ vẫn đọc được và có thể chuyển loại theo dõi khi sửa, nhưng không được tạo mới hoặc sao chép sang tuần khác. Thẻ task bỏ bóng và hiệu ứng nhấc lên khi hover; khung danh sách vẫn giữ bóng Neo. Modal hiện nhẹ 160ms, thanh tiến độ chuyển 350ms; tắt chuyển động khi người dùng chọn giảm chuyển động. Mốc phút học ở dải tóm tắt theo mục tiêu phút của tuần (lấy mốc cao nhất nếu có nhiều mục tiêu), không có thì dùng hồ sơ. Giới hạn 6 mục tiêu đang làm áp dụng cả khi sửa chỉ tiêu. Kiểm tra giới hạn 100 mục tiêu/tuần và kích thước UTF-8 của bản ghi trước khi lưu để phù hợp API đồng bộ. Lưu lỗi giữ nguyên bản nháp; từ chối ghi đè tuần đã thay đổi hoặc ghi sang tài khoản khác. Tiến độ bỏ qua buổi học đã xóa, mỗi buổi chỉ tính một lần cho một Part; bài luyện đo thời gian chưa chấm vẫn được tính khi có bản ghi phiên tương ứng. Nút ghi kết quả mở đúng Part của mục tiêu. Đồng bộ DB thực tế được xử lý ở giai đoạn sau.

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

**Bản duyệt 09/10/2026:** ba tab Luyện tập/Lịch sử/Thống kê; giữ top bar ứng dụng. Đồng hồ và nút thao tác nằm gọn trong màn hình, mẹo luyện thu gọn; không lặp nhãn mục tiêu hoặc animation gây xao nhãng.

- **Đồng hồ gọn:** Reading và Pomodoro cùng dùng thanh thời gian còn lại, đầy khi bắt đầu và giảm về 0; không dùng vòng tròn. Bỏ nhãn “Sẵn sàng”, chỉ hiện thời gian đã dùng khi lớn hơn 0. Nút thống nhất “Bắt đầu”/“Tạm dừng”/“Tiếp tục”. Reading giữ tên Part, số câu và mục tiêu giây/câu. Pomodoro không lặp tên pha/thời lượng dưới nhóm chọn pha; nút “Điều chỉnh” có chữ, ở cạnh nhóm trên màn hình rộng và chuyển xuống dưới khi khung hẹp. Nhóm pha căn giữa theo trục đồng hồ, không bị nút điều chỉnh kéo lệch và không dịch trục khi bắt đầu chạy. Bỏ ô biểu tượng đứng riêng; dòng tên Part/số câu cùng cỡ chữ, chỉ tên Part nhấn đậm. Màu pha phân biệt tập trung (hồng đỏ), nghỉ ngắn (mint), nghỉ dài (xanh trời); Màu nhận diện chế độ duyệt 10/10: Part5 hổ phách, Part6 xanh dương, Part7 tím (cả ba dạng), Reading75p xanh ngọc, Pomodoro hồng san hô. Mỗi nút có nền tint rất nhạt/chữ theo màu, Part7 luôn giữ tên Part7 cùng Đoạn đơn/Đôi-ba/Toàn bộ; đang chọn có nền đậm hơn và viền/bóng Neo; tên chế độ và thanh tiến độ cùng tông. Giữ số đồng hồ trung tính, nền thẻ trắng/tối; các pha nghỉ Pomodoro vẫn theo màu pha đã nêu. Chuyển màu150ms, không nhấp nháy và tắt khi reduced motion. Bố cục luyện được duyệt: vùng luyện tối đa 760px ở giữa, nhóm chế độ cùng trục đồng hồ và vẫn căn giữa khi xuống dòng; khoảng cách thiết lập/đồng hồ/nút gọn hơn. Nút loa chỉ biểu tượng ở hàng tab, có aria-label/trạng thái bật tắt và tooltip; không chen dòng giữa nhóm Part và thiết lập. Thẻ Đã luyện hôm nay nằm cạnh loa, cộng thời gian thực đã lưu của Reading và Pomodoro tập trung; không tính nghỉ, phiên chưa lưu, bản xóa hoặc ngày khác, không đếm thêm sessions ghép đôi. Hiện 0 phút khi chưa luyện, dưới một phút ghi Dưới 1 phút; cập nhật khi lưu/xóa/đồng bộ local và đổi ngày. Thanh chuyển tiếp nhẹ, tôn trọng reduced motion.

- **Chế độ:** Part 5 (30 câu/12 phút), Part 6 (16/8), Part 7 đoạn đơn (29/25), đôi/ba (25/30), toàn Part 7 (54/55), Reading (100/75) và Pomodoro. Part7 chọn Toàn bộ trước Đoạn đơn và Đôi/ba; bỏ mục trống có thể chọn. Hộp Điều chỉnh chỉ đổi thời gian với P5/P6/P7 toàn bộ/Reading (số câu cố định 30/16/54/100). P7 đơn/đôi-ba mặc định 29/25, được giảm số câu thực tế xuống 1–29/1–25 để luyện một phần, giữ số nguyên và mục tiêu giây/câu theo số đã chọn. Quy tắc áp dụng cả trong logic cấu hình. Các draft cũ đang lưu và kết quả cũ giữ số câu thực tế, không sửa hồi tố. Pomodoro giữ thiết lập tập trung, nghỉ ngắn, nghỉ dài và số phiên trước nghỉ dài.
- **Mục tiêu luyện:** thời gian gợi ý của ứng dụng, không gọi là “Chuẩn ETS” cho từng Part. Full Reading mặc định 75 phút, nhưng lượt luyện này không phải Full Test L&R và không được tự quy đổi thành điểm TOEIC.
- **Vòng đời đồng hồ:** tính theo mốc thời gian, không dựa vào số lần callback. Tạm dừng không tăng thời gian đã dùng; tab ngủ chỉ tính tới hạn định, không ghi toàn bộ thời gian vắng mặt. Bản nháp được giữ theo tài khoản trên máy, khôi phục khi đổi trang/tải lại; đổi chế độ hoặc làm lại khi có phiên chưa lưu cần xác nhận. Không mất phiên khi chuyển giữa ba tab. Space là bắt đầu/tạm dừng, không tự nộp bài hoặc tác động khi đang nhập form.
- **Kết quả:** tên đề dùng picker chung; không thêm tiền tố `[Tốc độ]` vào tên nguồn. Ô số câu đúng để trống, chỉ nhận số nguyên hợp lệ, không điền sẵn 80% hoặc tự kẹp số sai vào khoảng. Có thể lưu thời gian chưa chấm rồi bổ sung/chỉnh kết quả từ lịch sử; chưa chấm không thành 0% và không vào biểu đồ độ chính xác.
- **Lưu nhất quán:** lượt mới dùng cùng ID dành riêng trong collection `pacingRuns` và `sessions`, ghi hai collection qua một giao dịch localStorage. Lưu lại cùng ID không tạo bản ghi trùng; bản bị xóa không được phục hồi từ draft cũ. Thời gian buổi học là thời gian thực, không làm tròn lên ít nhất một phút. Bổ sung điểm cập nhật bản liên quan, từ chối ghi đè phiên đã sửa/xóa ở nơi khác.
- **Pomodoro:** kết thúc sớm lưu thời gian thực, không tăng số phiên hoàn thành; phiên đủ thời gian được ghi một lần và có nút chuyển sang nghỉ/tập trung mới. Lượt nghỉ có lịch sử riêng nhưng không tính là buổi học, phút tập trung hoặc streak. Dữ liệu cũ giữ nguyên, không tự đoán lại các phiên đã ghi trước đây.
- **Xóa:** hỏi xác nhận, xóa cả lượt và buổi học khi có liên kết chắc chắn; liên kết bản ghi cũ dùng tên chế độ lịch sử cố định (Part 7A/7B/Part 7), không phụ thuộc nhãn hiện tại và vẫn giữ liên kết sau sửa điểm/đổi tên. Lượt cũ chỉ ghép qua ID phát sinh/thời điểm/loại/tên nguồn phù hợp duy nhất; không đoán ghép nhiều bản ghi. Nếu không xác định được thì ghi rõ chỉ xóa lượt.
- **Lịch sử chính:** kết quả đã đo được sửa qua cùng form kết quả, giữ thời gian đo và cập nhật hai bản ghi cùng phiên bản. Xóa buổi học ghép đôi từ Lịch sử chính cũng xóa lượt đo; lỗi Sổ tay kế thừa tên nguồn được giữ lại, không bị mất nguồn khi buổi học bị xóa. Kiểm tra cả phiên bản lượt và buổi học khi sửa, không ghi đè thay đổi mới ở tab khác.
- **Lịch sử:** toolbar gom tiêu đề/tìm kiếm giới hạn320px/lọc chế độ/Luyện mới trên một hàng khi đủ rộng, tự xuống hàng khi hẹp. Cột thời gian xám đậm, tốc độ xanh dương, kết quả xanh ngọc; đơn vị và mẫu số nhẹ hơn. Nhãn/số căn giữa theo cột trên desktop, mobile vẫn theo nhóm có nhãn; Chưa chấm/missing giữ xám. Không hiện bộ lọc toàn số 0 khi chưa có dữ liệu; năm lượt/trang, tìm/lọc toàn bộ dữ liệu. Desktop dùng bảng có tiêu đề cột, khung hẹp chuyển thành thẻ; nhãn loại lượt dùng màu nhẹ Reading/tập trung/nghỉ, không lặp tên Part dưới tiêu đề. Kết quả chỉ hiện số câu đúng/tổng câu; phần trăm nằm trong tab Thống kê. Đơn vị gọn `s`, `s/câu`, giữ số và đơn vị cùng dòng. Thời gian dưới một giây hiển thị `<1 s`, tốc độ dương dưới 0,1 hiển thị `<0,1 s/câu`; không làm tròn thành 0. Lượt chưa chấm ghi rõ, phiên Pomodoro chỉ báo hoàn thành khi có bằng chứng `finishedNaturally`. Lịch sử buổi học đọc kết quả tổng Reading từ lượt ghép đôi, không bịa chi tiết từng Part. Bảng và hộp chi tiết cùng đọc kết quả tổng từ lượt ghép đôi. Bài tùy chỉnh vượt số câu của một Part vẫn giữ kết quả tổng ở lượt đo, không tạo `practiceParts` vượt giới hạn schema.
- **Thống kê:** một khung biểu đồ với bộ chọn Thời gian mỗi câu/Độ chính xác; mỗi lần chỉ hiện một chỉ số và một trục Y. Mặc định cột thời gian (s/câu), đổi sang đường chính xác (%); vùng vẽ cao 260px, nền trắng/tối trung tính, viền xám mảnh 1px; màu chỉ nhấn ở cột/đường và nút chỉ số đang chọn, không bóng ở thẻ biểu đồ; khung ngoài giữ phong cách Neo, không có viền màu trang trí phía trên; tiêu đề 16px đậm, giá trị 14px đậm, chữ trục 12–13px, dark mode riêng. Khung dùng toàn bộ chiều ngang, không cuộn ngang; hai nút chọn chỉ số đặt ngay trong khung, có trạng thái chọn và focus bàn phím. Đổi chỉ số giữ nguyên chế độ, khoảng ngày và trang hiện tại. Phân trang chung tối đa 10 lượt/trang, Trước/Sau đổi nhóm lượt cho cả hai chỉ số; ghi rõ đang xem a–b/tổng lượt. Mặc định mở trang chứa lượt mới nhất, đổi chế độ/phạm vi về trang mới nhất và tự giới hạn trang khi dữ liệu bị xóa. Trục Y tốc độ tự co giãn theo giá trị thực trong phạm vi đang lọc, bắt đầu từ 0, chia mốc tròn 1/2/5 × lũy thừa 10 và chừa khoảng trên cột cao nhất; trần tối thiểu 1 s/câu để giá trị rất nhỏ vẫn dễ đọc. Giữ cùng thang khi đổi trang. Mục tiêu không kéo trần lên; chỉ vẽ đường mục tiêu và ký hiệu nét đứt khi mục tiêu nằm trong thang, vẫn giữ chữ mục tiêu ở tiêu đề. Đường chính xác xanh đậm 3px, điểm trắng có viền xanh (dark mode dùng nền tối trung tính); lưới nét đứt nhẹ. Tiêu đề và mục tiêu/số lượt đã chấm trên cùng hàng, tự xuống dòng khi hẹp; bỏ các dòng giải thích cao/thấp và chân trang lặp nội dung trục. Bộ lọc Chế độ/Phạm vi chỉ có Hôm nay (mặc định), Hôm qua, 3 ngày gần nhất và 7 ngày gần nhất; không chọn ngày thủ công hoặc trộn bộ lọc số lượt. Ngày tính theo lịch địa phương; Hôm qua chỉ gồm đúng ngày liền trước, 3/7 ngày gồm hôm nay và 2/6 ngày trước đó. Loại ngày không hợp lệ/ngày tương lai. Hôm nay/Hôm qua trống ghi rõ theo ngày; nút Xem 7 ngày gần nhất chỉ đổi phạm vi khi người dùng bấm, không tự nới bộ lọc. Khi 7 ngày trống, vẫn có nút luyện chế độ đang chọn. Không gom lần đầu/tốt nhất và không cắt ngầm lượt trong khoảng; các lượt được chia trang. Mỗi chế độ riêng (Part5/Part6/ba dạng Part7/Reading75p), không trộn Pomodoro; cả hai chỉ số dùng cùng dữ liệu và thứ tự. Chừa khoảng hai mép theo số lượt để cột/điểm và nhãn ngày nằm thoáng, trục X giữ cùng các mốc khi đổi chỉ số. Không tô vùng gây hiểu nhầm. Giữ 0 câu đúng là kết quả thật; loại thời gian/số câu không hợp lệ thay vì thay bằng 0. Trục X hiện ngày dd/mm và thứ tự lượt trong toàn bộ dữ liệu hợp lệ của chế độ, giữ số khi đổi phạm vi; đây không phải số lần làm đề. Tự giảm số mốc ngày khi màn hình hẹp/nhiều lượt, luôn giữ đầu/cuối. Trục Y tốc độ từ 0, số gọn; đơn vị s/câu nằm ở mục tiêu và tooltip. Trục Y chính xác 0–100%. Tooltip có ngày đầy đủ, giờ ghi nhận, tên đề, thời gian, tốc độ và số câu đúng. Biểu đồ cột hiện số trên tất cả cột khi có tối đa năm lượt; khi nhiều hơn chỉ nhấn cột mới nhất. Biểu đồ đường chỉ nhấn lượt mới nhất có điểm. Chừa khoảng trống mép để không cắt nhãn. Đường nét đứt có chú thích mục tiêu gợi ý ngay trong thẻ tốc độ, không lặp ở chân trang. Khi xem độ chính xác, ghi số lượt đã chấm/tổng lượt; lượt chưa chấm giữ khoảng khuyết, tooltip ghi rõ. Khi chỉ có một lượt hoặc một lượt đã chấm, thông báo chưa đủ dữ liệu theo dõi xu hướng. Giá trị tốc độ dương dưới 0,1 ghi `<0,1`, không làm tròn thành 0.
- **Giới hạn:** không thêm bảng DB/endpoint; lịch phiên trên máy không đồng bộ giữa thiết bị. API, RLS và đồng bộ trên dịch vụ thật vẫn cần kiểm chứng riêng. Không hiển thị phân tích vượt giờ từng pha khi lượt mới chưa thu thập dấu mốc pha; dữ liệu `phases` cũ được giữ để tương thích.

### 4.4. Nhập Điểm (Session Logger — modal)

- **Full Test:** tên nguồn đề, ngày, thời gian làm; số câu đúng từng Part (Listening 6/25/39/30, Reading 30/16/54) để ước tính tham khảo. Có tùy chọn nhập điểm Listening/Reading hoặc chỉ tổng từ kết quả đề; điểm nhập được ưu tiên. Chi tiết Part không bắt buộc khi nhập điểm trực tiếp.
- **Luyện Part lẻ:** chọn Part, số câu làm, số câu đúng, thời gian. Vẫn tính vào streak. **Dữ liệu phải lưu có cấu trúc** (`practicePart`, `practiceCorrect`, `practiceTotal`), không nhét vào chuỗi `notes` như hiện tại — nếu không nó vĩnh viễn không vào được biểu đồ.
- **Nhật ký từ vựng (duyệt 09/10/2026):** biểu đồ toàn chiều ngang phía trên, bảng Ngày/Nguồn học/Part/Số từ/Thao tác bên dưới (5 ngày/trang). Giữ kiểu Neo. Lọc mặc định 14 ngày lịch gần nhất, popup chọn nhanh 7/14/30 hoặc Từ ngày–Đến ngày; Áp dụng mới đổi, Hủy/Escape giữ phạm vi cũ. Lọc cùng biểu đồ/lịch sử/trung bình/kỷ lục; tổng tích lũy vẫn toàn bộ. Ngày thiếu ghi nhận là khoảng trống, không là 0. Khoảng dài giảm nhãn để không chồng nhau, tooltip và bảng vẫn đọc được dữ liệu. Nhãn “TB mỗi ngày ghi nhận”. Mỗi ngày lưu một tổng nguyên 1–10000; cập nhật thay số cũ. Ghi nhanh giữ metadata; Sửa mở modal có nguồn học tối đa 300 ký tự và nhiều Part 1–7 tùy chọn, không tạo buổi thi/điểm. Các tên nguồn đã có được gợi ý. SourceName/parts đi qua lưu local, backup và sync; tương thích bản cũ. Cột mọc 500ms, nhãn số tĩnh và hỗ trợ giảm chuyển động. Trùng ngày cũ được tổng hợp khi xem; cập nhật/xóa dùng tombstone tránh cộng đôi. Lưu lỗi hoặc dữ liệu vừa được sửa ở nơi khác giữ bản nháp. Xóa cập nhật lại streak.
- **Từ vựng:** tab thứ ba trong form Nhập Điểm. Ghi riêng theo ngày (`vocabLog: {date, count}` với `count` là số nguyên dương), không gắn vào buổi học và không thêm mục điều hướng. Trang Từ vựng dùng thanh đầu trang gọn: tiêu đề Từ vựng/tổng tích lũy bên trái, ngày/số từ/nút lưu bên phải; bỏ card viền/bóng, biểu tượng sách lớn và lịch đứng ngoài ô ngày. Chú thích “Cập nhật sẽ thay số cũ.” chỉ hiện dưới ô nhập khi ngày được chọn đã có ghi nhận, liên kết với ô số từ qua aria-describedby. Lịch sử mặc định thu gọn thành hàng tiêu đề/số ngày trong khoảng/mũi tên; bấm cả hàng hoặc Enter/Space mở/đóng. Nhớ trạng thái trên máy qua khóa toeic_vocab_history_open_v1; localStorage không khả dụng vẫn mở/đóng được trong phiên. Khi mở giữ phân trang 5 dòng, không mất trang khi thu rồi mở lại; đổi khoảng ngày vẫn về trang đầu. Bộ lọc từ vựng là menu 7/14/30 ngày gần nhất và Chọn khoảng ngày, mặc định 14; preset áp dụng ngay, chỉ lựa chọn tùy chỉnh mới mở popup hai ô ngày. Khoảng tùy chỉnh tối đa 30 ngày tính cả hai đầu; kiểm tra ngày hợp lệ, không đảo ngày, không vượt hôm nay; hiển thị lỗi ngay và khóa Áp dụng khi sai. Ô Đến ngày giới hạn theo ngày bắt đầu +29 và hôm nay; không tự cắt hoặc áp dụng bản nháp sai. Hủy/Escape giữ bộ lọc cũ và trả focus về menu. Popup đổi vị trí/kích thước theo màn hình, không mất bản nháp khi đổi chiều cao. Giữ nguyên cơ chế lưu tổng theo ngày, nguồn/Part và kiểm tra phiên bản; biểu đồ/lịch sử cùng dùng phạm vi đã áp dụng.
- **Nhập điểm → Sổ tay (duyệt 11/10/2026):** bỏ form ghi câu sai riêng trong modal điểm. Nút chính **Lưu kết quả** chỉ ghi buổi học; nút phụ **Lưu & thêm câu sai** lưu thành công rồi chuyển tới form Sổ tay hiện có, điền tên đề và liên kết `sessionId`. Chân form giữ nút lưu và lỗi luôn thấy được; chỉ phần nhập liệu cuộn. Không gọi AI tự động. Vẫn chọn Part trước khi ghi câu sai. Thêm tiếp trong cùng form giữ nguồn/liên kết; đóng rồi mở ghi chú độc lập không mang theo `sessionId`. Đổi tên nguồn sang đề khác trong bản nháp mới cũng bỏ liên kết với buổi học cũ. Kiểm tra dữ liệu/lưu thất bại giữ form điểm và không mở Sổ tay. Enter trong ô nhập thực hiện lưu kết quả thông thường; Enter chọn gợi ý tên đề giữ hành vi combobox. Nút lưu không hứa giữ streak; streak vẫn suy ra từ ngày học thực tế.
- **Làm lại đề:** nhận diện tên đề trùng, đánh số lần làm, so sánh với lần trước và lần đầu.
- **Mặc định form để trống.** Điền sẵn điểm cao khiến một cú bấm nhầm ghi nhận kỷ lục giả.

#### Lịch sử luyện đề — bản duyệt 09/10/2026

**Tinh chỉnh duyệt 10/10/2026:** nhóm loại bài chung khung, lựa chọn xanh và badge số lượng. Cột Ngày/L/R/Tổng/chênh lệch căn giữa với nhãn cột, Tên đề căn trái. Tên đề và L/R 16px semibold, Tổng20px đậm; ngày/lần làm/thời lượng14px. Giữ khoảng cách dòng dữ liệu, thu gọn phần đầu/chân bảng và hàng tiêu đề cột; khoảng trống đáy trang64px, desktop80px để thoáng hơn phía trên. Chân bảng nền xám nhạt, nhấn số bản ghi/trang hiện tại và nút chuyển trang có viền/trạng thái vô hiệu hóa. Giữ màu điểm, phân trang5bài và logic hiện có.

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

**Bản duyệt ngày 09/10/2026:** phân tích từng đề, hai thẻ biểu đồ cạnh nhau trên desktop, xếp dọc trên điện thoại, giữ top bar và khối “Ưu tiên luyện tiếp”. Thẻ dùng chung `CARD`; Listening chàm, Reading xanh ngọc.

- **Đề:** một bộ chọn có tìm kiếm và hỗ trợ bàn phím, chỉ liệt kê tên đề. Không đưa nguồn chỉ có Luyện Part hoặc SW vào Phân tích Full Test; tên có cả Full Test L&R và luyện Part vẫn giữ kết quả Full Test. Nguồn chỉ có ghi chú chưa xác định loại vẫn theo quy tắc thiếu dữ liệu hiện có. Mặc định đề có lượt Full Test L&R mới nhất. Chuẩn hóa Unicode/khoảng trắng/hoa thường theo quy tắc tên nguồn dùng chung; tên đề chỉ nằm trong bộ chọn, không lặp tiêu đề lớn ngoài card. Đề chỉ có ghi chú vẫn chọn được. Khi không có kết quả thi, dùng nguồn đầu tiên có sẵn; không gán lỗi chưa có nguồn cho một đề.
- **Lần làm:** mặc định lượt mới nhất của đề; luôn hiện bộ chọn để người học biết có thể xem từng lần. Đề chỉ có một lượt hiển thị Lần N · ngày làm · Mới nhất (thông thường N=1, giữ số lần đã ghi khi các lượt cũ không còn). Đề chưa có kết quả hiển thị Chưa có lượt làm và vô hiệu hóa bộ chọn. Đổi đề luôn trở về lượt mới nhất. Sắp xếp ngày làm, thời điểm tạo và ID; cùng ngày vẫn phân biệt được các lần. Số lần dùng `computeSessionAttemptMap` chung với Lịch sử, giữ số đã ghi và suy luận cho bản cũ, không trộn SW/Part practice hoặc bản ghi đã xóa. Lượt đã chọn vừa bị xóa thì trở về lượt mới nhất còn lại của cùng đề.
- **Độ chính xác 7 Part:** lấy chi tiết của đúng lượt được chọn, trục 0–100%, nhãn phần trăm tĩnh, tooltip số câu đúng/max. Badge “Lần N · dd/mm/yyyy” ở góc phải thẻ, xuống dòng trên màn hình hẹp. Điểm Listening/Reading lấy riêng từ lượt đó, thiếu thì “Chưa ghi”; không lấy dữ liệu lần cũ bù vào. Lượt chỉ có tổng điểm hiện “Lượt này chưa có chi tiết Part” và nút “Bổ sung chi tiết” mở sửa đúng lượt đó, giữ ID/ngày/số lần thay vì tạo thêm lượt. Đề chưa có kết quả vẫn có nút Nhập kết quả. Không tính trung bình các lượt trên trang này.
- **Lỗi đã ghi của đề:** donut gộp mọi ghi nhận lỗi còn tồn tại theo tên đề đã chọn, qua mọi lần làm và trạng thái ôn. Đổi Lần làm không đổi donut. Màu cố định cho sáu nhóm nguyên nhân; số tổng là số ghi nhận, không suy diễn thành toàn bộ câu sai khi thi. Chân card có icon và dòng đậm màu hổ phách “Gồm các lần làm của đề”, gắn aria-describedby với donut; không thêm badge ngày làm hoặc khối chú thích phía trên làm lệch bố cục.
- **Không lọc thời gian hoặc tổng quan nhiều đề:** bỏ lựa chọn Mới nhất/5 lượt/Tất cả và popup thời gian khỏi trang Phân tích. Không mang bộ lọc ngày ẩn sang Sổ tay. Từ vựng vẫn giữ cơ chế lọc ngày riêng. Tiến bộ qua nhiều đề nằm ở Tổng quan, các lượt cũ vẫn có trong Lịch sử.
- **Chuyển động:** cột mọc 500ms và donut vẽ theo chiều kim đồng hồ từ 12 giờ trong 600ms; khi đổi đề/lượt, hình chuyển đến tỷ lệ mới trong 300ms. Nhãn, tổng số và tên nhóm đứng yên. Màu nhóm lỗi giữ danh tính, hover sáng nhẹ, tắt ngay với prefers-reduced-motion.
- **Ưu tiên luyện tiếp:** Part yếu nhất từ lượt được chọn và nhóm lỗi thường gặp của đề; nhóm lỗi vẫn được nêu khi chưa có chi tiết Part. Nếu cả bảy Part đạt100% thì không đánh đỏ/gọi bất kỳ Part nào là yếu, hiển thị kết quả hoàn hảo và nhóm lỗi lịch sử nếu có. Không dự báo tăng điểm khi thiếu dữ liệu. Listening mở Pomodoro, Reading mở đúng bộ đếm Part 5/6/7.
- **Mở Sổ tay của đề:** mang tên đề sang Sổ tay, giữ toàn bộ lỗi của đề độc lập với Lần làm; người học có thể đổi/đặt lại bộ lọc. Bộ lọc điều hướng tạm thuộc tài khoản hiện tại, không đổi dữ liệu lưu, lịch ôn hoặc liên kết lỗi tới buổi học.
- Không đổi API/DB; trang này chỉ chọn dữ liệu đã lưu. Quy tắc thống kê first-attempt của Tổng quan/Kế hoạch giữ nguyên.

### 4.6. Sổ Tay Bẫy (Mistake Notebook)

**Bố cục duyệt 10/10/2026:** một khung Neo chứa tiêu đề Sổ tay bắt bẫy, nút Ôn thẻ/Ghi Chú Bẫy, bộ lọc và danh sách; bỏ khung danh sách lồng bên trong. Hàng trên là tiêu đề/hành động, hàng dưới gom nhóm trạng thái kiểu segmented với badge số lượng (Tất cả xanh dương, Đến hạn hổ phách, Thông suốt xanh lá; chọn thì tô nền, chưa chọn thì màu chữ/badge nhẹ), tìm kiếm và Lọc. Mỗi câu là một hàng mở rộng được, căn theo ba vùng Part / câu hỏi+tên đề / trạng thái+menu; không thêm hàng tiêu đề cột. Điện thoại đưa Part/trạng thái/menu lên trên câu hỏi và tên đề. Tìm kiếm luôn hiện trực tiếp, không lặp trong popup. Giữ logic ôn và thêm/sửa/xóa thẻ, màu hành động xanh/vàng; chân danh sách nền xám nhạt với khoảng thẻ đang xem và phân trang Trước/Sau. Menu không bị cắt bởi khung ngoài, có focus bàn phím và hỗ trợ giảm chuyển động.

**Phản hồi tiến độ duyệt 10/10/2026:** dùng dấu tick xuất hiện nhẹ220ms khi lưu thành công hoặc kết thúc phiên ôn; không âm thanh/confetti/animationlặp và tắt chuyển động khi prefers-reduced-motion. Lưu thủ công giữ màn hình Đã lưu sẵn có. Lưu & thêm tiếp xác nhận trong vùng tiêu đề4giây rồi trở lại tên form; bắt đầu nhập thẻ tiếp cũng tắt xác nhận, không tăng chiều cao header. Lưu rồi đóng form và đánh dấu Thông suốt có thông báo nhỏ4giây, đóng thủ công được, không chiếm chỗ hay đẩy danh sách. Chỉ xác nhận sau khi lưu local thành công; lỗi không hiện receipt thành công. Phiên ôn hiển thị số thẻ thực đã chấm và số câu đúng, không tính thẻ bỏ qua; nếu bỏ qua toàn bộ thì thông báo trung tính và không nói lịch ôn đã cập nhật. Ôn sớm đúng đáp án giữ lịch cũ thì kết quả ghi rõ Lịch ôn giữ nguyên. Không tăng điểm/streak/phần thưởng nhân tạo. So sánh bản nháp coi trường optional undefined và trường bị JSON bỏ đi là tương đương, vẫn chặn thay đổi nội dung thật ở nơi khác.

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
- **Nguồn đề (cập nhật 11/10/2026):** tên đề bắt buộc trong form thêm/sửa lỗi, chọn gợi ý hoặc nhập mới; gợi ý lấy từ các thẻ và lịch sử làm bài. Trim/gộp khoảng trắng, gom tên chỉ khác hoa/thường; không tự đoán tên từ nội dung AI. Thẻ cũ chưa có tên dùng `sessionId` tra buổi làm bài nếu còn. Lưu tên vào `sourceTestName` (tối đa 300 ký tự), chuỗi rỗng là chủ động bỏ nguồn; null/thiếu trường vẫn nhận nguồn cũ nếu có. Tên lưu trên thẻ không phụ thuộc việc còn lịch sử buổi học. Lưu & thêm tiếp giữ tên đề; tạo thẻ trong lúc lọc một đề điền sẵn đề đó. Có thể đổi tên đề qua Sửa; giữ lịch ôn. Thẻ cũ chưa gắn đề vẫn đọc/ôn bình thường, cần chọn hoặc thêm tên đề khi chỉnh sửa và lưu lại. Backup/schema API/SQL extra giữ trường mới, không cần migration. Tên đề là metadata người học, không gửi AI hoặc khiến model đoán lại đáp án.
- **Phần đầu trang (chốt phạm vi 08/10/2026):** giữ nguyên top bar toàn ứng dụng. Bỏ tiêu đề lớn lặp tên trang trong phần nội dung (vẫn giữ heading cho screen reader); gom tab trạng thái, tìm kiếm/Lọc và nút ôn/thêm vào thanh công cụ có thể xuống dòng. Nút ôn dùng nhãn ngắn "Ôn N thẻ". Thứ tự DOM theo thứ tự nhìn thấy, không đảo thứ tự bằng CSS.
- **Độ dài danh sách:** Sổ tay phân trang 5 thẻ, chân bảng ghi “1–5 / N thẻ” và Trước/Sau cùng số trang khi có nhiều trang. Đổi tìm kiếm/đề/Part/nguyên nhân/trạng thái hoặc Đặt lại trở về trang1. Xóa hay đổi trạng thái thẻ làm trang cuối hết dữ liệu thì quay về trang còn dữ liệu. Tìm kiếm, lọc, số đếm và phiên ôn dùng toàn bộ tập thẻ phù hợp, không chỉ trang đang hiện; chuyển trang không ghi dữ liệu hoặc gọi AI. Không có Xem tất cả/Thu gọn.
- **Trình bày (2026-10-07, đã duyệt mockup):** mỗi dòng chỉ có Part, câu hỏi (tối đa 2 dòng), trạng thái ôn bằng chữ ("Ôn hôm nay", "Quá hạn N ngày", "Ôn sau N ngày", "Thông suốt") và menu ⋯ (Ôn câu này, Sửa, Đánh dấu đã thuộc / Ôn lại từ đầu, Xóa). Mở dòng: đoạn trích, phương án A–D kèm nghĩa và từ loại viết tắt tiếng Anh (`prompt (adj): nhanh chóng`; Part 7 chỉ bản dịch), phương án đã chọn tô đỏ, đáp án tô xanh, một hộp "Mẹo 10s"; phần giải thích còn lại thu gọn sau "Xem giải thích". Viền đen dày chỉ ở khung danh sách và nút chính. Không còn nút một chạm Cần ôn/Thông suốt trên từng dòng.

- **Thẻ chưa có đáp án:** hiện "Chưa có đáp án", vẫn sửa/xóa được; không tính vào số thẻ đến hạn, không đưa vào phiên ôn và không cho đánh dấu đã thuộc. Sau khi bổ sung đáp án hợp lệ, thẻ cần ôn mới được xét theo lịch. Thiếu đáp án là trạng thái nội dung, không thêm một bậc lịch ôn.

#### Modal nhập lỗi — đã triển khai local theo bản duyệt

**Một form, hai cách hoàn tất (bản gọn duyệt 08/10/2026).** Người dùng mới mở form trống. **Lưu thủ công** ghi trực tiếp sau kiểm tra hợp lệ, không gọi AI hoặc bắt mở preview. **Phân tích với AI** mở bước kiểm tra kết quả trước khi lưu. AI và nhập thủ công dùng chung dữ liệu; không chuyển sang form dài khác khi AI lỗi. Bỏ mẫu minh họa khỏi form thường dùng.

**Bước 1 — Thêm lỗi sai**

1. **Câu hỏi + phương án:** một textarea để dán nguyên câu hỏi và các lựa chọn. Nhận `(A)`, `A.`, `A)`, `A:`; phương án có nhãn có thể cùng dòng. Không có nhãn: mỗi phương án một dòng, gán A–D theo thứ tự. Tách nội dung trên máy, không gọi AI hay tiêu quota chỉ để nhận diện phương án. Chỉnh câu hỏi/phương án trực tiếp trong ô dán; nếu tách không chắc thì báo lỗi tại đây và yêu cầu chỉnh trước phân tích. Không tự điền phương án thiếu hoặc lấy nội dung một câu khác làm phương án.
   Phía trên có ba ô **Part bắt buộc / Đề bắt buộc / Lỗi sai (tùy chọn)**. Chọn Part rõ ràng, không dùng suy đoán tự động; Đề chọn từ gợi ý hoặc **+ Thêm tên đề “…”**, không có lựa chọn bỏ nguồn trong form này. Chưa chọn Part/Đề thì chặn cả lưu thủ công và phân tích trước khi gửi AI, đưa focus tới ô thiếu. Desktop ba ô cùng hàng; điện thoại Part/Đề cùng hàng và Lỗi sai ở hàng sau. Ô Đề giữ nguyên khi mở; dropdown có ô tìm kiếm riêng ở đầu, dấu ✓ cạnh tên đang chọn, không có nút × bên ngoài. Escape/bấm ngoài hủy tên chưa chọn; tên mới chỉ lưu cùng thẻ, không tự tạo bản ghi điểm.
   **Lỗi sai** dùng các nhóm hiện có với nhãn gọn; để trống thì AI phân loại, lưu thủ công dùng Khác. Người học chọn nhóm thì giữ nguyên qua phân tích, kiểm tra và lưu; backend nhận `errorCategory` tùy chọn, ràng buộc enum output và giữ giá trị đó. Backend cũ chưa có capability `learner_error_category` thì frontend chỉ gửi hợp đồng cũ, vẫn giữ nhóm đã chọn ở thẻ. Bỏ mục **Ghi chú bổ sung** và các ô nhập Tag/Giải thích ở bước nhập; tag và lời giải AI hoặc dữ liệu cũ vẫn được giữ.
2. **Bạn đã chọn:** nút chữ A–D gọn (nhãn truy cập rõ, nội dung đầy đủ có trong ô dán), không lặp lại phương án thành bốn thẻ lớn. Các nút A–D hiện sẵn (Part 2 chỉ A–C), mờ và vô hiệu khi chưa tách được phương án tương ứng; hiện hướng dẫn dán câu hỏi khi chưa có nội dung. Không bắt chọn; bấm lần nữa bỏ chọn và lưu UNKNOWN. Không hiện nút Không nhớ/Bỏ trống; dữ liệu BLANK cũ vẫn giữ khi không thay đổi lựa chọn, không mặc định A. Part 2 chỉ có A–C. Không đánh dấu đúng/sai ở bước nhập.
3. **Lý do chọn (nếu muốn):** không bắt buộc, bắt đầu trống. AI không suy ra lý do/tâm lý nếu người học không viết.
4. **Đáp án đúng từ đề (tùy chọn):** thu gọn mặc định, bấm mới mở A–D. Chọn key thì summary hiện "Đáp án từ đề: B" và có Bỏ chọn; key là tùy chọn, không có thì AI tự giải khi đủ ngữ cảnh. Không có textarea lời giải nguồn mặc định. Transcript/đoạn đọc dán cùng câu hỏi trong ô chính; không có ô ngữ cảnh phụ trùng lặp. Part 1/7 có vùng ảnh theo hợp đồng mô tả ở dưới. Nếu phát hiện nhiều câu hỏi, yêu cầu giữ một câu trước khi gửi.
5. Khi cấu hình AI sẵn sàng và tài khoản có quyền, **Phân tích với AI** là nút nổi bật; **Lưu thủ công** (sửa thẻ: **Lưu thay đổi**) là nút viền phụ. Khi AI chưa sẵn sàng hoặc tài khoản chưa được cấp quyền, nút lưu thủ công nổi bật để người dùng vẫn tiếp tục nhập. Lưu thủ công không đưa nội dung tới provider. Nếu chưa chọn Part/Đề, báo lỗi và focus ô thiếu trước lưu; nếu thẻ cũ có giải thích không còn phù hợp sau sửa nội dung/lý do, mở kiểm tra và cảnh báo thay vì lưu âm thầm. Lưu mới thành công hiện xác nhận và **Thêm lỗi tiếp** (giữ tên đề và Part đã chọn, xóa câu/key/lựa chọn/lý do) hoặc Đóng; bấm liên tiếp không ghi trùng. Bỏ checkbox consent và banner quota/hướng dẫn dài khỏi form. Chỉ bấm Phân tích mới gửi nội dung; dán, sửa hoặc mở modal không tự gọi AI. Thông tin provider ở trang quyền riêng tư; hợp đồng API vẫn kiểm tra provider hiện tại (mục 6.5).

**Bước 2 — Kiểm tra và lưu**

- Mặc định chỉ hiện Part, câu hỏi/ngữ cảnh, phương án và nghĩa ngắn nếu có, phương án đã chọn, đáp án với nhãn nguồn, cùng **Mẹo 10s**. Lý do đã chọn, bản dịch, phân tích và từ vựng đặt sau **Xem giải thích**, thu gọn ban đầu. Không lặp lại nhãn nguồn bằng một đoạn cảnh báo riêng nếu không có thông tin thiếu/mâu thuẫn cần xử lý.
- Nguồn đáp án luôn rõ: **Đáp án từ đề** (`PROVIDED`), **AI đề xuất** (`AI_PROPOSED`) hoặc **Chưa có đáp án** (`MISSING`). Nhập thủ công là đáp án người học cung cấp, không tự tuyên bố đó là đáp án ETS đã kiểm chứng. Khi người học tự bổ sung thay vì lấy từ đề, dùng nhãn **Đáp án đã nhập**.
- **Sửa** cho chỉnh nội dung trong cùng bản nháp; giữ dữ liệu khi quay lại. Part/Đề/nhóm lỗi nằm ở đầu form nhập, không lặp thành khối chỉnh sửa trên màn hình kiểm tra. Part không xác định được thì yêu cầu chọn trước lưu, không âm thầm gán Part 5. Nhóm lỗi chưa xác định dùng Khác.
- Hành động chính **Lưu lỗi sai**, phụ **Lưu & thêm tiếp**, kèm **Quay lại**. Bấm lưu là xác nhận bản nháp; không thêm checkbox "đã kiểm tra". Lưu thành công mới đóng hoặc mở form tiếp theo; giữ Part và tên đề đã chọn, đưa focus vào ô câu hỏi/phương án. Chỉ nút thêm câu cùng bài Part 7 mới giữ bài đọc/ảnh; Part 1 xóa tranh cũ và vẫn hiện ô thêm tranh. Mở form mới sau khi đóng vẫn bắt chọn Part. Không ghi thẻ trùng khi bấm liên tiếp.
- AI lỗi, hết lượt hoặc tắt: giữ câu hỏi, phương án, lựa chọn, lý do và nguồn đáp án; cho tiếp tục thủ công. Bản nháp thủ công không hiện các mục giải thích AI giả. Vẫn lưu được khi chưa có đáp án, với nhãn và điều kiện ôn đã nêu ở trên.
- Lỗi tại trường liên quan, không dùng `alert()` cho kiểm tra form. Lưu thất bại giữ bản nháp và cho thử lại. Đóng bằng nút X, Escape hoặc bấm ngoài khi có nội dung chưa lưu phải xác nhận bỏ; chuyển giữa hai bước không mất dữ liệu.

**Giao diện đã duyệt ngày 08/10/2026**

- Giữ phong cách hiện tại: Plus Jakarta Sans, khung modal bo 16px, viền đậm và bóng lệch; khi AI sẵn sàng, Phân tích là nút tím có viền/bóng và Lưu thủ công là nút viền trung tính; khi AI chưa sẵn sàng, Lưu thủ công xanh ngọc. Modal desktop tối đa khoảng **740–768px**.
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

- **Một luồng ôn duy nhất:** trắc nghiệm khi đáp án khớp một phương án có thật; người học cũng có thể lật thẻ rồi tự chấm Quên / Khó / Tốt / Dễ. Thẻ có đáp án nhưng không đủ phương án để chấm dùng luồng tự chấm. Thẻ chưa có đáp án bị loại trước khi mở phiên. Chốt danh sách ID/thứ tự lúc mở; khi chấm, đọc bản ghi mới nhất và chỉ cập nhật trường lịch ôn, không thay toàn bộ thẻ bằng bản chụp cũ. Nếu câu hỏi/phương án/đáp án đã đổi trong khi ôn, yêu cầu tải lại thẻ trước khi chấm; thẻ bị xóa thì bỏ qua. Mặt thẻ bị giấu không nhận focus; khi lật, focus chuyển sang mặt đang hiện.
- **Nguồn đáp án:** thẻ `AI_PROPOSED` phải hiện nhãn AI đề xuất trong cả trắc nghiệm và lật thẻ; kết quả được chấm theo đề xuất đó, không gọi là đáp án nguồn đã kiểm chứng. Nhãn không hiện đáp án trước khi người học trả lời.
- **Lịch giãn cách (cập nhật 22/10/2026):** dùng năm bậc với khoảng hẹn 1 → 3 → 7 → 14 → 30 ngày, chỉ số 0–4. Với thẻ đến hạn: Quên (`AGAIN`) về bậc 0 và hẹn ngày mai; Khó (`HARD`) giữ bậc, hẹn `max(2, ceil(khoảng ngày của bậc hiện tại / 2))` ngày và không tự chuyển Thông suốt; Tốt (`GOOD`) tăng một bậc; Dễ (`EASY`) tăng hai bậc. Tốt/Dễ vượt bậc cuối mới chuyển Thông suốt và bỏ ngày hẹn. Trắc nghiệm đúng tương đương Tốt, sai tương đương Quên, giữ tương thích dữ liệu cũ. Nhãn lịch hiển thị ngày hẹn thực tế vì Khó có thể đổi khoảng hẹn mà giữ cùng bậc. Đây là lịch giãn cách đơn giản của sản phẩm, không tuyên bố triển khai SM-2 hoặc FSRS; không cần migration.
- **Ôn sớm** ("Ôn câu này" với thẻ chưa đến hạn hoặc đã thông suốt): sai/Quên thì đặt lại lịch về ngày mai; đúng/Khó/Tốt/Dễ giữ nguyên lịch, để không thể đẩy thẻ lên "Thông suốt" bằng cách làm nhiều lần trong một ngày. Muốn bỏ qua lịch thì dùng "Đánh dấu đã thuộc" trong menu ⋯.
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

- **Bộ quy đổi Raw sang Scaled** để thử "nếu đúng thêm năm câu Part 7 thì được bao nhiêu". Khởi tạo từ bài Full Test gần nhất có số câu nguyên hợp lệ 0–100; bỏ qua dữ liệu Raw lỗi khi tính, không xóa lịch sử. Bài mới đến cập nhật máy tính nếu chưa chỉnh tay; khi đã chỉnh giữ mô phỏng đến khi bấm Lấy từ bài thi. Không remount trang chỉ vì dữ liệu đổi trong cùng tài khoản, đổi tài khoản vẫn tạo trang mới. Hai nút chuyển tab công bố aria-pressed; nút cuối cột chuyển focus về nút Bảng đối chiếu. Nhãn phải phân biệt rõ đâu là kết quả thật, đâu là con số đang thử.
- **Bảng đối chiếu chứng chỉ quốc tế:** giữ bố cục/card/màu sắc và thao tác hiện tại, chỉ sửa nội dung. Mốc tổng TOEIC hiển thị gọn 120/225/550/785/945đ; điều kiện ngưỡng riêng Listening/Reading ghi một lần ở chú thích và trong tooltip của mốc. CEFR của máy tính xác định từ điểm ước tính từng kỹ năng, không suy ra chỉ từ tổng; dưới ngưỡng A1 ghi Dưới A1, không gán C2 từ TOEIC L&R. Giữ hàng vàng theo mức nghe/đọc tham khảo, bỏ nhãn điểm lặp trong hàng vì góc phải đã ghi điểm dự kiến. IELTS dùng các khoảng tham khảo không có dấu xấp xỉ, không gọi tương đương; VSTEP.3–5 chỉ có bậc 3/B1, 4/B2, 5/C1; TOEFL dùng thang 1–6 từ 21/01/2026, thang 0–120 có trong tooltip. Dòng nhắc dưới tiêu đề ghi rõ không quy đổi điểm chính thức hoặc xác nhận điều kiện đầu vào/đầu ra; dẫn nguồn ETS/IELTS–British Council/ULIS–VNU. Ba thẻ cuối giữ kiểu trình bày, sửa nội dung yêu cầu tốt nghiệp/tuyển dụng/du học thành phụ thuộc đơn vị tiếp nhận, không áp đặt mốc chung. Máy tính triển khai bố cục đã duyệt: hai khối kỹ năng màu riêng, tổng điểm/tiến độ; CEFR mỗi kỹ năng nằm trong khối nhập và hai thẻ đối chiếu gọn ở cột kết quả. Thu gọn khoảng cách; hai cột có khung ngoài cùng kiểu neo và tự giãn cùng chiều cao trên desktop để thẳng đáy. Giữ viền thẻ tiến độ mục tiêu, hai thẻ đối chiếu kỹ năng và thẻ tổng điểm màu vàng; nút đối chiếu ở cuối cột kết quả. Bỏ ba thẻ chứng chỉ khỏi máy tính. Dùng cận dưới khoảng IIBC 2023, ghi khoảng tổng nhỏ bên dưới; không gọi là điểm chính thức.
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

Backend nghiệp vụ dùng Python + FastAPI; Supabase cung cấp PostgreSQL và Auth. Google OAuth là lựa chọn mặc định; email OTP chỉ bật sau khi có SMTP. URL/publishable key ở frontend, service-role/OpenAI key chỉ ở FastAPI. Chưa cấu hình dịch vụ vẫn dùng khách trên máy.

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

**Ước tính mới dùng cận dưới khoảng điểm của [bài thi thử IIBC tháng 3/2023](https://www.iibc-global.org/hubfs/library/default/toeic/special/job/u-trial202303/pdf/utrial_score.pdf?hsLang=ja), phiên bản `iibc-mock-2023-perfect-v2`.** Khoảng theo nhóm 5 câu giữ nguyên, không nội suy hoặc tự tạo độ chính xác theo từng câu. Đây là tham khảo từ một đề cụ thể, chưa hiệu chuẩn cho mọi đề; [ETS hiệu chỉnh theo từng đề](https://www.ets.org/content/dam/ets-india/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf). Listening 88 câu: cận dưới 405 thay 495 của bảng cũ; Reading 93 câu: 425 thay 485. Ngoại lệ 100/100: app quy ước đạt 495đ mỗi kỹ năng, tổng 990; đây là quy ước luyện tập, không được gán là cận dưới nguyên bản của IIBC hoặc bảng chấm chính thức ETS. 99 câu vẫn dùng cận dưới nhóm 96–100, không tăng các mốc chưa hoàn hảo. Tiến độ và CEFR dùng điểm ước tính hiện hành; khi đúng cả 200 câu, hiển thị 990 và ghi Đúng toàn bộ 200 câu thay khoảng điểm. Giữ phiên bản lower-v1 để đọc/giữ điểm đã lưu khi sửa metadata. Điểm nhập trực tiếp vẫn theo kết quả của nguồn đề. Bảng `legacy-reference-v1` chỉ giữ để nhận diện/giữ điểm cũ: không tính lại lịch sử hay sửa metadata; thay số câu đúng tổng từng kỹ năng mới chuyển phiên bản. Các ước tính mới trong form ghi kết quả và máy tính phải cùng cơ chế.

`scoreSource` phân biệt `ESTIMATED`, `MANUAL_SECTIONS`, `MANUAL_TOTAL`. Nhập L/R: mỗi kỹ năng 5–495, tổng tự cộng; nhập tổng: 10–990, không suy ra L/R. Điểm theo bước 5. Số câu đúng từng Part vẫn có thể ghi để phân tích, không ghi thì để trống. Biểu đồ tổng dùng điểm đã lưu; phân tích kỹ năng chỉ dùng bài có đủ L/R. Bản ghi cũ thiếu nguồn điểm vẫn đọc được; form sửa nhận diện các điểm đã nhập khác bảng tham khảo để giữ chúng. Metadata mới round-trip trong `extra` của bảng `study_sessions`, không cần migration. Backend và sao lưu kiểm tra tính hợp lệ của các bản ghi có nguồn điểm mới.

### 6.4. Tài khoản và đồng bộ

**Trạng thái dễ thấy (duyệt 11/10/2026):** thanh đầu trang hiện chỉ báo nhỏ dùng trực tiếp trạng thái từ hook tài khoản: **Chỉ lưu trên máy / Đang kết nối / Đang đồng bộ / Đã đồng bộ / Chọn dữ liệu đồng bộ / Chưa kết nối / Đồng bộ lỗi**. Bấm chỉ báo mở Cài đặt tài khoản; khi kết nối/đồng bộ lỗi có thao tác thử lại. Trạng thái là vùng thông báo lịch sự cho trình đọc màn hình; biểu tượng chờ tắt chuyển động nếu người dùng yêu cầu. Không suy ra đồng bộ thành công chỉ từ thao tác lưu local; không đổi quyền ghi, đăng nhập, chuyển tài khoản hoặc giao thức đồng bộ hiện có. Desktop/điện thoại giữ đầy đủ chữ trạng thái, không chỉ dùng màu/biểu tượng.

- **Vận hành beta (2026-10-06):** bộ đếm API theo owner/scope trong PostgreSQL, chỉ service role giữ lượt; ingress guard theo IP và concurrency có bộ nhớ giới hạn trong mỗi process. HTTP 429/503 kèm Retry-After; failed flush không tự lặp tức thì. Log metadata JSON với request ID do server tạo, không log nội dung/khóa/query. `/health` là liveness, `/ready` kiểm tra PostgREST và bảng cần thiết, cache 15 giây/timeout 3 giây. Staging/production từ chối cấu hình thiếu khóa database, API limits, secret đủ dài, hostname và HTTPS origin; AI có thể tắt để triển khai tracker. Backup/staging smoke đã có công cụ, cần kiểm chứng trên môi trường thật; chưa có chứng nhận sức chịu tải hay deploy public. Xem `docs/DEPLOYMENT.md`.

- **Xóa nội dung (2026-10-06):** dấu xóa nằm trong `sync_tombstones` riêng, chỉ giữ ID/owner/loại/thời điểm/phiên bản. Nội dung bản ghi và bảng con đã xóa bị xóa khỏi bảng nghiệp vụ và bản legacy. Xóa trắng tài khoản chạy qua FastAPI trong giao dịch, reset hồ sơ/checklist và ghi mốc reset để thiết bị cũ không tải ngược dữ liệu lên. FE bỏ response đang chạy khi reset; export chỉ gồm dữ liệu đang hiệu lực. Reset khách không tác động tài khoản; reset tài khoản không xóa gói guest riêng hay file backup đã tải.

- Server dùng `user_profiles`, `study_sessions`, `mistakes`, `vocabulary_logs`, `weekly_plans`, `pacing_runs`, `exam_checklist`, `streak_shields`; bảng con `study_session_parts`, `weekly_plan_tasks`, `pacing_run_phases`. `exam_history` là view Full Test; `sync_records` là view tương thích giao thức, không phải nguồn lưu trữ. Migration 3 giữ nguyên ID/cursor, chuyển dữ liệu trong giao dịch và giữ bảng cũ ở `sync_records_legacy` cho phục hồi. RLS bảo vệ cả bảng chính và bảng con theo owner. Trường chưa thuộc schema được giữ trong `extra`.

- Dữ liệu khách nằm ở gói riêng; đăng nhập không xóa gói này. Dữ liệu từng tài khoản có gói cục bộ theo user ID. Khi cả tài khoản và máy có dữ liệu, hỏi **Gộp** (mặc định), **Dùng tài khoản**, hoặc **Dùng máy này**.
- Mọi bản ghi, kể cả hồ sơ, checklist theo mục, từ vựng theo ngày và ngày dùng khiên, có `updatedAt`/`deletedAt`. Xóa mềm. Gộp theo ID; bản mới hơn thắng, trùng thời điểm thì bản xóa thắng. Một RPC Postgres kiểm tra phiên bản trong chính giao dịch ghi để yêu cầu đến muộn không ghi đè bản mới. Lựa chọn dùng máy này tạo bản xóa cho mục chỉ có trên server.
- FastAPI xác thực token qua Supabase Auth rồi lấy owner từ phiên; client không chọn user ID. RPC ghi/cursor và quota chỉ cấp cho service role. RLS chặn đọc chéo và chặn danh tính ẩn danh đọc dữ liệu tài khoản. Xóa tài khoản qua FastAPI xóa Auth user và dữ liệu FK. Đồng bộ gửi phần thay đổi, cursor chỉ cập nhật sau khi snapshot cục bộ ghi thành công.
- Khi đăng nhập mà mất mạng hoặc đồng bộ lỗi, chặn ghi tài khoản và báo trạng thái; cho phép quay về gói khách. Streak luôn suy ra từ ngày học, ngày từ vựng và ngày dùng khiên.
- **Trạng thái triển khai:** có FastAPI, migration v3, kiểm thử API và PostgreSQL cục bộ. Chưa có dự án staging/production nên chưa xác minh OAuth, PostgREST và AI trên môi trường đích. Hướng dẫn cấu hình/deploy ở `backend/README.md`.

---

### 6.5. AI hỗ trợ nhập/phân tích lỗi và beta miễn phí

- Nhận một câu hỏi cùng phương án/ngữ cảnh bằng văn bản hoặc một tranh Part 1/tối đa 3 ảnh ngữ cảnh Part 7 (PNG/JPEG/WebP); chưa nhận PDF/audio. Ảnh chỉ dùng lúc phân tích và đối chiếu trước lưu; thẻ lưu câu hỏi/phương án/ngữ cảnh trích xuất, không lưu ảnh. Part 7 dán câu hỏi và A–D; Part 1 dán bốn mô tả nghe A–D, không cần câu hỏi viết và dùng nhãn app “Part 1 · Mô tả tranh”. Phân tích Part 1 bắt buộc một tranh; AI lưu mô tả nhìn thấy với nhãn “Mô tả tranh · AI”, không tự kết luận nguyên nhân nghe sai. Ảnh chỉ chứa ngữ cảnh. AI bỏ qua câu hỏi/đáp án vô tình dính trong ảnh; không có nhập nhiều câu hàng loạt. Luồng nhập tách lựa chọn/lý do/đáp án nguồn; backend giữ các trường người học, không thay bằng AI. Endpoint giữ `text`/`input` cùng `images` tùy chọn; capability `structured_mistake_input`, `part7_context_images` và `part1_picture_input` ngăn gửi ảnh tới backend cũ rồi bị bỏ qua. Ảnh được kiểm tra định dạng thật/kích thước/raster trước quota. Chỉ bấm Phân tích mới gửi tới OpenAI. Hash chống gửi trùng có cả ảnh; không log hoặc lưu ảnh/base64/tên tệp. Chữ trích từ ảnh cần đối chiếu ở preview; giới hạn ký tự và dữ liệu thiếu vẫn áp dụng, không bịa phương án/bằng chứng.
- Khách dùng tracker trước, AI tạo danh tính ẩn danh khi cần. Dữ liệu học chỉ đồng bộ sau khi đăng nhập Google.
- Mặc định khách 3 lượt, tài khoản 10 lượt/tháng, cả app 20 lượt/ngày và 2 lượt/phút. Giữ lượt người dùng trong giao dịch PostgreSQL và chống gửi trùng bằng UUID trước một lần gọi OpenAI. Không xoay key/model hoặc retry yêu cầu sinh nội dung.
- Gmail trong `AI_UNLIMITED_EMAILS` ở backend được miễn mọi cap AI tháng/ngày/phút và spam theo tài khoản/IP khi Supabase Auth trả email đã xác nhận và Google identity khớp email có `email_verified=true`. Không tin `user_metadata` hay email từ client. Vẫn giữ idempotency, counter/audit, RLS và giới hạn tài nguyên/provider; không cấp quyền dữ liệu người khác. UI lấy quyền từ backend, không hardcode email.
- AI chỉ dùng OpenAI Responses API với `gpt-6-luna`, effort `medium`, strict JSON, `store=false`, output tối đa 8.192 token và timeout 45 giây. Không retry yêu cầu sinh nội dung. `/health` thông báo `ai_provider=openai`; request không hỗ trợ provider khác bị từ chối trước quota AI. Chỉ bấm Phân tích với AI mới gửi `consent=true`; dán/sửa/mở form không tự gửi. Trang quyền riêng tư mô tả OpenAI. Quota app và quyền miễn được giữ; miễn quota app vẫn phát sinh phí provider.
- AI trả dữ liệu có cấu trúc: `optionNotes` (nhãn, từ loại viết tắt `n/v/adj/adv/prep/conj/pron/det` hoặc rỗng với cụm/câu, nghĩa ngắn) và `explanation` (quickTip, translation, questionType, evidence trích nguyên văn, paraphrase, analysis, keyVocabulary; mục không áp dụng là rỗng). Backend ghép `trapTip` có nhãn để tìm kiếm/client cũ; grounding bỏ ghi chú của phương án không có trong nguồn. Tổng `trapTip` sau ghép phải nằm trong giới hạn **4.000 ký tự** mà frontend/backend/sync chấp nhận, kể cả nhãn và nghĩa phương án; không để từng trường hợp lệ nhưng bản nháp cuối bị frontend từ chối. Giữ các mục có cấu trúc đầy đủ; phần văn bản tương thích nếu cần rút gọn phải theo đoạn và có dấu rút gọn, không cắt phương án/đáp án gốc. Part do người học chọn bắt buộc trước khi lưu/phân tích; form không tự nhận diện theo số câu. Backend input bắt buộc Part 1–7 và schema AI ràng buộc đúng Part đã chọn. Nhóm "đọc ẩu"/"áp lực giờ" chỉ khi người học tự kể. Part 7 cần đoạn bằng chứng liên quan, không bịa nội dung audio/đoạn văn. `options` và `questionContext` giữ tiếng Anh nguồn. `optionNotes`/`explanation` lưu trong `extra`; bản ghi cũ không có thì hiển thị `trapTip`.
- **Đầu vào người học là nguồn sự thật:** lựa chọn, UNKNOWN/BLANK và nguyên văn lý do đã nhập phải được giữ; AI chỉ nhận xét dựa trên đó. Không để `userChoice` AI trả về thay thế trạng thái/lựa chọn trong form. Không có lý do thì không tạo lý do mới. Phương án được gán nhãn trên máy vẫn phải có đúng nội dung gốc; backend kiểm tra lựa chọn và đáp án nguồn trong tập phương án của đúng một câu đó. Hợp đồng lưu/đọc bản ghi cũ theo mục 6.2; các trường mới đi qua backup/sync.
- **Chất lượng giải thích Reading (prompt và kiểm tra đầu ra OpenAI đã cập nhật 08/10/2026):** Part 5 ưu tiên cấu trúc/từ loại/nghĩa/collocation; Part 6 xét thêm mạch văn; Part 7 dùng bằng chứng/paraphrase trong bài. Nghĩa A–D chỉ gồm bản dịch/dạng từ: ưu tiên nghĩa trong câu, có thể thêm 1–2 nghĩa cùng từ loại thường gặp trong TOEIC Listening & Reading, không liệt kê từ điển hay trộn lý do chọn/loại. Giới hạn nghĩa 120 ký tự, không rút ngắn làm mất ý. Bản dịch giữ các cụm mang nghĩa của câu nguồn (kể cả revised/latest/additional), nhất quán với nghĩa phương án. Phân tích Reading tách dòng dấu hiệu, lý do chọn và từng phương án nhiễu; cho phép nhắc lại nghĩa quyết định nhưng không chép toàn bộ danh sách. Giao diện giữ xuống dòng và tách câu của phân tích cũ để dễ đọc, không sửa nội dung đã lưu. Đầu ra OpenAI mới thiếu/trùng/để trống ghi chú phương án bị từ chối; không áp ràng buộc mới này hồi tố lên thẻ đã lưu. Validator kiểm tra cấu trúc, không xác minh ngữ nghĩa. [Bộ đánh giá Reading](AI_READING_EVAL.md) kiểm tra các từ nhiều nghĩa và các Part; chưa coi test dùng phản hồi giả là bằng chứng chất lượng model thật.
- Đáp án nguồn tùy chọn: có nguồn hợp lệ ưu tiên `PROVIDED`, báo mâu thuẫn nếu AI chọn khác. Không có nguồn và đủ dữ liệu thì AI tự giải, trả `AI_PROPOSED` khớp phương án gốc. Thiếu ngữ cảnh/không đủ phương án/nguồn lỗi thì `MISSING`, không đoán bừa. `answerSource` được giữ khi lưu, đồng bộ và backup trong metadata `extra`, không cần migration. Preview/sổ tay/ôn tập đều phân biệt 'Đáp án AI đề xuất' với nguồn người dùng cung cấp; kiểm tra trước lưu.
- Người học chủ động bấm Phân tích để gửi tới provider đang cấu hình; kết quả là bản nháp. Nguồn đáp án là tùy chọn đối với OpenAI. Khi không có đáp án, AI lỗi hoặc thiếu ngữ cảnh, vẫn cho lưu thủ công với `answerSource=MISSING` và không đưa thẻ đó vào ôn. Không tạo phương án thiếu, không suy diễn lý do sai và không biến đáp án AI thành PROVIDED chỉ vì người học đã bấm Lưu. AI không lưu thẻ thay người học; chỉ hai hành động lưu ở bước kiểm tra mới ghi dữ liệu học.
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

Pomodoro ghi thời gian thực và tách bộ đếm theo danh tính đã hoàn tất ở mục 4.3. Cửa sổ đề mới/gợi ý Part và launcher kế thừa `backend/.env` còn trong backlog. Tối ưu bundle, kiểm chứng dịch vụ thật và chuẩn bị public là đợt riêng.

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

**Nháp và gợi ý ôn tập — duyệt 23/10/2026:** Nhập điểm, Sổ tay và danh sách ghi chi tiết tự giữ nháp trên trình duyệt theo tài khoản/lần nhập; khôi phục khi mở lại, xóa sau lưu thành công hoặc bỏ nháp. Không lưu ảnh thô, URL có token hay ticket AI trong nháp; ảnh chưa tải lên cần chọn lại. Tổng quan mở đúng lần làm còn câu Reading chưa hoàn thành. Xóa thẻ và chấm ôn có Hoàn tác với kiểm tra tài khoản/phiên bản; hoàn tác chấm khôi phục lịch ôn, không ghi đè sửa đổi mới. Phân tích có báo cáo DeepInfra tùy chọn, dùng đúng Full Test/lần làm đã đồng bộ và câu sai có liên kết rõ ràng, tối đa ba ưu tiên có bằng chứng/cách luyện. Gọi AI theo thao tác chủ động, dùng hạn mức hiện có và lưu báo cáo cục bộ; không tự tạo kế hoạch. Chi tiết triển khai và giới hạn ở `docs/UX_AUTOSAVE_ANALYSIS_2026-10-23.md`.

**Dán tự do — duyệt 11/10/2026:**
- Form tách ô Câu hỏi/phương án ở trên và một khu vực ngữ cảnh ở dưới: Tranh (Part 1), Transcript (Part 2–4), Ngữ cảnh tùy chọn thu gọn (Part 5), Đoạn đọc (Part 6–7). Part 7 chọn Văn bản hoặc Ảnh trong cùng khung; giữ bản đang nhập của hai chế độ nhưng chỉ gửi/lưu nguồn đang chọn. Nhãn/số câu/định dạng lẫn trong ô trên vẫn được Luna xử lý.

**Quyền AI beta — duyệt 11/10/2026:** bảng riêng `ai_access_grants` gắn ID Auth, email/tên chỉ để tìm; admin sửa pending/active/blocked và monthly_limit. Người dùng không được truy cập bảng bằng role trình duyệt. Backend đọc quyền mỗi yêu cầu AI, chặn trước ảnh/quota/provider khi chưa duyệt/khóa; quota riêng dùng bộ đếm tháng hiện có, không reset khi đổi quyền hoặc xóa trắng nội dung học. Tài khoản chủ Google đã xác minh được bootstrap miễn hạn mức. Chỉ bật `AI_ACCESS_MANAGED` sau migration; khi bật không dùng allowlist email cũ. Giao diện báo rõ chờ duyệt/khóa/cần đăng nhập, kiểm tra lại quyền và vẫn cho lưu thủ công. Hướng dẫn vận hành ở `docs/AI_ACCESS.md`.
- Thẻ cũ có question/context rõ ràng mở sửa ở hai ô riêng. Thêm câu cùng bài giữ ngữ cảnh, Part và Đề; đổi Đề/Part của nguồn đang dùng hoặc Đổi bài đọc xóa nguồn và kết quả AI cũ. Ngữ cảnh chữ có thể gồm nhiều văn bản; tổng request AI vẫn tối đa 8.000 ký tự, dữ liệu thủ công/thẻ cũ giữ giới hạn lưu hiện có.
- Giữ bắt buộc Part và Đề. Phân tích AI gửi nguyên khối `rawText` cùng ngữ cảnh/ảnh nguồn và thông tin người học riêng; không cần frontend tách thành công câu hỏi/phương án trước khi gửi. Một lần gọi Luna vừa tách vừa giải; không có bước LLM/OCR phụ.
- Luna nhận nhãn giao diện, số câu, Markdown/khoảng trắng HTML, phương án nhiều dòng hoặc nhãn khác thứ tự; giữ nguyên từ ngữ và liên kết nhãn–phương án. Backend xác minh câu hỏi/phương án trích có trong nguồn và không đổi nhãn đã có; ảnh chỉ cung cấp ngữ cảnh.
- Nhiều câu, thiếu câu hỏi hoặc thiếu phương án trả thông báo cụ thể và giữ bản đang nhập. Thiếu bài đọc quyết định đáp án vẫn cho xem phần trích với MISSING. Không tự chọn một câu hoặc bịa đáp án/phương án; đáp án nguồn vẫn nhập riêng.
- Bộ tách frontend phục vụ lưu thủ công và tương thích backend cũ. Sau AI, bản nháp dùng câu hỏi/phương án đã trích để lưu, sửa hoặc thêm câu cùng bài. Backend công bố capability `freeform_mistake_input`.


**Điều chỉnh AI local 11/10/2026:**
- Tách thông báo hạn mức phiên khách/tháng tài khoản/ngày hệ thống/phút hệ thống/ngày kết nối mạng. Chỉ khi reservation bị từ chối mới đọc các counter hiện hành của đúng phạm vi, không gọi provider, không đặt lại lượt. Thời điểm reset hiển thị giờ Việt Nam; nếu không đọc được counter thì nói rõ chưa xác định được hạn mức cụ thể, không tự quy là OpenAI bận. Không cần migration.
- Tách OpenAI hết ngân sách, giới hạn tốc độ, timeout, mất kết nối, không được cấp quyền, sự cố dịch vụ và output chưa hợp lệ. Giữ nội dung đang nhập, cho lưu thủ công, không tự retry request trả phí. Health phân biệt AI tắt với thiếu cấu hình; Retry-After của AI được hiển thị theo giây/phút.
- Ảnh ngữ cảnh Part 7: yêu cầu chép đầy đủ phần bài đọc/bảng/chú thích nhìn thấy, giữ quan hệ hàng–cột. Chỉ rút gọn khi vượt giới hạn 3.998 ký tự và phải báo rõ; cảnh báo không chèn vào nguyên văn context. Không tự sửa các thẻ đã lưu và không khẳng định OCR được backend xác minh.
- Cảnh báo đối chiếu ảnh không tự mở editor thủ công. Khi thực sự cần sửa thủ công ở bước kiểm tra, mục Chỉnh đáp án / lời giải thu gọn mặc định, giữ nội dung và khả năng chỉnh khi mở.


**Dùng lại bài đọc Part 7 — duyệt 11/10/2026:**
- Bước kiểm tra có Lưu & thêm câu cùng bài; sau lưu thủ công có Thêm câu cùng bài đọc và Bài đọc mới. Giữ Part 7, tên Đề và nguyên văn ngữ cảnh; xóa câu hỏi/phương án, lựa chọn, lý do, đáp án nguồn, nhóm lỗi, tag/lời giải của câu trước. Mỗi câu có ID và lịch ôn riêng.
- Banner Đang dùng bài đọc trước có Xem bài đọc và Đổi bài đọc. Câu hỏi mới chỉ cần dán cùng A–D. Đổi Đề hoặc Part bỏ ngữ cảnh đang dùng; Đổi bài đọc giữ câu hỏi đang nhập nhưng bỏ ngữ cảnh/ảnh và kết quả AI cũ. Không ghép ngữ cảnh cũ với ảnh mới.
- Ảnh giữ tạm để đối chiếu trong phiên nhập; các lần phân tích tiếp theo gửi context bằng chữ, không đọc ảnh lại. Kết quả câu mới giữ toàn bộ source context hiện có thay vì thu hẹp theo đoạn AI chọn cho từng câu. Lưu thủ công vẫn giữ context và không kế thừa đáp án/lời giải của câu trước. Không lưu ảnh/base64 vào bundle, backup hay Supabase.
- Menu thẻ Part 7 có question/context rõ ràng cho Thêm câu cùng bài đọc, hoạt động sau tải lại bằng văn bản đã lưu. Sửa thẻ Part 7 tách ngữ cảnh đã lưu khỏi ô câu hỏi, không bắt chụp lại ảnh; thẻ cũ chưa có trường tách riêng vẫn giữ cách sửa tương thích. Không cần migration hay thư viện bài đọc mới.


**Nghĩa phương án Part 7 — duyệt 11/10/2026:** Ô A–D chỉ hiển thị tiếng Anh ở bước kiểm tra, thẻ đã lưu và phiên ôn. Nghĩa tiếng Việt có sẵn trong optionNotes được gom theo A–D dưới Nghĩa các phương án trong Xem giải thích; không gọi AI thêm và không đổi dữ liệu đã lưu. Trong phiên ôn, phần giải thích chỉ được mở sau khi trả lời/lật thẻ. Part 5–6 giữ nghĩa ngắn ngay trong ô phương án như hiện tại.


**Biểu đồ nhóm lỗi — sửa local 11/10/2026:** Chi tiết nhóm khi hover/focus hiển thị ở dòng cố định dưới vòng tròn, không dùng popup đè lên tổng lỗi ở giữa. Giữ màu/đếm/tỷ lệ và chú giải hiện có. SVG không hiện khung focus hình chữ nhật; bàn phím có viền theo lát và dấu nhấn vòng tròn. Không thay đổi dữ liệu hay cách tính thống kê.


**Kế hoạch tuần — chốt 11/10/2026:** Giữ nguyên phong cách và bố cục hiện tại, chưa triển khai khối Hôm nay/dải 7 ngày. Đổi nhãn Tiến độ tuần này thành Mục tiêu đã hoàn thành (hiển thị số mục tiêu đạt/tổng và phần trăm); đổi Chuyên cần tuần X/7 ngày thành Đã học X ngày. Giữ nguyên cách tính, dữ liệu và hành động.


**Ảnh nguồn lưu lâu dài — cập nhật 11/10/2026:** Cách cũ trích toàn bộ ngữ cảnh ảnh được thay khi backend bật persistent_source_images. Part 1/7 gửi ảnh lên bucket private `mistake-sources`, thẻ lưu sourceImageIds dạng hash, không nhúng base64/URL có token. AI đọc lại bộ ảnh của chủ sở hữu cho mỗi câu, trả context rỗng và bằng chứng/giải thích ngắn. Ảnh hiện trực tiếp (chọn Ảnh 1–3, mở ảnh lớn) ở preview, thẻ và ôn; thẻ chữ cũ giữ cách xem cũ. Các câu cùng bài dùng chung bộ ID sau tải lại; khách không lưu ảnh trên cloud. Không tự bổ sung ảnh cho thẻ cũ đã mất ảnh tạm. Xóa thẻ không xóa ảnh dùng chung; reset/xóa tài khoản có luồng dọn ảnh, bảo vệ ảnh mới và tham chiếu còn dùng. Backup JSON chỉ chứa ID ảnh. Bản này đang trên nhánh codex/part7-source-images, chưa push/deploy.
