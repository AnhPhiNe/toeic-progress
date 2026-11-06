# Kiểm kê thao tác thủ công trên desktop (viewport >= 1024px)

Mục đích: làm nền cho thiết kế "AI-first" trên desktop. Đây là bản kiểm kê, không sửa code, không đề xuất giao diện chi tiết.

Quy ước nguồn số liệu:
- "(test: ...)" = đếm từ chuỗi thao tác của một Playwright test hoặc helper trong `tests/e2e`.
- "(code: ...)" = đếm từ đọc code, chưa có test chạy đúng chuỗi đó.
- "ước tính" = suy luận của người kiểm kê, chưa kiểm chứng bằng chạy thật.
- "Click" gồm cả bấm nút, chọn option, nhấn phím Enter/Ctrl+V; "ô" = một ô phải gõ hoặc chọn giá trị. Không tính thao tác đóng/mở hộp chọn file của hệ điều hành.

## 0. Năng lực AI hiện có (dùng chung cho mọi luồng)

| Hàm / endpoint | Vào | Ra | Giới hạn | Nguồn |
|---|---|---|---|---|
| `readResultsWithAI` -> `POST /api/v1/ai/read-results` | 1-8 ảnh trang kết quả (`MAX_RESULT_IMAGES = 8`) | `wrong[]`, `skipped[]`, `scores` (L, R, tổng), `timing` (tổng, L, R, Part 1-7 theo giây) | Một lần gọi = một lượt AI. Không đọc tên đề, không đọc ngày. Backend cố ý bỏ `part5Minutes/6/7` khỏi `scores` | `aiMistakeExtractor.ts:248`, `backend/app/integrations/openai_provider.py:360`, prompt `backend/app/services/toeic_prompt.py:294` |
| `extractPageWithAI` -> `/ai/extract-page` | 1-3 ảnh màn hình trang chữa bài + danh sách `{number, part}` cần tìm | Tối đa 6 câu mỗi lần: câu hỏi, phương án, bạn chọn, đáp án, phân loại lỗi, `explainTicket` | `pageSchema.items.max(6)` (`aiMistakeExtractor.ts:177-185`); một lần gọi = một lượt AI | `aiMistakeExtractor.ts:189` |
| `explainBatchWithAI` -> `/ai/explain-batch` | `explainTicket` từ lần đọc trang + danh sách câu | Lời giải, mẹo, nghĩa phương án | Dùng ticket, không tốn thêm lượt | `aiMistakeExtractor.ts:299` |
| `extractMistakeWithAI` -> `/ai/extract` | Văn bản dán (20-8000 ký tự), ảnh chỉ làm ngữ cảnh Part 1/Part 7 | Một thẻ câu sai đầy đủ | Không đọc ảnh chụp câu hỏi thường; bắt buộc có chữ | `aiMistakeExtractor.ts:89` |
| Cờ cấu hình | `getAIConfiguration` đọc `/health` | `resultImages`, `pageImages`, `structuredInput`, `freeformInput`, `managedAccess`, `part1Images`, `part7Images`, `persistentImages`, `learnerCategory` | `result_image_reading` và `page_image_extraction` backend để cố định `True` | `aiMistakeExtractor.ts:15, 53-62`, `backend/app/api/routes/health.py:18-26` |

Quyền dùng AI (áp dụng cho mọi luồng bên dưới):
- Khi `managed_ai_access` bật, khách chưa đăng nhập bị chặn: hàm gọi `requestAISignIn()` rồi ném lỗi "Đăng nhập Google để dùng AI..." (`aiMistakeExtractor.ts:65-78`). Khi tắt, khách dùng phiên ẩn danh + captcha Turnstile.
- Hạn mức mặc định trong code: khách 3 lượt, tài khoản 10 lượt mỗi tháng (`backend/app/core/config.py:56-57`; giá trị triển khai thật chưa kiểm). Giới hạn tốc độ 10 yêu cầu AI mỗi phút (`config.py:44`).
- Nút AI trên desktop luôn hiện (chỉ ẩn nếu `resultImages === false`, `WrongQuestionGrid.tsx:154,206`); khách chỉ biết mình bị chặn sau khi bấm.

Hệ quả hạn mức cho một lần ghi đề kiểu AI-first (ước tính): 1 lượt đọc kết quả + ceil(số câu Reading sai / 6) lượt đọc trang. Ví dụ 18 câu Reading sai = 1 + 3 = 4 lượt, tức 40% hạn mức tháng mặc định của tài khoản. Lời giải không tốn thêm nhờ ticket.

## 1. Ghi điểm đề Full Test (modal "Ghi điểm")

Bắt đầu: nút "Ghi điểm, phím tắt N" (Topbar) mở `SessionLoggerModal.tsx`. Màn mặc định trên desktop là lưới 200 câu (`wrongEntry`, `SessionLoggerModal.tsx:334`, `DesktopFullTestBody.tsx`).

### 1a. Đường hiện tại

| Đường | Chuỗi thao tác | Số bước | Nguồn |
|---|---|---|---|
| Gõ số câu sai | Ghi điểm (N) -> gõ tên đề -> "Gõ số câu" -> gõ danh sách -> "Áp dụng" -> "Lưu điểm" | 4 click + 2 ô | test: `helpers/detailAI.ts:46-57` (`openDesktopFlow`) |
| Chạm từng số | Ghi điểm -> tên đề -> chạm k số -> "Lưu điểm" | 2 click + k click + 1 ô (k = số câu sai, đề 700 điểm thường 50-80) | test: `desktop-wrong-questions.spec.ts:10-18, 41` |
| Ảnh kết quả (đường AI) | Ghi điểm -> tên đề -> Ctrl+V (hoặc "Dán ảnh" + chọn file) -> hộp "Kiểm tra điểm từ ảnh" tự bật, bấm "Áp dụng điểm từ đề" -> nếu ảnh có thời gian: bấm "Áp dụng" ở khối "Thời gian từ ảnh" -> "Lưu điểm" | 4-5 click + 1 ô (ước tính; test chỉ phủ đoạn dán ảnh tô câu, mock không trả điểm/thời gian: `helpers/resultsAI.ts`) | code: `WrongQuestionGrid.tsx:133,181-185`, `SessionLoggerModal.tsx:422,430` |
| Điểm chính thức L/R | Ghi điểm -> tên đề -> "+ Nhập ›" -> gõ L -> gõ R (tổng tự cộng) -> "Áp dụng điểm từ đề" -> (đánh dấu câu sai nếu muốn) -> "Lưu điểm" | 4 click + 3 ô (không tính câu sai) | test: `official-score-on-grid.spec.ts:13-61` |
| Số câu đúng mỗi Part | Ghi điểm -> tên đề -> "Số câu đúng mỗi Part" -> gõ 7 ô Part (mặc định 0) -> "Lưu kết quả" | 3 click + 8 ô (ước tính từ `SessionLoggerModal.tsx:795-988`; test chỉ kiểm chuyển chế độ: `desktop-wrong-questions.spec.ts:58-71`) | code |

Ngoài chuỗi trên, màn desktop còn hiển thị sẵn ngày (`#session-date`, mặc định hôm nay) và thời lượng (`#session-duration`, mặc định 120 phút, `SessionLoggerModal.tsx:617-655`). Người học không chạm vào thì đề vẫn lưu "120 phút", dù không phải số thật (rủi ro dữ liệu giả, xem mục 1e).

### 1b. Quyết định người học phải đưa ra trên màn này

1. Tab loại buổi: Full Test / Luyện Part / Từ vựng (`SessionLoggerModal.tsx:553-582`).
2. Tên đề (bắt buộc, trống mặc định trên desktop).
3. Ngày làm, thời lượng (luôn hiển thị).
4. Cách nhập: chạm lưới / "Gõ số câu" / "Dán ảnh" / "Số câu đúng mỗi Part" / "Điểm chính thức" / "+ Nhập ›" ở thẻ điểm (6 lối vào cùng một việc, `DesktopFullTestBody.tsx:93-224`).
5. Trong hộp điểm: chế độ "Listening + Reading" hay "Chỉ tổng điểm" (`ResultScoreReview.tsx:149-179`), rồi "Áp dụng" hay "Dùng điểm ước tính".
6. Trong khối thời gian: ô tổng, Listening, Reading và từng Part (tối đa 10 ô giờ:phút:giây), "Áp dụng" hay "Bỏ qua thời gian" (`ResultTimingReview.tsx`); ngoài ra còn dải "thời gian Part 5-7" riêng với modal chỉnh (`PartTimingModal.tsx`, `DesktopFullTestBody.tsx:179-184`).
7. Ghi chú (nút mở/đóng, `DesktopFullTestBody.tsx:187-249`).
8. Ở panel nhập điểm trực tiếp (đường "Điểm chính thức" cũ): hai nút chế độ + checkbox "Ghi thêm số câu đúng từng Part" (`SessionLoggerModal.tsx:739-765`).
9. Hộp xác nhận "Bạn không sai câu nào? Đề sẽ được lưu 990 điểm." khi để trống (`SessionLoggerModal.tsx:431`).
10. Banner đề làm lại (Retest) chỉ thông báo, không phải quyết định (`:658-672`).

### 1c. AI đã làm được gì và UI có đưa lên đầu không

- Đã làm được: `readResultsWithAI` trả câu sai/bỏ trống, điểm L/R/tổng, thời gian; code đã nối đủ vào lưới (`WrongQuestionGrid.tsx:157-193`) và vào hai hộp xác nhận.
- UI: là đường phụ. Nút "Dán ảnh" chỉ là một trong hai nút nhỏ (cạnh "Gõ số câu") ở cột phải; Ctrl+V toàn form có hoạt động nhưng không có gợi ý nào nói vậy ngoài dòng chữ nhỏ ở `WrongQuestionGrid.tsx:341`. Màn đầu tiên vẫn là 200 nút số, tức mặc định là nhập tay.
- Thiếu: AI không đọc tên đề, ngày; không có đường ảnh cho Luyện Part, Từ vựng.
- Không thống nhất: backend loại `part5Minutes/6/7` khỏi `scores` nhưng `ResultScoreReview.tsx:77,259-291` vẫn dựng khối "Thời gian Reading Part 5-7 bóc tách từ ảnh" từ các trường đó. Theo code đọc được, khối này không bao giờ có dữ liệu thật (thời gian đi qua `timing` ở khối khác). Cần xác minh trước khi giữ.

### 1d. Trường có thể suy ra thay vì hỏi

| Trường | Cách suy ra | Căn cứ |
|---|---|---|
| Tên đề | Gợi ý đề kế tiếp (`suggestNextTestName`); hiện chỉ điện thoại được dùng | `SessionLoggerModal.tsx:254-256` |
| Ngày | Mặc định hôm nay (đã có); có thể lấy từ ảnh nếu mở rộng prompt | đã có |
| Thời lượng | Lấy từ `timing.totalSeconds` của ảnh; nếu không có thì đừng điền 120 | `applyImageTiming` ở `:143-152` |
| Điểm L/R/tổng | Từ ảnh (đã có); nếu ảnh không có thì ước tính từ số câu sai | đã có |
| Danh sách câu sai | Từ ảnh (đã có) | đã có |
| Có phải làm lại không | Đã tự phát hiện theo tên đề | `:166-183` |

### 1e. Đề xuất hình dạng AI-first

- Hành động chính: một vùng lớn "Dán hoặc thả ảnh kết quả" (Ctrl+V hoạt động ngay khi mở modal). Tên đề được điền sẵn đề kế tiếp.
- Bước xác nhận: một thẻ "Đọc được từ ảnh" gộp 3 thứ hiện đang tách thành 3 chỗ: điểm (L, R, tổng), thời gian (tổng, các phần) và số câu sai theo Part (chip "Part 5: 7 sai"). Nút "Lưu điểm" ở ngay thẻ; mọi ô chỉ bấm vào mới sửa.
- Chuyển vào liên kết "Nhập tay" (một liên kết nhỏ): lưới 200 số, gõ số câu, số câu đúng mỗi Part, điểm chính thức, ngày, thời lượng, ghi chú, tab Luyện Part/Từ vựng giữ như hiện tại.
- Số click sau thay đổi (ước tính): Ghi điểm -> Ctrl+V -> (kiểm thẻ) -> Lưu = 3 click, 0 ô nếu tên đề gợi ý đúng. Với ảnh chưa đủ thông tin: +1 lần dán thêm ảnh.
- Rủi ro:
  - AI sai điểm hoặc câu sai: giữ quy tắc hiện tại, ảnh chỉ là ứng viên, người học phải bấm "Lưu" (đã đúng với `Image values are candidates`, `ResultScoreReview.tsx:27`).
  - Khách: chặn ở lần bấm đầu, cần gợi ý trước khi bấm ("Đăng nhập Google để dùng ảnh") thay vì báo lỗi sau; đường nhập tay phải luôn mở sẵn.
  - Hạn mức: mỗi đề tốn 1 lượt (chưa kể đọc trang chữa bài).
  - Lưu thiếu thời lượng nếu ảnh không có: nên lưu "không rõ" thay vì 120 (cần kiểm tra các chỗ phân tích dùng `durationMinutes`).

## 2. Màn kết quả sau lưu và "Ghi chi tiết N câu sai"

Bắt đầu: sau khi lưu đề mới, `SessionResultScreen.tsx` hiện (nút chính: "Đánh dấu câu sai" / "Ghi chi tiết N câu sai" / "Ôn N câu sai" / "Xong", `SessionResultScreen.tsx:68-71`). "Đánh dấu câu sai" mở lại modal ghi điểm (`App.tsx:223-229`).

| Đường | Chuỗi | Số bước | Nguồn |
|---|---|---|---|
| Ghi chi tiết bằng ảnh trang chữa bài (AI) | Bấm "Ghi chi tiết N câu sai" -> chọn ảnh (hoặc Ctrl+V/thả) -> xem các hàng AI điền sẵn -> sửa hàng cần xem -> "Lưu N câu" | 3 click + 1 lần chọn file (không tính sửa hàng); nếu AI nghi đáp án: +1 click mỗi hàng ("Đổi sang C"/"Giữ A") | test: `desktop-detail-flow.spec.ts:4-67` |
| Ghi chi tiết không dùng AI | Hàng nào cũng chỉ có "Vì sao sai?" (1 select hoặc phím 1-6) và bộ chọn đáp án; nội dung câu hỏi không nhập được ở đây | N hàng x 1-2 click, và câu hỏi/phương án vẫn trống | code: `DetailListFlow.tsx:262-274, 539` |
| Điền nội dung từng thẻ bằng tay | Sổ tay -> thẻ -> Sửa -> modal "Sửa câu sai" (mục 3) | mỗi thẻ ~5-7 thao tác, nhân N | code |

Quyết định phải làm: tab Listening/Reading (nếu có cả hai), mở/đóng từng hàng, chọn lý do mỗi hàng, "Sửa đáp án" (bộ chọn "Bạn chọn" + "Đáp án"), xử lý hàng "Nghi đáp án", nút "+ Thêm ảnh" và "+ Dán ảnh transcript", "Bỏ nháp" khi có nháp (`DetailListFlow.tsx:400-460`).

AI đã làm: `extractPageWithAI` + `explainBatchWithAI`. UI: đây là luồng AI-first nhất hiện có (khung thả/dán ảnh to ở đầu, `:426-438`), nhưng chỉ khi `pageImages !== false`; trên desktop khách vẫn thấy khung và gặp lỗi đăng nhập khi dùng.

Suy ra được: lý do sai (AI đề xuất phân loại; test: `desktop-detail-flow.spec.ts:27`), đáp án đúng, phương án bạn chọn, lời giải; các câu cần tìm (số câu từ danh sách sai đã lưu: `DetailListFlow.tsx:158`). Chỗ đáng hỏi lại: chỉ các hàng "cần xem".

Hình dạng AI-first: bước này đã gần đúng; thay đổi chính là nối liền từ màn kết quả ("Ghi chi tiết" mở thẳng vào chế độ chờ dán ảnh) và gom lượt AI. Phần "nhập tay" cho nội dung câu hỏi hiện không có trong luồng này (phải ra Sổ tay), cần quyết định có thêm "Thêm chi tiết" tại hàng hay không.

Số click sau (ước tính): giữ 3 click. Rủi ro: hạn mức (mỗi 6 câu = 1 lượt, mục 0); ảnh chụp thiếu câu thì lượt đọc thứ hai chỉ hỏi câu còn thiếu (đã có, test dòng 16-18); AI sai đáp án thì có cờ "Nghi đáp án" (đã có).

## 3. Thêm một câu sai (Sổ tay, "Thêm câu sai")

Bắt đầu: nút "Thêm câu sai" ở đầu Sổ tay (`MistakeNotebookView.tsx:442`) mở `MistakeEntryModal.tsx`. Có hai tab: "Nhập tay" và "Quét ảnh AI" (`MistakeEntryModal.tsx:653-681`).

### 3a. Đường hiện tại

| Đường | Chuỗi | Số bước | Nguồn |
|---|---|---|---|
| Nhập tay, lưu thủ công | Thêm câu sai -> chọn Part -> mở "Chọn đề" -> gõ tên đề -> chọn "+ Thêm tên đề" -> dán câu + phương án -> ("Bạn chọn" tùy chọn) -> "Lưu thủ công" | 5 click + 2 ô (+1 click nếu có "Bạn chọn") | test: `mistake-form-compact.spec.ts:38-66`, helper `noteSource.ts` |
| Nhập tay rồi AI | Như trên nhưng bấm "Phân tích với AI" -> màn "Kiểm tra và lưu" -> "Lưu câu sai" | 6-7 click + 2 ô | test: `mistake-form-compact.spec.ts:8-31` |
| Quét ảnh AI (nhiều câu) | Thêm câu sai -> tab "Quét ảnh" -> chọn đề (3 thao tác) -> (tùy chọn gõ số câu) -> thả/dán/chọn ảnh -> chỉnh lỗi sai từng dòng -> "Lưu N câu sai" | 6+ click + 1-2 ô (ước tính) | code: `MistakeEntryModal.tsx:277-426, 684-834, 908-925` |
| Mở từ một đề đã ghi | Đề và phiên được điền sẵn (`initialSourceName`, `initialSessionId`) | bớt 3 thao tác chọn đề | code: props `:40-47` |

### 3b. Quyết định trên màn này

Tab Nhập tay / Quét ảnh AI; Part (3 nút 5, 6, 7, bắt buộc); Đề (bắt buộc); "Lỗi sai" (select); bài đọc chữ hay ảnh (Part 1, Part 7); "Bạn chọn" (A-D); "Đáp án đúng từ đề" (mở/đóng); "Lý do chọn"; hai nút cuối "Lưu thủ công" và "Phân tích với AI"; sau AI còn bước xem trước, "Chỉnh đáp án / lời giải", "Lưu & thêm tiếp". Cộng thêm thanh nháp "Nội dung được tự lưu nháp... Bỏ nháp" hiển thị liên tục (`:645-652`).

### 3c. AI hiện có và vị trí trong UI

- `extractMistakeWithAI` chỉ nhận chữ dán, không nhận ảnh chụp một câu hỏi. Muốn đi từ ảnh, người học phải sang tab "Quét ảnh" (`extractPageWithAI`, chỉ Reading Part 5-7, câu 101-200: `:294-296, 728`).
- "Phân tích với AI" là nút xanh chính trong chân modal nhưng bị khóa trước khi chọn Part, Đề và dán chữ (`validate`, `:215-246`). Cho nên AI chỉ là bước thứ 5-6 trong chuỗi, không phải điểm bắt đầu.
- Có `freeformInput`: backend tách câu/phương án từ chữ thô (`:154,228`), nhưng người học vẫn phải chọn Part và Đề trước.

### 3d. Suy ra được

Part: từ số câu (`partOfQuestion`, đã dùng ở quét ảnh `:300`) hoặc từ kết quả AI (`result.draft.part`, hiện vẫn bắt người học chọn trước: `:217-220`). Đề: từ bộ lọc Sổ tay, đề gần nhất, hoặc phiên đang mở (`defaultSourceName`). Lỗi sai: AI đề xuất, người học chỉ sửa. Đáp án: từ trang chữa bài (`answerSource`).

### 3e. Đề xuất

- Hành động chính: vùng "Dán ảnh hoặc chữ của câu sai" (Ctrl+V), đề được điền sẵn đề gần nhất. Dán xong là phân tích ngay.
- Bước xác nhận: thẻ xem trước hiện có sẵn (Part, câu hỏi, phương án, bạn chọn, đáp án, lỗi sai); người học chỉ sửa "Bạn chọn" nếu AI không biết.
- Chuyển vào "Nhập tay": ô Part, Đề, Lỗi sai, Lý do, Đáp án đúng từ đề, chọn bài đọc chữ/ảnh, nút "Lưu thủ công". Hai tab hiện tại gộp thành một.
- Số click sau (ước tính): Thêm câu sai -> Ctrl+V -> Lưu = 3 click, 0 ô khi đề gợi ý đúng (so với 5 click + 2 ô).
- Rủi ro: ảnh một câu thường (không phải Part 1/7) chưa có endpoint, cần dùng đường `extract-page` với 1 câu (cần thử); tốn 1 lượt mỗi câu nếu không gom; khách bị chặn khi `managedAccess`; AI đoán sai Part thì lưu sai nhóm (cần hiển thị Part rõ trên thẻ xem trước).

## 4. Luyện Part (buổi luyện lẻ)

Bắt đầu: modal "Ghi điểm" -> tab "Luyện Part" (`SessionLoggerModal.tsx:565-575, 994-1084`), hoặc từ Bộ đếm nhịp với thời lượng điền sẵn.

- Đường hiện tại (code, ước tính): Ghi điểm -> tab Luyện Part -> chọn Part (select) -> gõ số câu đúng -> Lưu kết quả = 4 click + 1 ô, thêm 3 thao tác cho mỗi Part khác ("Thêm Part khác" + select + ô). Không có test đếm đúng chuỗi này.
- Quyết định: Part, số câu đúng/tổng, thêm/xóa dòng Part, tên đề (tùy chọn), ngày, thời lượng (mặc định 30), ghi chú.
- AI hiện có: không có. `readResultsWithAI` có thể cho danh sách câu sai của một đề, nhưng chưa dùng cho luyện Part.
- Suy ra: tổng số câu mỗi Part (đã tự điền theo Part), thời lượng từ Bộ đếm nhịp (đã có prefill).
- Đề xuất: không đưa AI lên đầu (giá trị thấp, khối lượng nhập đã nhỏ); chỉ bớt: giữ Part gần nhất, ẩn ngày/thời lượng/ghi chú vào "Thêm chi tiết". Nếu muốn AI: dán ảnh kết quả bài luyện -> điền "số câu đúng" (cần xác minh định dạng ảnh).
- Click sau: 3 click + 1 ô (ước tính). Rủi ro: thấp; không cần AI nên không có vấn đề khách/hạn mức.

## 5. Từ vựng

- Trang Từ vựng, form nhanh: gõ số từ -> "Lưu từ vựng" = 1 ô + 1 click (ngày mặc định hôm nay) (code: `VocabularyView.tsx:142`).
- Qua modal ghi điểm: Ghi điểm -> tab "Từ vựng" -> chip "+20 từ" -> "Lưu từ vựng" = 4 click (code: `SessionLoggerModal.tsx:1102-1133, 1115-1128`).
- Sửa ghi nhận: số từ, nguồn (tùy chọn), Part (tùy chọn, nhiều lựa chọn) (`VocabEditModal.tsx`).
- AI hiện có: không. Có thể đếm tự động nếu lấy từ ứng dụng ôn từ khác, nhưng chưa có nguồn. Không khuyến nghị đưa vào đợt AI-first.
- Điểm gọn: có hai nơi nhập cùng dữ liệu (form nhanh trên trang và tab trong modal ghi điểm) -> chọn một lối chính (trang Từ vựng) và bỏ tab "Từ vựng" khỏi modal, sau đó modal ghi điểm chỉ còn hai tab.

## 6. Mục tiêu tuần (Kế hoạch)

- Đường hiện tại: "Thêm mục tiêu" -> bấm mẫu nhanh (1 đề Full Test / Phút học / Part 5 / Part 7) -> "Lưu mục tiêu" = 3 click (test: `plan-modal.spec.ts:292-295`, dòng 34-37 cho Part 7). Mẫu chip ngay trên trang mở modal đã điền sẵn: 2 click (`PlanView.tsx:415-475`). Sao chép tuần trước: 1 click (`:989`).
- Tùy biến: Tên (bắt buộc), Theo dõi (3 loại), Part, Chỉ tiêu, Đơn vị (chỉ sửa được khi CUSTOM), Màu và ghi chú (gập) -> 4 ô + 2 click (test: `plan-modal.spec.ts:56-69`).
- Điểm thừa: Tên và Đơn vị suy ra từ loại + chỉ tiêu; "Màu & ghi chú" ít dùng; modal xử lý hai lần chuỗi `onChange` giống hệt (`PlanView.tsx:776` và `:1132`).
- AI hiện có: không. Không phải bài toán ảnh; AI-first ở đây nghĩa là gợi ý ("Tuần này nên luyện Part 5 vì yếu nhất") chứ không đọc ảnh.
- Đề xuất: mặc định là một dải gợi ý bấm một lần ("Thêm gợi ý của tuần"), "Tự tạo" thu thành liên kết. Click sau: 1-2. Rủi ro: gợi ý dựa trên dữ liệu phân tích có thể sai khi ít dữ liệu; không cần AI từ backend.

## 7. Kết quả Bộ đếm nhịp (Luyện tốc độ)

- Đường hiện tại: Bắt đầu -> Xong bài -> (hộp "Kết quả Part 5") -> Lưu thời gian = 3 click (test: `pacing.spec.ts:115-121, finishReading`). Thêm điểm: +1 ô "Số câu đúng"; thêm đề: +3 thao tác (mở picker, gõ, chọn) (`PacingDialogs.tsx:26-41`, test `nameResult` `pacing.spec.ts:28-31`).
- Quyết định: có gắn đề không, có chấm không (cả hai tùy chọn), với Pomodoro thì chọn pha tiếp theo.
- AI hiện có: không.
- Suy ra: tên đề của lượt gần nhất (người học thường luyện cùng đề Part 5 rồi Part 6); số câu đúng từ ảnh kết quả luyện (chưa kiểm chứng ảnh nguồn). Đề xuất: điền sẵn tên đề lần trước, đưa ô "Số câu đúng" lên đầu; AI đọc ảnh chưa cần ở đợt đầu. Click sau: 2-3.

## 8. Cài đặt / hồ sơ

`SettingsModal.tsx:328-356`: tên, câu nói, điểm mục tiêu, ngày thi, phút/ngày, khiên chuỗi. Nhập một lần, không phải thao tác lặp; AI không liên quan. Hợp lý khi giữ nguyên, chỉ bảo đảm onboarding hỏi điểm mục tiêu và ngày thi một lần (`OnboardingCard.tsx`).

## 9. Năm nguồn gây rối hàng đầu trên desktop

1. `SessionLoggerModal.tsx` (1176 dòng): một modal gánh 3 loại buổi, 3 cách nhập điểm Full Test, và bảy thẻ Part lặp mã (`:795-988`); các nút "Số câu đúng mỗi Part", "Điểm chính thức", "Đánh dấu câu sai" ở hai nơi (`DesktopFullTestBody.tsx:205-223` và `SessionLoggerModal.tsx:697-735`).
2. Hai giao diện cho cùng việc nhập điểm chính thức: hộp `ResultScoreReview` (`WrongQuestionGrid.tsx:293-306`) và panel trực tiếp (`SessionLoggerModal.tsx:739-765`), mỗi bên một bộ chế độ L+R/Chỉ tổng.
3. Chuỗi xác nhận sau khi đọc ảnh kết quả bị tách thành ba chỗ: hộp điểm tự bật (`ResultScoreReview.tsx`), khối thời gian chặn lưu cho đến khi áp dụng/bỏ (`ResultTimingReview.tsx`, `SessionLoggerModal.tsx:422`), modal thời gian Part (`PartTimingModal.tsx`). Một ảnh = tối đa 3 lần xác nhận, mỗi lần có cách thoát riêng.
4. `ResultImageButton` (`WrongQuestionGrid.tsx:96-385`): một component làm cả thẻ điểm, 3 trạng thái nhập điểm, chế độ gõ số, ô dán ảnh, ghi chú trạng thái; cùng một hàm có hai nhánh giao diện (có/không `scoreCard`) cho desktop và điện thoại.
5. Các thanh trạng thái xếp trên nội dung: "Đã khôi phục bản nháp / Bỏ nháp" và cảnh báo lưu nháp ở mọi form (`SessionLoggerModal.tsx:521-541`, `MistakeEntryModal.tsx:645-652`, `DetailListFlow.tsx:417`), hiển thị cả khi chưa có nháp (thanh của Sổ tay luôn hiện "Nội dung được tự lưu nháp...").

Đáng ghi nhận thêm: `MistakeEntryModal.tsx` (965 dòng) trộn Nhập tay, Quét ảnh, bước xem trước, chế độ bài đọc chữ/ảnh trong một component; tên đề trống mặc định trên desktop dù hàm gợi ý đã có (`SessionLoggerModal.tsx:255`).

## 10. Thứ tự đề xuất triển khai (lợi ích / rủi ro)

| # | Việc | Công sức | Tiết kiệm | Rủi ro | Ghi chú |
|---|---|---|---|---|---|
| 1 | Điền sẵn tên đề kế tiếp trên desktop; ẩn ngày, thời lượng, ghi chú vào "Thêm chi tiết"; không lưu 120 phút khi người học chưa chạm | Rất nhỏ | 1 ô + 2 ô nhìn thấy mỗi lần | Thấp (cần kiểm các chỗ dùng `durationMinutes`) | Có sẵn `suggestNextTestName` |
| 2 | Màn Ghi điểm đề: vùng dán ảnh làm hành động chính, một thẻ xác nhận gộp điểm + thời gian + câu sai; lưới 200 số và các chế độ khác sau "Nhập tay" | Trung bình (bỏ 3 hộp xác nhận, hợp nhất 2 UI điểm chính thức) | Lớn nhất: 4-5 click + 3-8 ô -> 3 click | Trung bình: AI sai/đọc thiếu, khách bị chặn | Backend sẵn sàng; cần gợi ý đăng nhập TRƯỚC khi bấm |
| 3 | Từ màn kết quả vào thẳng "Ghi chi tiết" ở trạng thái chờ ảnh; gom lượt AI để tiết kiệm hạn mức | Nhỏ-trung bình | Giữ 3 click nhưng bỏ bước tìm ảnh | Hạn mức (ceil(n/6) lượt) | Luồng này đã AI-first |
| 4 | Thêm câu sai: dán ảnh/chữ làm hành động chính, Part và Đề tự suy ra, gộp hai tab | Trung bình-lớn | 5 click + 2 ô -> 3 click | Trung bình: chưa có endpoint ảnh cho một câu thường, AI đoán sai Part | Cần quyết định kỹ thuật: dùng `extract-page` cho 1 câu hay thêm endpoint |
| 5 | Bộ đếm nhịp: điền sẵn tên đề; đưa "Số câu đúng" lên đầu | Nhỏ | 1-3 thao tác | Thấp | Không cần AI |
| 6 | Từ vựng và Kế hoạch: bỏ lối trùng (tab Từ vựng trong modal ghi điểm; gợi ý một lần bấm cho kế hoạch) | Nhỏ | 1-2 thao tác | Thấp | Đã ở mức 2-3 click, không phải ưu tiên |
| 7 | Cài đặt, Luyện Part | - | - | - | Giữ nguyên |

Thứ tự đề nghị: 1 -> 2 -> 3 -> 4 -> 5 -> 6. Việc 1 làm ngay vì rủi ro gần bằng 0 và cải thiện cả đường nhập tay; việc 2 là thay đổi lớn nhất đối với người học nên cần mockup trước (đã có quy tắc "mockup trước" trong ghi nhớ dự án).

## 11. Câu hỏi để chủ dự án quyết

1. Khi khách chưa đăng nhập, nút "Dán ảnh" nên hiện ở trạng thái khóa kèm "Đăng nhập Google" ngay từ đầu, hay vẫn cho thấy như bây giờ rồi báo lỗi khi bấm?
2. Hạn mức 10 lượt/tháng (giá trị mặc định trong code) có đủ cho "1 + ceil(n/6) lượt mỗi đề"? Nếu không, có gộp lượt đọc kết quả và đọc trang chữa bài vào cùng một ticket không?
3. Thời lượng làm bài khi ảnh không có: lưu "không rõ" hay giữ 120 phút như hiện nay?
4. Bỏ hộp `ResultScoreReview` hay bỏ panel trực tiếp trong `SessionLoggerModal` (hiện hai cái cùng tồn tại)?
