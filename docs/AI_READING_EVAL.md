# Đánh giá nghĩa và giải thích TOEIC Reading

Bộ câu tự soạn để kiểm tra prompt, không phải đề hay đáp án chính thức ETS. Câu inventory đầu tiên dựa trên ví dụ người dùng cung cấp. Cập nhật 08/10/2026; **đã chạy 17 lượt OpenAI thật**: 11 lượt ban đầu, 5 lượt bổ sung sau chỉnh định dạng/dịch nghĩa và 1 lượt kiểm tra khớp đáp án Part 6, không retry tự động. Đây là đánh giá giới hạn của prompt/provider/grounding, chưa kiểm chứng đăng nhập, CAPTCHA, quota app hay đồng bộ dịch vụ thật.

## Cách đánh giá

Dán một câu mỗi lần, ghi lựa chọn/lý do chỉ khi có thật. So sánh cùng bộ câu trước/sau thay đổi prompt, ghi lại model/effort, phiên bản prompt, ngày chạy và kết quả từng câu. Không tự gọi lại lượt extraction lỗi. Lưu kết quả đánh giá riêng với nội dung học của người dùng.

Mỗi câu đạt khi: giữ nguyên câu/phương án; đúng đáp án hoặc báo thiếu ngữ cảnh; mỗi phương án có một nghĩa đủ ý và đúng từ loại; nghĩa đáp án nhất quán với bản dịch/phân tích; giải thích phương án nhiễu theo dấu hiệu cụ thể; không bịa lựa chọn/lý do/bằng chứng. Chấp nhận bản dịch diễn đạt khác mà cùng nghĩa, không chấm bằng việc khớp nguyên văn một chuỗi tiếng Việt.

Các test Python dùng `MockTransport` chỉ kiểm tra cấu trúc và bảo toàn dữ liệu; không chấm được chất lượng ngữ nghĩa của model thật. Việc sửa prompt không tự cập nhật những thẻ đã lưu.

## Kết quả AI thật ngày 08/10/2026

- Model `gpt-6-luna`, effort `medium`, cùng schema/provider/grounding trong code hiện tại. Prompt SHA-256: `96cc6ad3a56e3563c49da89e6f4ee25b3099a3dbdd6f77f353ca4f77c0dba315`.
- 11 request thành công, không fallback/retry; 9/9 câu có đáp án khớp tham chiếu, 2/2 ca thiếu ngữ cảnh trả MISSING. Tổng thời gian 109,5 giây, trung vị 8,7 giây/request. Kết quả khớp đáp án không đồng nghĩa mọi mục dịch/giải thích đều đạt.
- Không cung cấp đáp án nguồn cho model: 9 câu đủ dữ liệu trả AI_PROPOSED; các trường lựa chọn/lý do được giữ theo hợp đồng API. Chỉ câu inventory-list có lựa chọn A do người dùng đã cung cấp; các câu còn lại dùng UNKNOWN, lý do trống. Không ghi database hoặc dữ liệu học cá nhân.
- Kết quả nguyên văn và input nằm ở `scratch/reading-live-results.json` (Git bỏ qua, không chứa credential); script đánh giá ở `scratch/live-reading-eval.py` từ chối chạy lại khi file kết quả đã tồn tại để tránh nhân request trả phí.

| Nhóm | Quan sát thực tế | Kết luận |
| :--- | :--- | :--- |
| inventory-list | B: "bản kiểm kê hàng tồn kho; phù hợp với đồ trang trí hiện có trong kho". Bản dịch và phân tích đều dùng bản kiểm kê. | Lỗi thiếu nghĩa/nghĩa không nhất quán người dùng nêu không xuất hiện ở lượt này. |
| inventory-stock | A: hàng tồn kho; bản dịch giữ nghĩa lượng hàng chưa bán/dư thừa. | Phân biệt được hai nghĩa của cùng từ. |
| issue-publication / issue-problem | Số/tập phát hành của tạp chí / vấn đề hoặc sự cố hệ thống sưởi. | Đáp án và nghĩa theo ngữ cảnh khớp. |
| charge-fee / charge-phrase | Phụ phí / in charge of = phụ trách. | Xét đúng nghĩa từ và cả cụm. |
| grammar-forms | B officially, từ loại và phân tích đúng. Bản dịch chỉ ghi "Lịch trình đã được thông báo chính thức vào thứ Hai", bỏ ý revised. | Đáp án đạt; độ đầy đủ bản dịch chưa đạt. |
| part6-contrast | B However; phân tích đối lập làm từ xa/ở tại chỗ. | Khớp tham chiếu. Câu tự soạn có Meanwhile cũng gần nghĩa, cần nâng chất lượng ca đánh giá trước khi dùng làm thước đo chọn đáp án duy nhất. |
| part7-details | B; evidence trích đúng "Additional guests cost $10 per visit", paraphrase per visit khớp đáp án. | Không nhầm per visit/per month, không bịa thông tin đăng ký/cuối tuần. |
| part6-missing-context | Để trống đáp án, yêu cầu câu trước. | Không chọn bừa một từ nối. |
| part7-missing-context | Để trống đáp án, yêu cầu thông báo/bài đọc. evidence chứa thông báo thiếu thay vì chuỗi rỗng. | Không bịa bằng chứng; có thể chuẩn hóa cách biểu diễn mục evidence thiếu trong prompt. |

**Điểm cần tinh chỉnh được phát hiện ở lượt ban đầu:** nghĩa A–D thường kèm lý do loại đáp án, làm dài và lặp với analysis; cần chỉ để nghĩa trong optionNotes và dành giải thích loại đáp án cho analysis. Bản dịch phải giữ cả tính từ/mô tả như revised, không chỉ giữ đáp án. Mẹo về một mẫu như "of [hàng hóa] in stock" cần tránh diễn đạt thành quy tắc chọn từ áp dụng mọi câu. Lượt ban đầu chưa bao gồm các thay đổi/lượt bổ sung bên dưới.

Ảnh `scratch/inventory-live-input.jpg`, `scratch/inventory-live-preview.jpg`, `scratch/inventory-live-details.jpg` chụp giao diện React hiện tại trong bản thử riêng dùng lại kết quả AI thật đã nhận. Thao tác xem/chụp không gọi thêm model và không kiểm thử Auth/quota/sync. Không sửa nguyên văn AI chỉ để ảnh trông gọn hơn.

## Lượt bổ sung: nghĩa TOEIC nói chung, phân tích Reading

Người dùng chốt nghĩa A–D thường gặp trong TOEIC Listening & Reading, có nghĩa phù hợp câu hỏi; phân tích vẫn tập trung Reading. Prompt đã tách nghĩa khỏi nhận xét đúng/sai, yêu cầu mỗi dấu hiệu/phương án một dòng, và đối chiếu bản dịch đầy đủ với câu nguồn. Giao diện giữ xuống dòng của AI; đoạn cũ được tách theo câu khi trình duyệt hỗ trợ `Intl.Segmenter`, không ghi lại dữ liệu học.

- Lượt chỉnh đầu: 3 request inventory-list, inventory-stock, grammar-forms, cùng model/effort; prompt SHA-256 `52d295e7ad0e110a25b3813d681a5751809d902851bcc6bcac3b0dc1a6465eb3`. Cả ba đúng đáp án tham chiếu, nghĩa chỉ gồm bản dịch/dạng từ và phân tích có 5 dòng riêng. Hai nghĩa inventory phù hợp ngữ cảnh; grammar-forms vẫn bỏ revised trong translation. Kết quả `scratch/reading-format-live-results.json`.
- Sau khi siết đối chiếu từng cụm mang nghĩa: 2 request inventory-list và grammar-forms; prompt cuối SHA-256 `360de876de59dbb1852481acf27674137904c617a416a99ecc6de1544947e0b9`. Cả hai đúng đáp án tham chiếu, nghĩa ngắn và phân tích có 5 dòng. Inventory ghi "hàng tồn kho; bản kiểm kê hàng hóa", bản dịch/phân tích dùng bản kiểm kê; grammar-forms đã giữ revised là "lịch trình đã được điều chỉnh". Kết quả `scratch/reading-format-confirm-results.json`.
- Giới hạn còn quan sát được: inventory vẫn đặt hàng tồn kho trước bản kiểm kê, dù prompt ưu tiên nghĩa đang dùng trước. Bản dịch grammar-forms đủ ý nhưng lặp "đã được", chưa thật tự nhiên. Đây là kiểm tra một lần ở từng phiên bản, không chứng minh mọi câu đều đạt hoặc đã kiểm chứng lại toàn bộ Part 6/7 trên prompt cuối.
- Ảnh mới `scratch/inventory-format-preview.jpg` và `scratch/inventory-format-analysis.jpg` chụp React thật với phản hồi nguyên văn của lượt cuối. Bản thử localhost chỉ dùng lại kết quả đã nhận để xem/chụp, không gửi thêm AI, không ghi database hoặc đồng bộ.

## Bộ câu

### Kiểm tra lỗi khớp đáp án Part 6

Sau khi người dùng báo AI có lời giải nhưng không tô phương án xanh, strict schema đã ràng buộc `correctAnswer` vào các phương án gốc cho input có cấu trúc. Một request thật bổ sung (không retry) với câu "We have reviewed your application for the position of Marketing Assistant. ____, we would like to invite you to an interview at our office next Tuesday." và However / Therefore / Because / Meanwhile, chọn C, không đáp án nguồn: trả **(B) Therefore**, **AI_PROPOSED**, 11,66 giây. Backend giữ đề xuất và phương án gốc; nhãn xanh AI đề xuất dùng cùng luồng UI hiện tại. Model/effort như trên; input và kết quả ở `scratch/reading-part6-answer-results.json`. Đây là lượt thứ 17 tổng cộng; không kiểm chứng lại Auth/quota/sync.

| ID | Part | Câu hỏi / ngữ cảnh và phương án | Đáp án tham chiếu và điều cần kiểm tra |
| :--- | :--- | :--- | :--- |
| inventory-list | 5 | The latest ____ of decorations in stock indicates that Festal Seasons Ltd. is well prepared for the holiday rush. (A) proposal (B) inventory (C) consideration (D) commitment | B: bản kiểm kê/danh mục hàng tồn. Không chỉ ghi "hàng tồn kho" rồi dịch cả câu thành "bản kiểm kê". Cả bốn là danh từ; cần giải thích nghĩa cả cụm. |
| inventory-stock | 5 | The retailer reduced its excess ____ by offering a discount on unsold products. (A) inventory (B) inspection (C) itinerary (D) income | A: hàng tồn kho. Không bắt mọi câu có inventory đều thành bản kiểm kê. |
| issue-publication | 5 | The latest ____ of the company magazine features an interview with the new director. (A) issue (B) concern (C) fault (D) dispute | A: số/tập phát hành. Ghi chú và bản dịch cùng xét "of the company magazine". |
| issue-problem | 5 | Technicians are investigating an ____ with the heating system. (A) invitation (B) issue (C) edition (D) achievement | B: vấn đề/sự cố. Không dịch thành số phát hành vì câu trước trong bộ test dùng nghĩa đó. |
| charge-fee | 5 | An additional ____ applies to deliveries outside the city. (A) charge (B) accusation (C) responsibility (D) battery | A: khoản phí. Không dùng nghĩa buộc tội, trách nhiệm hoặc sạc điện. |
| charge-phrase | 5 | Ms. Tran is in ____ of training new employees. (A) fee (B) charge (C) cost (D) payment | B: cụm in charge of = phụ trách. Phương án phải ghi nghĩa của cụm đang xét; không lấy nghĩa phí của charge đứng riêng. |
| grammar-forms | 5 | The revised schedule was ____ announced on Monday. (A) official (B) officially (C) officialize (D) officialdom | B: trạng từ bổ nghĩa announced; phân biệt dạng từ/từ loại, không tạo mẹo thuần nghĩa cho câu kiểm tra cấu trúc. |
| part6-contrast | 6 | Most teams will work remotely next week. ____, the reception team must remain on site to welcome visitors. (A) Therefore (B) However (C) Similarly (D) Meanwhile | B: tuy nhiên, quan hệ tương phản giữa hai nhóm. Nếu bỏ câu trước, AI phải nhận ra thiếu căn cứ thay vì luôn chọn B. |
| part7-details | 7 | Notice: Members may bring one guest per month at no charge. Additional guests cost $10 per visit. Question: What is stated about additional guests? (A) They pay a monthly fee. (B) They are charged for each visit. (C) They must register online. (D) They can visit only on weekends. | B: phí theo mỗi lượt. Bằng chứng có trong bài; phân biệt per visit/per month, không suy ra đăng ký hay cuối tuần. |

## Ca biên

- Bỏ đáp án nguồn: lời giải đủ căn cứ dùng AI_PROPOSED, không tự gắn PROVIDED.
- Đáp án nguồn không khớp hoặc có mâu thuẫn: giữ cảnh báo, không tự thay bằng đáp án đoán.
- Không ghi lý do/không nhớ lựa chọn: không bịa tâm lý của người học.
- Thiếu đoạn văn quyết định ở Part 6/7: báo phần cần bổ sung, không bịa bằng chứng.
- Phương án dài: nghĩa ngắn nhưng đủ ý; không cắt bỏ phủ định, đơn vị, thời gian hoặc mệnh đề quyết định.
- Nguồn nhiều câu là lỗi đã biết của grounding cũ; cần chặn/tách theo spec một câu, không đánh dấu đã sửa chỉ vì prompt yêu cầu.
