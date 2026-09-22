# ĐẶC TẢ SẢN PHẨM — TOEIC PROGRESS

**Phiên bản 2.0** · Cập nhật 2026-09-22 · Thay thế toàn bộ SPEC v1

> **v2 khác v1 ở đâu:** v1 được viết trước khi code. Sau ba đợt phát triển, một số phần đã lệch thực tế, hai tính năng được xây mà không hề có trong spec, và spec tự mâu thuẫn với chính nó ở chỗ Spaced Repetition. v2 viết lại theo đúng những gì tồn tại và những gì đã quyết định, đồng thời bổ sung **nguyên tắc lọc tính năng** — thứ v1 không có, và là lý do những tính năng lạc đề lọt được vào sản phẩm.

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

*Ví dụ áp dụng:* Bộ đếm nhịp làm bài (mục 4.5) thoạt nhìn giống công cụ "trong lúc làm bài" nên rất dễ bị loại nhầm. Nhưng nó không cung cấp nội dung — nó huấn luyện **kỷ luật phân bổ thời gian**, và gắn trực tiếp với nhóm lỗi `TIME_PRESSURE` trong Sổ tay. Nó thuộc vế phải của bảng trên.

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

Sáu phân hệ hiện tại, dự kiến gom còn bốn:

```
┌──────────────────┬───────────────────────────────────────────────────────┐
│ 1. Tổng Quan     │ Streak · Mục tiêu & nhịp độ · Rank · Biểu đồ tiến độ  │
├──────────────────┼───────────────────────────────────────────────────────┤
│ 2. Phân Tích     │ Timeline · Ma trận 7 Part · Lịch sử · Làm lại đề      │
├──────────────────┼───────────────────────────────────────────────────────┤
│ 3. Sổ Tay Bẫy    │ Lỗi sai phân loại · Lọc · Lịch ôn giãn cách           │
├──────────────────┼───────────────────────────────────────────────────────┤
│ 4. Tài Liệu      │ Quy đổi điểm · Chứng chỉ quốc tế · Chiến thuật        │
│    & Quy Đổi     │ · Bộ đếm nhịp làm bài · Lộ trình S&W (gộp vào)        │
├──────────────────┼───────────────────────────────────────────────────────┤
│ (Modal) Nhập Điểm│ Full Test 200 câu · Luyện Part lẻ · Ghi nhanh lỗi sai │
│ (Modal) Cài Đặt  │ Mục tiêu · Ngày thi · Sao lưu · Dữ liệu mẫu           │
└──────────────────┴───────────────────────────────────────────────────────┘
```

**Thay đổi so với hiện trạng:**

- `Lộ Trình S&W` hạ cấp thành một mục trong Tài Liệu. Nó là trang tĩnh, chưa nối với dữ liệu nào, không xứng một chỗ ngang hàng Dashboard.
- `Phòng Thi ETS` chuyển vào Tài Liệu, giữ nguyên chức năng (xem 4.5).
- Bỏ một trong hai mục sidebar hiện cùng mở modal Cài Đặt.

---

## 4. ĐẶC TẢ TỪNG PHÂN HỆ

### 4.1. Tổng Quan (Dashboard)

- **Thẻ Streak:** số ngày liên tục, trạng thái hôm nay, số khiên còn lại, lưới bảy ngày trong tuần. *Dự kiến nâng lên heatmap kiểu lịch đóng góp, 8–12 tuần.*
- **Thẻ Mục tiêu:** điểm cao nhất, khoảng cách tới `targetScore`, phần trăm hoàn thành. **Mọi con số ở đây phải tính theo `targetScore`, không phải 990.**
- **Đếm ngược ngày thi và nhịp độ:** từ `examDate` và khoảng cách điểm, tính nhịp cần thiết (ví dụ "còn 45 ngày, cần +30đ, tức khoảng 5đ mỗi tuần") rồi đối chiếu với nhịp thực tế gần đây.
- **Rank Badge:** huy hiệu bậc hiện tại.
- **Biểu đồ tiến độ:** đường điểm tổng theo thời gian, thang trục co theo `targetScore`.
- **Ba thẻ chỉ số:** điểm mới nhất, kỷ lục, mức tăng trưởng.

*Bỏ khỏi spec:* thanh XP tới cấp kế tiếp và châm ngôn ngẫu nhiên mỗi ngày — xem mục 7.

### 4.2. Nhập Điểm (Session Logger — modal)

- **Full Test:** tên nguồn đề, ngày, thời gian làm, số câu đúng từng Part (Listening 6/25/39/30, Reading 30/16/54). Tự cộng Raw 0–100 mỗi kỹ năng, tra bảng ETS ra Scaled 5–495 và tổng 10–990.
- **Luyện Part lẻ:** chọn Part, số câu làm, số câu đúng, thời gian. Vẫn tính vào streak. **Dữ liệu phải lưu có cấu trúc** (`practicePart`, `practiceCorrect`, `practiceTotal`), không nhét vào chuỗi `notes` như hiện tại — nếu không nó vĩnh viễn không vào được biểu đồ.
- **Số từ vựng đã học:** một ô số nguyên tùy chọn. Đây là **chỉ số**, không phải module học từ — xem mục 7.
- **Ghi nhanh lỗi sai:** thêm câu sai thẳng vào Sổ tay ngay trong form, không phải chuyển trang.
- **Làm lại đề:** nhận diện tên đề trùng, đánh số lần làm, so sánh với lần trước và lần đầu.
- **Mặc định form để trống.** Điền sẵn điểm cao khiến một cú bấm nhầm ghi nhận kỷ lục giả.

### 4.3. Phân Tích (Analytics)

- **Timeline:** điểm tổng, Listening và Reading theo thời gian. Đường tham chiếu đặt tại `targetScore`. Lọc theo lượt làm: tất cả, chỉ lần đầu, hoặc điểm cao nhất.
- **Ma trận năng lực 7 Part:** tỷ lệ chính xác từng Part dạng thanh capsule. **Không dùng biểu đồ radar** — bảy trục có thang tối đa lệch nhau (6 câu so với 54 câu), radar sẽ bóp méo hình dạng và đánh lừa mắt. v1 chỉ định radar; quyết định này thay thế. **Tính theo trung bình trượt N đề gần nhất**, không phải trung bình trọn đời — nếu không, những đề tệ lúc mới bắt đầu sẽ kéo chỉ số xuống vĩnh viễn.
- **Phân bố nguyên nhân sai:** biểu đồ theo sáu nhóm lỗi trong Sổ tay. *Chưa xây.*
- **Phân tích thời gian:** xu hướng tổng thời gian làm bài theo từng đề. *Chưa xây.* Không đặt mục tiêu đo thời gian từng Part — xem mục 7.
- **Bảng lịch sử:** lọc, sắp xếp, xem chi tiết, xóa. **Cần bổ sung sửa.**
- **Độ ổn định phong độ:** độ lệch chuẩn, cũng tính trên N đề gần nhất.

### 4.4. Sổ Tay Bẫy (Mistake Notebook)

- **Một bản ghi gồm:** Part, ngữ cảnh câu hỏi, lỗi đã mắc, đáp án đúng kèm giải thích bẫy, phân loại nguyên nhân, thẻ tag tự do.
- **Sáu nhóm nguyên nhân:** bẫy từ vựng và paraphrase · ngữ pháp nâng cao · tốc độ nghe và nối âm · áp lực thời gian · mất tập trung và đọc ẩu · khác.
- **Lịch ôn có giãn cách (Spaced Repetition).** *Đây là quyết định chốt, thay cho mâu thuẫn trong v1 giữa mục 1.2 và mục 3.4.* Mỗi bản ghi có `nextReviewDate`. Ôn đúng thì giãn ra theo bậc 1 → 3 → 7 → 14 → 30 ngày, sai thì quay về đầu. Dashboard hiển thị số thẻ đến hạn. Toggle thủ công hai trạng thái là không đủ — nó biến sổ tay thành kho lưu trữ chết.
- **Sửa được bản ghi.** Hiện chỉ toggle và xóa; gõ nhầm một chữ phải xóa rồi gõ lại.
- **Bộ lọc:** theo Part, trạng thái, nhóm nguyên nhân, và tìm kiếm toàn văn.

### 4.5. Bộ Đếm Nhịp Làm Bài (Pacing Trainer)

> *Tính năng này không có trong v1. Nó được xây ở đợt ba và v2 ghi nhận chính thức.*

Đây **không phải** đồng hồ đếm ngược thông thường — các web luyện đề đã có sẵn. Giá trị nằm ở **mốc nhịp theo từng Part kèm chiến thuật**, thứ các web đó không cung cấp:

- **Năm chế độ:** Full Test 120 phút · Sprint Reading 75 phút · Tốc độ phản xạ Part 5 trong 12 phút · Sức bền Part 7 trong 55 phút · Pomodoro 25 phút.
- Mỗi chế độ chia thành các pha gắn với khoảng câu hỏi cụ thể (ví dụ *Part 5, câu 101–130, 12 phút, tối đa 25–30 giây mỗi câu*), kèm lời nhắc chiến thuật riêng cho từng pha.
- **Phục vụ hai nhóm:** người luyện đề giấy từ sách, vốn không có timer sẵn; và người muốn tập riêng kỷ luật phân bổ thời gian.

**Hướng phát triển:** khi bấm Nộp Bài, chuyển thời gian thật đã dùng sang form Nhập Điểm, và ghi lại pha nào vượt giờ để nuôi phân tích nhóm lỗi `TIME_PRESSURE`. Hiện hai màn hình đứng cạnh nhau mà không truyền một byte dữ liệu nào — đó chính là thứ khiến nó có cảm giác thừa.

### 4.6. Tài Liệu & Quy Đổi

> *Tính năng này cũng không có trong v1.*

- **Bộ quy đổi Raw sang Scaled** để thử "nếu đúng thêm năm câu Part 7 thì được bao nhiêu". Khởi tạo từ bài Full Test gần nhất, cho phép chỉnh tay. Nhãn phải phân biệt rõ đâu là kết quả thật, đâu là con số đang thử.
- **Bảng đối chiếu chứng chỉ quốc tế:** TOEIC với CEFR, IELTS, VSTEP và TOEFL iBT, căn cứ Khung năng lực ngoại ngữ sáu bậc (Thông tư 01/2014/TT-BGDĐT) và tham chiếu ETS.
- **Chiến thuật phân bổ thời gian, checklist trước ngày thi, tổng hợp các bẫy thường gặp.**
- **Lộ trình S&W** (gộp từ phân hệ riêng): giới thiệu thang 400, cấu trúc Speaking 11 câu và Writing 8 câu. Thuần tĩnh cho tới khi có dữ liệu S&W thật.

### 4.7. Cài Đặt & Dữ Liệu

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
| **Đo thời gian từng Part** | Phải bắt nhập bảy con số mỗi buổi. Chi phí nhập liệu vượt giá trị thu được |
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

### Vòng kế tiếp — dọn nợ định vị

1. Dashboard tính theo `targetScore` thay vì 990. Hiện đang mâu thuẫn với Phân Tích.
2. Thang trục biểu đồ co theo `targetScore`.
3. Nối Bộ đếm nhịp sang Nhập Điểm, truyền thời gian thật đã dùng.
4. `examDate` trở thành trục nhịp độ trên Dashboard.
5. Cấu trúc hóa dữ liệu luyện Part lẻ.
6. Gom sáu mục điều hướng còn bốn.

### Vòng sau — chiều sâu học tập

7. Lịch ôn giãn cách cho Sổ tay.
8. Sửa được bản ghi lỗi sai và buổi học.
9. Ma trận 7 Part và độ ổn định chuyển sang trung bình trượt.
10. Phân bố nguyên nhân sai trong Phân Tích.
11. Ô số từ vựng đã học, và heatmap lịch thay lưới bảy ngày.

### Trước khi mở công khai

12. Lớp migrate schema và xác thực dữ liệu nhập.
13. Routing.
14. Rank Tier tính tương đối theo `targetScore`.
15. PWA thật. Hiện chân trang ghi "100% Offline-First" nhưng chưa có manifest hay service worker — đây là một tuyên bố sai.
16. Onboarding, i18n, lint, test, CI.

---

*Tài liệu này là nguồn sự thật cho quyết định sản phẩm. Khi code và spec lệch nhau, sửa một trong hai — đừng để lệch.*
