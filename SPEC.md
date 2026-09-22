# ĐẶC TẢ SẢN PHẨM — TOEIC PROGRESS

**Phiên bản 2.1** · Cập nhật 2026-09-22 · Thay thế toàn bộ SPEC v1

> **v2 khác v1 ở đâu:** v1 được viết trước khi code. Sau ba đợt phát triển, một số phần đã lệch thực tế, hai tính năng được xây mà không hề có trong spec, và spec tự mâu thuẫn với chính nó ở chỗ Spaced Repetition. v2 viết lại theo đúng những gì tồn tại và những gì đã quyết định, đồng thời bổ sung **nguyên tắc lọc tính năng** — thứ v1 không có, và là lý do những tính năng lạc đề lọt được vào sản phẩm.
>
> **v2.1 bổ sung:** hai chức năng mới (Kế Hoạch, Phiên Ôn Tập), kiến trúc điều hướng được dọn lại để mọi mục đều là chức năng thật, và mục 1.4 ghi rõ bốn thứ sản phẩm làm được mà các web luyện đề bên ngoài không làm được.

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
| Chấm bài tự động | Quy đổi Raw → Scaled theo thang ETS |
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

Mọi màn hình phải kéo được về câu hỏi thứ hai. Một màn hình chỉ trưng bày thành tích quá khứ mà không dẫn tới hành động kế tiếp là màn hình chưa làm xong việc của nó.

Bốn năng lực sau là thứ các web bên ngoài **không làm được**, kể cả về nguyên tắc, vì chúng chỉ có dữ liệu của riêng chúng. Đây là trọng tâm phát triển:

1. **Chẩn đoán theo nguyên nhân, không theo Part.** Web ngoài nói "Part 3: 35/39". Sản phẩm này phải nói được "60% điểm mất đến từ bẫy paraphrase, rải đều Part 3, 4 và 7 — đây là lỗ hổng kỹ năng, không phải lỗ hổng Part". Dữ liệu đã có trong `MistakeEntry.category` nhưng **chưa từng được tổng hợp**.
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

> **Ghi chú về Rank Tier.** Thang hiện tại neo vào 990 tuyệt đối. Với người nhắm 700, họ sẽ mắc kẹt ở Silver vĩnh viễn và gamification quay sang phản tác dụng. Khi mở ra công khai, Rank phải tính **tương đối theo `targetScore`**. Chưa làm bây giờ, nhưng không được viết thêm code neo cứng vào 990.

---

## 3. KIẾN TRÚC THÔNG TIN

### 3.1. Vấn đề của kiến trúc hiện tại

Sidebar đang có tám dòng, nhưng chỉ bốn dòng rưỡi là chức năng thật:

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

### 3.2. Kiến trúc đích

```
LUYỆN THI
  1. Tổng Quan        Bảng lệnh hôm nay
  2. Kế Hoạch         ★ MỚI — lấp đúng cái tên đang rỗng
  3. Phòng Thi        Bộ đếm nhịp, có lưu dữ liệu

PHÂN TÍCH & ÔN TẬP
  4. Phân Tích        + chẩn đoán theo nguyên nhân, xếp ưu tiên
  5. Sổ Tay           + Phiên Ôn Tập ★ MỚI

THAM KHẢO
  6. Tài Liệu         Quy đổi · Chứng chỉ · Chiến thuật · Lộ trình S&W

──────────────────────────────────────────
  ⚙ Cài đặt      💾 Sao lưu
  (vùng tiện ích ở đáy sidebar, KHÔNG nằm trong danh sách điều hướng)

(Modal) Nhập Điểm   Full Test · Luyện Part lẻ · Ghi nhanh lỗi sai
```

Sáu mục điều hướng, **cả sáu đều là chức năng thật**. Cài đặt và Sao lưu xuống vùng tiện ích ở đáy — đó là nơi đúng của chúng.

**Thay đổi so với hiện trạng:**

- Thêm **Kế Hoạch** (mục 4.2) và **Phiên Ôn Tập** bên trong Sổ Tay (mục 4.6).
- `Lộ Trình S&W` gộp vào Tài Liệu.
- `Kế Hoạch & Mục Tiêu` và `Sao Lưu & Dữ Liệu` rời khỏi danh sách điều hướng, trở thành hai nút tiện ích ở đáy sidebar.
- `Phòng Thi ETS` giữ nguyên vị trí điều hướng nhưng bắt đầu lưu dữ liệu (mục 4.3).

---

## 4. ĐẶC TẢ TỪNG PHÂN HỆ

### 4.1. Tổng Quan (Dashboard)

**Đổi vai: từ tủ cúp thành bảng lệnh.** Bố cục hiện tại trưng bày điểm cao nhất, streak và huy hiệu — toàn thành tích quá khứ. Theo mục 1.4, việc cần làm hôm nay phải chiếm vị trí chính, thành tích lùi xuống một dải mỏng.

```
┌──────────────────────────────────────────────────────┐
│  HÔM NAY                                             │
│  ├ 7 thẻ lỗi đến hạn ôn              → [Ôn ngay]     │
│  ├ Điểm nghẽn lớn nhất: bẫy paraphrase (-25đ)        │
│  └ Nhịp: cần 5đ/tuần · thực tế 8đ/tuần → đi trước    │
├──────────────────────────────────────────────────────┤
│  ⚠ Tái phạm: bẫy đảo ngữ đã đánh dấu thông suốt      │
│     3 tuần trước, đề hôm nay lại sai nhóm này        │
├──────────────────────────────────────────────────────┤
│  [dải mỏng] 960 · PB 960 · streak 18 · Kim Cương     │
├──────────────────────────────────────────────────────┤
│  Biểu đồ tiến độ                                     │
└──────────────────────────────────────────────────────┘
```

- **Khối Hôm Nay:** số thẻ đến hạn ôn kèm nút vào thẳng Phiên Ôn Tập; điểm nghẽn lớn nhất theo nguyên nhân; nhịp cần thiết đối chiếu nhịp thực tế.
- **Cảnh báo tái phạm:** khi một nhóm lỗi đã đánh dấu thông suốt xuất hiện lại ở buổi mới.
- **Dải thành tích:** điểm mới nhất, kỷ lục, streak, rank. **Mọi con số phải tính theo `targetScore`, không phải 990.**
- **Streak:** *dự kiến nâng lưới bảy ngày lên heatmap kiểu lịch đóng góp, 8–12 tuần.*
- **Biểu đồ tiến độ:** đường điểm tổng theo thời gian, thang trục co theo `targetScore`.

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

**Phải lưu dữ liệu.** Hiện nó không ghi một byte nào — bấm xong là quên sạch. Cần:

1. Khi Nộp Bài, chuyển **thời gian thật đã dùng** sang form Nhập Điểm.
2. Ghi lại **pha nào vượt giờ và vượt bao nhiêu**, để dựng đường cong mệt mỏi (mục 1.4 điểm 3) mà người dùng không phải gõ thêm gì.

Chừng nào còn không lưu gì, nó vẫn sẽ có cảm giác thừa — không phải vì tính năng dở, mà vì nó bị cô lập khỏi phần còn lại của hệ thống.

### 4.4. Nhập Điểm (Session Logger — modal)

- **Full Test:** tên nguồn đề, ngày, thời gian làm, số câu đúng từng Part (Listening 6/25/39/30, Reading 30/16/54). Tự cộng Raw 0–100 mỗi kỹ năng, tra bảng ETS ra Scaled 5–495 và tổng 10–990.
- **Luyện Part lẻ:** chọn Part, số câu làm, số câu đúng, thời gian. Vẫn tính vào streak. **Dữ liệu phải lưu có cấu trúc** (`practicePart`, `practiceCorrect`, `practiceTotal`), không nhét vào chuỗi `notes` như hiện tại — nếu không nó vĩnh viễn không vào được biểu đồ.
- **Số từ vựng đã học:** một ô số nguyên tùy chọn. Đây là **chỉ số**, không phải module học từ — xem mục 7.
- **Ghi nhanh lỗi sai:** thêm câu sai thẳng vào Sổ tay ngay trong form, không phải chuyển trang.
- **Làm lại đề:** nhận diện tên đề trùng, đánh số lần làm, so sánh với lần trước và lần đầu.
- **Mặc định form để trống.** Điền sẵn điểm cao khiến một cú bấm nhầm ghi nhận kỷ lục giả.

### 4.5. Phân Tích (Analytics)

- **Timeline:** điểm tổng, Listening và Reading theo thời gian. Đường tham chiếu đặt tại `targetScore`. Lọc theo lượt làm: tất cả, chỉ lần đầu, hoặc điểm cao nhất.
- **Ma trận năng lực 7 Part:** tỷ lệ chính xác từng Part dạng thanh capsule. **Không dùng biểu đồ radar** — bảy trục có thang tối đa lệch nhau (6 câu so với 54 câu), radar sẽ bóp méo hình dạng và đánh lừa mắt. v1 chỉ định radar; quyết định này thay thế. **Tính theo trung bình trượt N đề gần nhất**, không phải trung bình trọn đời — nếu không, những đề tệ lúc mới bắt đầu sẽ kéo chỉ số xuống vĩnh viễn.
- **Chẩn đoán theo nguyên nhân** *(ưu tiên cao nhất — xem mục 1.4 điểm 1)*: tổng hợp sáu nhóm lỗi từ Sổ tay thành biểu đồ phân bố, kèm diễn giải bằng lời. Phải trả lời được "nguyên nhân nào làm mất nhiều điểm nhất, và nó rải ở những Part nào". Hiện `mistakes` đã được truyền vào màn hình này nhưng chỉ dùng để liệt kê lỗi của một buổi khi bấm xem chi tiết — sáu nhóm nguyên nhân **chưa từng được tổng hợp**. *Chưa xây.*
- **Xếp ưu tiên theo lợi ích** *(mục 1.4 điểm 4)*: ước tính số điểm thu được nếu khắc phục từng điểm nghẽn, rồi xếp hạng. Kết quả cấp dữ liệu cho màn hình Kế Hoạch. *Chưa xây.*
- **Phân tích thời gian:** xu hướng tổng thời gian làm bài theo từng đề, cộng với đường cong mệt mỏi dựng từ dữ liệu pha vượt giờ của Bộ đếm nhịp. *Chưa xây.*
- **Bảng lịch sử:** lọc, sắp xếp, xem chi tiết, xóa. **Cần bổ sung sửa.**
- **Độ ổn định phong độ:** độ lệch chuẩn, cũng tính trên N đề gần nhất.

### 4.6. Sổ Tay Bẫy (Mistake Notebook)

- **Một bản ghi gồm:** Part, ngữ cảnh câu hỏi, lỗi đã mắc, đáp án đúng kèm giải thích bẫy, phân loại nguyên nhân, thẻ tag tự do.
- **Sáu nhóm nguyên nhân:** bẫy từ vựng và paraphrase · ngữ pháp nâng cao · tốc độ nghe và nối âm · áp lực thời gian · mất tập trung và đọc ẩu · khác.
- **Sửa được bản ghi.** Hiện chỉ toggle và xóa; gõ nhầm một chữ phải xóa rồi gõ lại.
- **Bộ lọc:** theo Part, trạng thái, nhóm nguyên nhân, và tìm kiếm toàn văn.

#### Phiên Ôn Tập ★ chức năng mới

Sổ Tay hiện là tủ hồ sơ: xem được, lọc được, đánh dấu được — nhưng **không có nút "ôn"**. Thiếu chế độ phiên thì Spaced Repetition chỉ là một cột ngày nằm trong database, không ai dùng tới.

**Luồng một phiên:**

```
Hiện ngữ cảnh câu hỏi
  → người học tự nhớ lại đáp án và cái bẫy
  → lật thẻ xem đáp án đúng
  → tự chấm: Nhớ / Quên
  → hệ thống giãn hoặc đặt lại lịch
```

- **Lịch giãn cách:** mỗi bản ghi có `nextReviewDate`. Nhớ thì giãn theo bậc 1 → 3 → 7 → 14 → 30 ngày; quên thì quay về bậc đầu. *Đây là quyết định chốt, thay cho mâu thuẫn trong v1 giữa mục 1.2 và mục 3.4.*
- Tổng Quan hiển thị số thẻ đến hạn kèm lối vào thẳng phiên ôn.
- Ưu tiên trong phiên: thẻ quá hạn lâu nhất trước, rồi tới nhóm nguyên nhân đang là điểm nghẽn lớn nhất.

#### Phát hiện tái phạm

*Xem mục 1.4 điểm 2 — đây là năng lực khác biệt mạnh nhất của sản phẩm.*

Khi một buổi học mới ghi nhận lỗi thuộc nhóm nguyên nhân mà người học **đã từng đánh dấu là thông suốt**, hệ thống phải đối chiếu và cảnh báo trên Tổng Quan, đồng thời hạ thẻ liên quan về lại trạng thái cần ôn.

Không web luyện đề nào làm được điều này, kể cả về nguyên tắc, vì nó đòi hỏi lịch sử lỗi xuyên nhiều nguồn đề trong nhiều tháng. Đây là vòng lặp khép kín: ghi lỗi → ôn → **kiểm chứng bằng đề sau** → phát hiện chưa thật sự thuộc.

### 4.7. Tài Liệu & Quy Đổi

> *Tính năng này cũng không có trong v1.*

- **Bộ quy đổi Raw sang Scaled** để thử "nếu đúng thêm năm câu Part 7 thì được bao nhiêu". Khởi tạo từ bài Full Test gần nhất, cho phép chỉnh tay. Nhãn phải phân biệt rõ đâu là kết quả thật, đâu là con số đang thử.
- **Bảng đối chiếu chứng chỉ quốc tế:** TOEIC với CEFR, IELTS, VSTEP và TOEFL iBT, căn cứ Khung năng lực ngoại ngữ sáu bậc (Thông tư 01/2014/TT-BGDĐT) và tham chiếu ETS.
- **Chiến thuật phân bổ thời gian, checklist trước ngày thi, tổng hợp các bẫy thường gặp.**
- **Lộ trình S&W** (gộp từ phân hệ riêng): giới thiệu thang 400, cấu trúc Speaking 11 câu và Writing 8 câu. Thuần tĩnh cho tới khi có dữ liệu S&W thật.

### 4.8. Cài Đặt & Dữ Liệu

- Tên, `targetScore`, `examDate`, mục tiêu phút tối thiểu mỗi ngày.
- **Xuất và nhập JSON.** Nhập phải kiểm tra cấu trúc trước khi ghi đè — hiện chỉ cần một file có khóa `profile` là xóa sạch dữ liệu thật, không hoàn tác được.
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
| Nền trang | `#F1F5F9` | `#0B111E` |
| Nền card | `#FFFFFF` | `#121A2B` |
| Nền sidebar | `#FFFFFF` | `#0E1526` |
| Hành động chính | `blue-600` | `blue-600` |
| Streak, cảnh báo kỷ luật | `amber-500` / `orange-500` | như chế độ sáng |
| Listening | `blue` / `sky` | như chế độ sáng |
| Reading | `purple` / `violet` | như chế độ sáng |
| Thành công, đã thông suốt | `emerald` | như chế độ sáng |
| Lỗi sai, cần ôn | `rose` | như chế độ sáng |

**Màu phải mang nghĩa.** Hiện bốn thẻ KPI ở Phân Tích dùng bốn màu pastel khác nhau không biểu thị điều gì — đó là màu trang trí, làm loãng tín hiệu thật.

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

Lưu trữ: **LocalStorage**. v1 ghi IndexedDB — không đúng, chưa từng dùng.

### 6.2. Mô hình dữ liệu

Nguồn sự thật là `src/types/index.ts`. Các thực thể chính:

- `UserProfile` — tên, `targetScore`, `examDate`, streak, khiên, mục tiêu mỗi ngày.
- `StudySession` — một buổi làm đề hoặc luyện Part; điểm Raw và Scaled, `partScores`, `attemptNumber`, thời gian, ghi chú.
- `MistakeEntry` — một lỗi sai; Part, ngữ cảnh, đáp án, nhóm nguyên nhân, tag, trạng thái.
- `SessionAttemptMeta` — lần làm thứ mấy, chênh lệch so với lần đầu và lần trước.

**Nợ kiến trúc đã biết, cần trả trước khi mở công khai:**

1. Khóa localStorage đánh `_v1` nhưng **không có hàm migrate**. Đổi schema sẽ làm vỡ dữ liệu người dùng cũ.
2. Xóa một buổi học **không xóa các lỗi sai liên kết** qua `sessionId`.
3. **Không có routing.** Tab quản bằng `useState`, nên không deep link được, nút Back của trình duyệt không hoạt động, và F5 luôn quay về Tổng Quan.
4. `AnalyticsView.tsx` hơn 2000 dòng, cần tách hook và component con.
5. Không có lint, test, hay error boundary.
6. `<input type="date">` hiển thị theo locale trình duyệt (MM/DD/YYYY), lệch với định dạng DD/MM/YYYY dùng ở mọi nơi khác trong app.

### 6.3. Quy đổi điểm ETS

Bảng tra Raw sang Scaled cho từng kỹ năng (0–100 thành 5–495), tổng 10–990. Hàm `calculateFromPartScores()` cộng Part 1–4 thành Raw Listening và Part 5–7 thành Raw Reading.

**Đây là bảng xấp xỉ theo phổ điểm ETS, không phải bảng chính thức.** Giao diện nên gọi kết quả là "điểm dự kiến", không phải điểm chính xác.

---

## 7. NHỮNG THỨ KHÔNG LÀM

Mục này tồn tại để khỏi phải tranh luận lại. Mỗi dòng kèm lý do.

| Không làm | Vì sao |
| :--- | :--- |
| **Ngân hàng đề, câu hỏi trong app** | Biến tracker thành nền tảng luyện thi — khác hẳn về quy mô, bản quyền và hạ tầng. Và làm mất chính ưu thế "bất khả tri về nguồn đề" |
| **Chấm bài tự động** | Cùng lý do trên |
| **Module từ vựng, flashcard** | Các web chuyên dụng làm tốt hơn nhiều. **Chỉ theo dõi số từ đã học mỗi ngày như một chỉ số** — đó là dữ liệu, không phải nội dung |
| **Bài giảng, video, lý thuyết** | Không phải vai trò của sản phẩm |
| **Bảng xếp hạng, mạng xã hội** | Chưa có backend, chưa có người dùng thứ hai |
| **Gợi ý bằng AI** | Với vài chục bản ghi sẽ chỉ sinh ra lời khuyên sáo rỗng. Xem lại khi dữ liệu đủ dày |
| **Bắt người dùng nhập tay thời gian từng Part** | Phải gõ bảy con số mỗi buổi. Chi phí nhập liệu vượt giá trị thu được. **Nhưng đo tự động thì được** — Bộ đếm nhịp đã biết mốc từng pha, ghi lại pha vượt giờ không tốn thao tác nào của người dùng (mục 4.3) |
| **Biểu đồ radar 7 Part** | Thang tối đa lệch nhau (6 câu so với 54 câu) làm méo hình, đánh lừa mắt |

---

## 8. LỘ TRÌNH

### Đã hoàn thành

- Nền tảng React, Vite, Tailwind; layout sidebar và topbar; chế độ sáng và tối.
- Lưu trữ LocalStorage, xuất nhập JSON, dữ liệu mẫu tùy chọn.
- Engine quy đổi ETS; ghi nhận Full Test và Part lẻ.
- Streak, khiên bảo vệ, Rank Tier, đếm ngược ngày thi, pháo giấy khi phá kỷ lục.
- Sổ tay lỗi sai với sáu nhóm nguyên nhân và bộ lọc.
- Phân tích: timeline, ma trận 7 Part, bảng lịch sử, theo dõi làm lại đề.
- Bộ đếm nhịp làm bài với năm chế độ.
- Tài liệu: quy đổi điểm, đối chiếu chứng chỉ quốc tế, chiến thuật, checklist.

### Vòng kế tiếp — đánh thức dữ liệu đang chết

*Thứ tự ưu tiên theo mục 1.4: làm trước những gì biến dữ liệu sẵn có thành câu trả lời.*

1. **Chẩn đoán theo nguyên nhân** trong Phân Tích. Rẻ nhất, mở đường cho mục 4 và cho Kế Hoạch. Dữ liệu đã nằm sẵn trong `MistakeEntry.category`.
2. **Bộ đếm nhịp lưu dữ liệu** — truyền thời gian thật sang Nhập Điểm, ghi lại pha vượt giờ.
3. Dashboard tính theo `targetScore` thay vì 990. Hiện đang mâu thuẫn với Phân Tích.
4. Thang trục biểu đồ co theo `targetScore`.
5. Cấu trúc hóa dữ liệu luyện Part lẻ.
6. Dọn điều hướng: thêm Kế Hoạch, gộp Lộ Trình S&W, đẩy Cài đặt và Sao lưu xuống vùng tiện ích.

### Vòng sau — đóng vòng lặp học tập

7. **Phiên Ôn Tập** và lịch giãn cách cho Sổ tay.
8. **Phát hiện tái phạm** — đối chiếu nhóm lỗi mới với các thẻ đã đánh dấu thông suốt.
9. **Màn hình Kế Hoạch** đầy đủ: mục tiêu tuần, xếp ưu tiên theo lợi ích, theo dõi kế hoạch so với thực tế.
10. **Tổng Quan đổi vai** thành bảng lệnh hôm nay.
11. Sửa được bản ghi lỗi sai và buổi học.
12. Ma trận 7 Part và độ ổn định chuyển sang trung bình trượt.
13. Đường cong mệt mỏi dựng từ dữ liệu pha vượt giờ.
14. Ô số từ vựng đã học, và heatmap lịch thay lưới bảy ngày.

### Trước khi mở công khai

15. Lớp migrate schema và xác thực dữ liệu nhập.
16. Routing.
17. Rank Tier tính tương đối theo `targetScore`.
18. PWA thật. Hiện chân trang ghi "100% Offline-First" nhưng chưa có manifest hay service worker — đây là một tuyên bố sai.
19. Onboarding, i18n, lint, test, CI.

---

*Tài liệu này là nguồn sự thật cho quyết định sản phẩm. Khi code và spec lệch nhau, sửa một trong hai — đừng để lệch.*
