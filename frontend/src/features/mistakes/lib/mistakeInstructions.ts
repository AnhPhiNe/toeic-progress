/** Keep the entry instructions visible after pasting, using the same Part as parsing/AI. */
export function mistakeInstructions(part: number | null): { label: string; hint: string } {
  if (part === 1) return { label: 'Phương án nghe A–D', hint: 'Dán bốn mô tả nghe A–D bằng văn bản và thêm một ảnh tranh. Không cần nhập câu hỏi.' };
  if (part === 2) return { label: 'Transcript + phản hồi A–C', hint: 'Dán transcript câu hỏi và ba phản hồi A–C. Mỗi lần ghi một câu lỗi sai.' };
  if (part === 3 || part === 4) return { label: 'Transcript + câu hỏi + A–D', hint: 'Dán transcript hội thoại/bài nói, một câu hỏi cần ghi lỗi và A–D. Dán chung trong ô này.' };
  if (part === 5) return { label: 'Câu hỏi + phương án', hint: 'Dán một câu có chỗ trống và bốn phương án A–D.' };
  if (part === 6) return { label: 'Câu hỏi + phương án', hint: 'Dán câu cần xét và A–D, kèm đoạn văn liên quan để AI hiểu mạch văn.' };
  if (part === 7) return { label: 'Câu hỏi + phương án', hint: 'Dán một câu hỏi và A–D bằng văn bản. Thêm bài đọc bằng chữ hoặc ảnh ngữ cảnh bên dưới.' };
  return { label: 'Câu hỏi + phương án', hint: 'Chọn Part trước khi phân tích hoặc lưu. Mỗi lần ghi một câu lỗi sai.' };
}
