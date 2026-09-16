# TÀI LIỆU ĐẶC TẢ KỸ THUẬT VÀ THIẾT KẾ SẢN PHẨM (SPEC.MD)
# DỰ ÁN: TOEIC PROGRESS 990 — TRẠM CHỈ HUY LUYỆN THI CÔNG NGHỆ CAO

---

## 1. TỔNG QUAN DỰ ÁN & TẦM NHÌN SẢN PHẨM (PRODUCT VISION)

### 1.1. Bối cảnh & Vấn đề (Problem Statement)
Chinh phục mức điểm tối đa **TOEIC 990** (Listening & Reading) đòi hỏi sự chính xác gần như tuyệt đối (thường chỉ cho phép sai số từ 0 - 3 câu trên toàn bộ 200 câu). Ở giai đoạn bứt phá từ 800+ lên 950+, hầu hết người tự học gặp phải hai rào cản chí mạng:
1. **Rào cản tâm lý (Psychological Plateau & Burnout):** Mất động lực học hàng ngày, chuỗi học ngắt quãng, thiếu cảm giác tiến bộ rõ rệt khi điểm số đi ngang.
2. **Thiếu hệ thống phân tích lỗi sai sâu (Lack of Deep Error Diagnostics):** Người học thường chỉ làm đề, đếm tổng câu đúng mà không đo lường được tỷ lệ rủi ro theo từng Part (1–7), không phân loại được nguyên nhân mất điểm (bẫy paraphrase, ngữ pháp, hụt thông tin do tốc độ nghe, hay phân bổ thời gian sai).

### 1.2. Tầm nhìn & Sứ mệnh (Vision & Mission)
Xây dựng **TOEIC Progress 990** thành một **"Study Command Center" (Trạm chỉ huy luyện thi)** chuẩn EdTech quốc tế:
- **Thiết kế Modern Dark Pro:** Giao diện tối hiện đại, chuyên nghiệp, dịu mắt cho các buổi cày đêm, kết hợp các điểm nhấn neon tinh tế mang lại cảm xúc của một "trung tâm điều khiển tối tân".
- **Hệ thống Tâm lý học hành vi (Behavioral Psychology & Gamification):** Ứng dụng các quy luật tâm lý (Mô hình Fogg, Loss Aversion với Streak & Khiên bảo vệ, Tier Gamification phân hạng từ Tân binh đến 990 Master) để biến việc luyện đề thành thói quen kỷ luật tự giác mỗi ngày.
- **Phân tích dữ liệu & Quy đổi điểm chuẩn ETS:** Tự động quy đổi số câu đúng (Raw Score) sang điểm thực tế (Scaled Score 5–495 cho mỗi kỹ năng), vẽ biểu đồ mạng nhện (Radar Chart) điểm danh 7 Part và biểu đồ tiến độ hướng tới mốc 990.
- **Sổ tay lỗi sai thông minh (Mistake Notebook):** Quản lý chi tiết từng "tử huyệt", bẫy đề thi và từ vựng hay quên theo trạng thái ôn tập Spaced Repetition.
- **Kiến trúc tương lai (Future-Ready):** Thiết kế mô-đun hóa sẵn sàng mở rộng sang 2 kỹ năng Speaking & Writing (thang 400).

---

## 2. HỒ SƠ NGƯỜI DÙNG & CƠ CHẾ TÂM LÝ HỌC HÀNH VI (BEHAVIORAL MECHANICS)

### 2.1. Chân dung người học mục tiêu
- **Mục tiêu:** Đạt TOEIC 990 (trước mắt L&R, mở rộng S&W sau này).
- **Phương pháp học:** Tự luyện đề độc lập từ các bộ đề tiêu chuẩn (ETS, Hacker TOEIC, YBM...) và cần một nơi ghi nhận, đo lường, phân tích hiệu suất học tập hàng ngày.
- **Nhu cầu cốt lõi:** Thấy được sự tiến bộ bằng biểu đồ dữ liệu định lượng, duy trì được kỷ luật chuỗi ngày học không bỏ dở, nhận diện chính xác các bẫy hay mắc phải.

### 2.2. Các đòn bẩy tâm lý ứng dụng trong thiết kế

| Cơ chế tâm lý | Ứng dụng thực tế trên TOEIC Progress 990 | Tác động hành vi |
| :--- | :--- | :--- |
| **Loss Aversion (Tâm lý sợ mất mát)** | **Hệ thống Streak ngọn lửa & Khiên bảo vệ (Streak Freeze):** Người dùng có xu hướng không muốn phá vỡ chuỗi ngày học liên tục đã gầy dựng. Nếu bận đột xuất, khiên bảo vệ sẽ cứu chuỗi giúp tránh cảm giác chán nản từ bỏ. | Giữ nhịp độ học tập tối thiểu mỗi ngày, không bị đứt gãy thói quen. |
| **Goal Gradient Effect (Hiệu ứng tiệm cận mục tiêu)** | **Đếm ngược ngày thi & Thanh tiến độ 990 (Pacing Calculator):** Càng gần mốc mục tiêu và ngày thi, năng lượng và sự tập trung của người học càng tăng vọt. Hệ thống tính toán điểm cần tăng trung bình mỗi tuần. | Tạo động lực tăng tốc trong giai đoạn nước rút. |
| **Status & Mastery (Thèm muốn danh hiệu & Thăng hạng)** | **Hệ thống Rank Tier (6 bậc):**<br>- *Recruit (Tân binh)*: < 500<br>- *Bronze Specialist*: 500 - 695<br>- *Silver Strategist*: 700 - 845<br>- *Gold Vanguard*: 850 - 895<br>- *Platinum Elite*: 900 - 945<br>- *Diamond Legend*: 950 - 985<br>- *Grandmaster 990*: 990 điểm tuyệt đối. | Kích thích nhu cầu khẳng định bản thân và chinh phục các nấc thang năng lực cao hơn. |
| **Cognitive Closure (Khép kín nhận thức về lỗi sai)** | **Sổ tay bắt bẫy (Mistake Notebook):** Chuyển trạng thái lỗi từ "Đang mắc bẫy / Chưa thuộc" sang "Đã thông suốt (Mastered)". | Tạo cảm giác an tâm và kiểm soát hoàn toàn các lỗ hổng kiến thức trước khi bước vào phòng thi thật. |
| **Commitment & Micro-Motivation** | **Châm ngôn truyền lửa hàng ngày (Daily Quotes) & Bảng cam kết cá nhân:** Lời nhắc nhở tạo cảm hứng mỗi sáng và khi mở ứng dụng. | Củng cố năng lượng tích cực, giảm căng thẳng ôn tập. |

---

## 3. KIẾN TRÚC THÔNG TIN & CÁC TÍNH NĂNG CHI TIẾT

Ứng dụng được chia thành 5 phân hệ tính năng trực quan trên thanh điều hướng chính (Sidebar / Topbar Navigation):

```
┌────────────────────────────────────────────────────────────────────────────┐
│ TOEIC PROGRESS 990 [Skill Switcher: ◉ L&R (990) | ○ S&W (Roadmap)]        │
├───────────────┬────────────────────────────────────────────────────────────┤
│ 1. Dashboard  │ • Streak Counter & Freeze Shield • Goal Progress & Pacing   │
│ (Trang chủ)   │ • Current Rank Tier Badge • Quick Action (Log Session)    │
│               │ • Score Timeline Chart • Part Accuracy Radar Chart        │
├───────────────┼────────────────────────────────────────────────────────────┤
│ 2. Session Log│ • Log Full Test (200 câu: Part 1 - 7)                      │
│ (Nhật ký)     │ • Log Part Practice (Luyện lẻ từng Part)                   │
│               │ • ETS Raw-to-Scaled Automatic Score Calculator             │
│               │ • Session History Table (Lọc, Sửa, Xóa)                   │
├───────────────┼────────────────────────────────────────────────────────────┤
│ 3. Analytics  │ • Deep Score Analytics (Listening vs Reading trends)       │
│ (Phân tích)   │ • Radar Breakdown chi tiết 7 Part                          │
│               │ • Error Breakdown Pie/Bar Chart (Ngữ pháp, Bẫy, Từ vựng)   │
│               │ • Tốc độ làm bài & Thời gian trung bình mỗi Part           │
├───────────────┼────────────────────────────────────────────────────────────┤
│ 4. Mistake Log│ • Danh sách bẫy & lỗi sai phân loại theo Part              │
│ (Sổ tay bẫy)  │ • Thẻ lọc theo Tag (Từ mới, Ngữ pháp, Paraphrase, Tốc độ) │
│               │ • Toggle trạng thái: 'Cần ôn lại' vs 'Đã thông suốt'       │
├───────────────┼────────────────────────────────────────────────────────────┤
│ 5. Settings   │ • Cấu hình mục tiêu (Target Score, Exam Date, Daily Min)  │
│ (Cài đặt)     │ • Backup / Restore dữ liệu (Export/Import JSON)            │
│               │ • Chuyển đổi Dữ liệu Mẫu (Demo Data) / Xóa trắng          │
└───────────────┴────────────────────────────────────────────────────────────┘
```

### 3.1. Phân hệ 1: Dashboard & Trạm chỉ huy động lực (Motivation Center)
- **Hộp chỉ số Streak (Streak Card):**
  - Hiển thị số ngày liên tục kèm ngọn lửa cam rực rỡ và hiệu ứng phát sáng nhẹ.
  - Trạng thái ngày hôm nay: *Đã hoàn thành* (màu xanh lá) hoặc *Chưa học* (cảnh báo cam/đỏ).
  - Trạng thái Khiên bảo vệ (Streak Freeze): Số khiên khả dụng (mặc định tích lũy tối đa 2 khiên khi học chăm chỉ).
- **Hộp tiến độ mục tiêu & Đếm ngược ngày thi (Target & Exam Countdown):**
  - Điểm số cao nhất đạt được (Personal Best) và Điểm trung bình 3 đề gần nhất.
  - Thanh tiến độ hiển thị khoảng cách từ điểm hiện tại đến 990 điểm.
  - Bộ đếm ngược ngày thi thực tế (D-Day Countdown): Hiển thị số ngày còn lại và tốc độ tăng điểm cần thiết (Pacing: ví dụ cần tăng +8 điểm/tuần).
- **Huy hiệu Hạng (Rank Badge):**
  - Hiển thị huy hiệu 3D phẳng của Tier hiện tại (ví dụ: Diamond Elite hoặc Grandmaster 990) kèm thanh kinh nghiệm (XP) đến cấp bậc tiếp theo.
- **Châm ngôn truyền lửa (Daily Wisdom):**
  - Câu trích dẫn động lực học tập tiếng Anh thay đổi ngẫu nhiên mỗi ngày.
- **Biểu đồ thu nhỏ (Mini Charts Overview):**
  - Đường xu hướng điểm số và Radar tổng quan 7 Part ngay tại trang chủ.

### 3.2. Phân hệ 2: Ghi nhận buổi học (Session Logger) & Bộ quy đổi điểm ETS
- **Chế độ 1: Full Test (Đề thi chuẩn 200 câu):**
  - Nhập tên nguồn đề (ví dụ: *ETS 2024 Test 03*, *Hacker 3 Test 01*).
  - Nhập số câu đúng từng Part:
    - **Listening (100 câu):** Part 1 (6 câu), Part 2 (25 câu), Part 3 (39 câu), Part 4 (30 câu).
    - **Reading (100 câu):** Part 5 (30 câu), Part 6 (16 câu), Part 7 (54 câu).
  - Tự động cộng Raw Score Listening (0–100) và Reading (0–100).
  - **ETS Score Converter Engine:** Tự động tra cứu bảng quy đổi chuẩn ETS quốc tế để tính ngay điểm Scaled Score (5–495 mỗi kỹ năng) và Tổng điểm (10–990).
  - Nhập tổng thời gian làm bài (phút) và ghi chú tổng quan về buổi thi.
- **Chế độ 2: Part Practice (Luyện lẻ từng phần):**
  - Dành cho các ngày bận rộn chỉ kịp luyện 1–2 Part (ví dụ: cày 30 câu Part 5, hoặc 3 bài đọc đơn Part 7).
  - Chọn Part luyện tập, nhập số câu làm, số câu đúng và thời gian.
  - Vẫn được tính vào Streak hàng ngày để bảo toàn chuỗi kỷ luật!
- **Tích hợp thêm nhanh lỗi sai (Direct Mistake Logging):**
  - Cho phép thêm ngay các câu sai, bẫy gặp phải trực tiếp từ form kết thúc buổi test vào Sổ tay lỗi sai mà không cần chuyển trang.

### 3.3. Phân hệ 3: Phân tích chuyên sâu & Đo lường năng lực (Advanced Analytics)
- **Biểu đồ dòng thời gian tiến độ (Score Timeline Chart):**
  - Trục X: Ngày làm đề.
  - Trục Y: Thang điểm 0–990.
  - 3 đường dữ liệu riêng biệt: Điểm Listening, Điểm Reading, và Điểm Tổng.
  - Đường tham chiếu cố định (Reference Line) màu tím neon ở mốc **990 Target**.
- **Biểu đồ mạng nhện 7 Part (7-Part Radar Chart):**
  - 7 trục tương ứng Part 1 đến Part 7 thể hiện độ thành thạo (% chính xác trung bình).
  - Nhận diện tức thì "điểm nghẽn" (bottleneck): Ví dụ Radar nhô cao ở Part 1, 2, 5 nhưng lõm sâu ở Part 7 Double/Triple Passages hoặc Part 3 Inference.
- **Biểu đồ phân loại nguyên nhân sai (Error Taxonomy Chart):**
  - Phân bố tỷ lệ lỗi sai theo các nhóm nguyên nhân chính:
    1. *Từ vựng lạ / Bẫy Paraphrase*
    2. *Ngữ pháp nâng cao / Cấu trúc câu đảo ngữ*
    3. *Hụt thông tin / Tốc độ nói nhanh / Nối âm*
    4. *Thiếu thời gian / Phân bổ phút làm bài chưa tối ưu*
    5. *Mất tập trung / Bẫy suy diễn chủ quan*
- **Bảng lịch sử chi tiết (Detailed Test History):**
  - Danh sách toàn bộ các đề đã làm kèm tag, điểm số, thời gian, và nút xem lại phân tích chi tiết.

### 3.4. Phân hệ 4: Sổ tay lỗi sai & Bẫy đề thi (Mistake Notebook)
- **Cấu trúc một bản ghi lỗi (Mistake Entry):**
  - Part liên quan (Part 1 -> Part 7).
  - Nội dung câu hỏi / Bối cảnh câu sai.
  - Lỗi sai cụ thể & Đáp án đúng.
  - Giải thích bẫy đề thi (ETS Trap Analysis) & Từ vựng mới cần nhớ.
  - Thẻ phân loại (Tags): `#Vocabulary`, `#Grammar`, `#InferenceTrap`, `#TimeManagement`...
  - Trạng thái ôn tập: **"Chưa nhớ / Cần ôn lại" (Needs Review - màu đỏ cam)** vs **"Đã thông suốt" (Mastered - màu xanh ngọc)**.
- **Bộ lọc thông minh:** Lọc theo Part, theo Trạng thái, hoặc tìm kiếm theo từ khóa.

### 3.5. Phân hệ 5: Cài đặt, Quản lý dữ liệu & An toàn thông tin (Settings & Data)
- **Cấu hình cá nhân hóa:**
  - Thiết lập mục tiêu điểm số (mặc định 990).
  - Ngày thi thực tế (D-Day).
  - Mục tiêu học tối thiểu mỗi ngày để giữ streak (ví dụ: làm 1 Part hoặc học 20 phút).
- **Lưu trữ Offline-First & Xuất/Nhập dữ liệu:**
  - Lưu trữ tự động, an toàn và tức thì trên trình duyệt người dùng qua LocalStorage & IndexedDB.
  - **Export Data (Sao lưu):** Tải toàn bộ dữ liệu (lịch sử test, streak, sổ tay lỗi) về máy dưới dạng file `toeic-progress-backup.json`.
  - **Import Data (Khôi phục):** Tải file JSON lên để khôi phục hoặc chuyển đổi sang máy tính khác dễ dàng.
- **Bộ dữ liệu mẫu (Demo Data Switcher):**
  - Cung cấp sẵn nút bật dữ liệu demo (gồm các buổi test mẫu chân thực, biểu đồ rực rỡ, danh sách bẫy đã ghi chú sẵn) để người dùng chiêm ngưỡng ngay vẻ đẹp giao diện.
  - Nút "Reset / Xóa trắng để bắt đầu hành trình của tôi" bất cứ lúc nào.

### 3.6. Phân hệ 6: Kiến trúc mở rộng tương lai (Speaking & Writing Roadmap)
- **Bộ chuyển đổi kỹ năng (Skill Switcher):**
  - Header trang bị bộ chọn trực quan: `[◉ Listening & Reading (990)]` và `[○ Speaking & Writing (400) - Sắp ra mắt]`.
  - Khi bấm sang S&W: Hiển thị giao diện lộ trình phát triển (Roadmap Preview) với cấu trúc thang điểm 0–400 (Speaking 0–200 với 11 câu hỏi / 8 level, Writing 0–200 với 8 câu hỏi / 9 level) và danh sách tiêu chí chấm điểm chuẩn (Pronunciation, Intonation, Grammar, Relevance).
  - Toàn bộ Schema dữ liệu được thiết kế dạng module đa kỹ năng để khi kích hoạt code S&W sẽ không ảnh hưởng đến dữ liệu L&R.

---

## 4. HỆ THỐNG THIẾT KẾ THỊ GIÁC (MODERN DARK PRO DESIGN SYSTEM)

### 4.1. Bảng màu chủ đạo (Color Palette)

| Vai trò màu | Tên mã màu | Giá trị HEX | Ứng dụng giao diện |
| :--- | :--- | :--- | :--- |
| **Nền chính (Background)** | Slate Void | `#090D16` | Nền tổng thể toàn bộ trang web, tối sâu, chống chói mắt. |
| **Nền Card (Surface)** | Slate Midnight | `#111827` | Bề mặt các card thông tin, dashboard widget. |
| **Nền Card phụ (Elevated)** | Slate Darker | `#1F2937` | Bề mặt khi hover, popup modal, dropdown menu. |
| **Viền & Ngăn cách (Border)** | Slate Stroke | `#374151` | Viền mỏng 1px tinh tế, hiệu ứng viền phát sáng nhẹ. |
| **Màu Streak (Flame)** | Neon Orange / Amber | `#F97316` / `#FB923C` | Ngọn lửa chuỗi ngày học, khiên bảo vệ, cảnh báo kỷ luật. |
| **Màu Mục tiêu 990** | Electric Violet | `#8B5CF6` / `#A855F7` | Đường kẻ đích 990, huy hiệu Grandmaster, hiệu ứng vinh danh. |
| **Màu Listening** | Cyan Tech | `#06B6D4` / `#38BDF8` | Chỉ số Listening, Part 1 đến Part 4. |
| **Màu Reading** | Emerald Energy | `#10B981` / `#34D399` | Chỉ số Reading, Part 5 đến Part 7, trạng thái Mastered. |
| **Chữ chính (Text Primary)** | Pure Slate | `#F8FAFC` | Tiêu đề, số điểm to, chỉ số quan trọng. |
| **Chữ phụ (Text Muted)** | Muted Silver | `#94A3B8` | Chú thích, nhãn mô tả, ngày tháng. |

### 4.2. Kiểu chữ & Bố cục (Typography & Layout)
- **Phông chữ:** `Inter`, `Plus Jakarta Sans` hoặc hệ phông System Sans-serif hiện đại, nét đậm sắc nét, hỗ trợ tiếng Việt đầy đủ.
- **Hiệu ứng thị giác (Micro-interactions & Glow Effects):**
  - Card bo góc mềm mại (`rounded-2xl`).
  - Viền card có gradient phát sáng nhẹ khi hover (`hover:border-slate-500 transition-all duration-300`).
  - Hiệu ứng pháo hoa giấy (Confetti Animation) bùng nổ khi phá kỷ lục điểm mới hoặc đạt mốc thăng hạng.
  - Hoạt ảnh đốm lửa bập bùng nhẹ nhàng ở icon Streak.

---

## 5. KIẾN TRÚC KỸ THUẬT & LƯỢC ĐỒ DỮ LIỆU (TECHNICAL ARCHITECTURE)

### 5.1. Tech Stack
- **Framework:** React 18+ (Single Page Application, siêu nhanh, không độ trễ).
- **Công cụ build:** Vite (Khởi động tức thì < 300ms, hot module reload thần tốc).
- **Styling:** Tailwind CSS 3.4+ (Tiện ích hóa tối đa, responsive mượt mà trên cả Mobile, Tablet và Desktop).
- **Icons:** `lucide-react` (Hơn 1000+ biểu tượng vector hiện đại, tinh gọn).
- **Biểu đồ (Data Visualization):** `recharts` (Thư viện biểu đồ chuẩn React hỗ trợ Line, Area, Radar, Bar, Pie với tooltip tương tác mượt mà).
- **Hiệu ứng khen thưởng:** `canvas-confetti` (Pháo hoa chúc mừng khi đạt kỷ lục điểm).
- **Lưu trữ:** LocalStorage có cơ chế serialize an toàn + Hỗ trợ Export/Import JSON chuẩn cấu trúc.

### 5.2. Lược đồ dữ liệu cốt lõi (TypeScript Data Models)

```typescript
// 1. Phân loại kỹ năng
export type SkillType = 'LR' | 'SW';

// 2. Chi tiết điểm theo từng Part của Listening & Reading
export interface LRPartScore {
  part1: number; // Tối đa 6 câu
  part2: number; // Tối đa 25 câu
  part3: number; // Tối đa 39 câu
  part4: number; // Tối đa 30 câu
  part5: number; // Tối đa 30 câu
  part6: number; // Tối đa 16 câu
  part7: number; // Tối đa 54 câu
}

// 3. Phân loại nguyên nhân sai
export type ErrorCategory = 
  | 'VOCABULARY_TRAP'     // Bẫy từ vựng / Paraphrase
  | 'ADVANCED_GRAMMAR'    // Ngữ pháp nâng cao
  | 'LISTENING_SPEED'     // Tốc độ nghe / Nối âm / Giọng lạ
  | 'TIME_PRESSURE'       // Cháy giờ / Không kịp đọc
  | 'CARELESS_DISTRACTION'// Đọc ẩu / Mất tập trung
  | 'OTHER';

// 4. Bản ghi Sổ tay lỗi sai & Bẫy đề
export interface MistakeEntry {
  id: string;
  sessionId?: string;
  part: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  questionContext: string; // Nội dung hoặc số câu
  userMistake: string;     // Đáp án chọn sai & lý do
  correctAnswer: string;   // Đáp án đúng & bài học rút ra
  category: ErrorCategory;
  tags: string[];          // ví dụ: ['part5-inversion', 'trap-synonym']
  status: 'NEEDS_REVIEW' | 'MASTERED';
  createdAt: string;       // ISO Date string
}

// 5. Bản ghi một buổi học / Luyện đề
export interface StudySession {
  id: string;
  skillType: SkillType;
  sessionType: 'FULL_TEST' | 'PART_PRACTICE';
  testName: string;        // ví dụ: 'ETS 2024 Test 02'
  date: string;            // 'YYYY-MM-DD'
  durationMinutes: number; // Thời gian làm bài
  
  // Dành cho L&R
  rawListening?: number;   // 0 - 100
  rawReading?: number;     // 0 - 100
  scaledListening?: number;// 5 - 495
  scaledReading?: number;  // 5 - 495
  totalScore?: number;     // 10 - 990
  partScores?: LRPartScore;
  
  notes?: string;
  createdAt: string;
}

// 6. Cấu hình người dùng & Gamification
export interface UserProfile {
  targetScore: number;     // Mặc định 990
  examDate: string;        // Ngày thi dự kiến 'YYYY-MM-DD'
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;   // Khiên bảo vệ chuỗi
  lastStudyDate: string;   // 'YYYY-MM-DD'
  dailyMinGoalMinutes: number;
  motto: string;           // Lời cam kết cá nhân
  selectedSkill: SkillType;
}
```

### 5.3. Thuật toán quy đổi điểm ETS (ETS Scoring Matrix Algorithm)
Hệ thống tích hợp bảng ma trận quy đổi Raw Score -> Scaled Score chuẩn xác theo phổ điểm ETS quốc tế. Thuật toán tự động tra bảng:
- `rawListeningToScaled(raw: 0..100) -> 5..495`
- `rawReadingToScaled(raw: 0..100) -> 5..495`
- Tự động hiển thị khoảng điểm chuẩn và cảnh báo các mốc tiệm cận tuyệt đối 495.

---

## 6. LỘ TRÌNH TRIỂN KHAI PHÁT TRIỂN (DEVELOPMENT ROADMAP)

- **Giai đoạn 1: Khởi tạo nền tảng & Design System**
  - Thiết lập dự án React + Vite + Tailwind CSS với bảng màu Modern Dark Pro.
  - Xây dựng Layout Header/Sidebar, Skill Switcher, và bộ định dạng chỉ số.
- **Giai đoạn 2: Quản lý trạng thái & Lưu trữ LocalStorage / Demo Data**
  - Xây dựng Data Store, bộ chuyển đổi Demo Data, xuất nhập file JSON.
  - Tích hợp Engine tính điểm ETS chuẩn quốc tế.
- **Giai đoạn 3: Dashboard & Cơ chế Gamification**
  - Lập trình bộ tính Streak, bảo vệ khiên, tính Rank Tier và đếm ngược ngày thi.
  - Tích hợp hiệu ứng pháo hoa khi đạt kỷ lục điểm.
- **Giai đoạn 4: Bộ ghi nhận bài tập (Full Test & Part Practice) & Sổ tay bẫy**
  - Xây dựng Modal / Form nhập điểm chi tiết từng Part.
  - Xây dựng giao diện Sổ tay lỗi sai (Mistake Notebook) với bộ lọc thông minh.
- **Giai đoạn 5: Biểu đồ phân tích chuyên sâu (Analytics Dashboard)**
  - Tích hợp biểu đồ Recharts: Score Timeline (có đường mục tiêu 990), Radar Chart 7 Part, Error Breakdown.
- **Giai đoạn 6: Kiểm thử, Tối ưu hóa & Hoàn thiện tài liệu**
  - Kiểm thử tương thích các độ phân giải màn hình, xác thực dữ liệu nhập, đóng gói sẵn sàng sử dụng.

---
*Tài liệu Spec.md được biên soạn theo chuẩn công nghệ EdTech quốc tế, đóng vai trò kim chỉ nam cho toàn bộ quá trình lập trình và mở rộng sản phẩm.*
