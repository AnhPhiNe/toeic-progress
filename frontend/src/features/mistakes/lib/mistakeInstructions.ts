/** Keep the entry instructions visible after pasting, using the same Part as parsing/AI. */
export function mistakeInstructions(part: number | null): { label: string; hint: string } {
  if (part === 1) return { label: 'Phương án nghe A–D', hint: 'Dán bốn mô tả nghe A–D. Không cần câu hỏi hay ảnh.' };
  if (part === 2) return { label: 'Câu hỏi + phản hồi A–C', hint: 'Dán một câu hỏi và ba phản hồi A–C.' };
  if (part === 3 || part === 4) return { label: 'Câu hỏi + phương án', hint: 'Dán một câu hỏi kèm phương án.' };
  if (part === 5) return { label: 'Câu hỏi + phương án', hint: 'Dán một câu có chỗ trống và bốn phương án A–D.' };
  if (part === 6) return { label: 'Câu hỏi + phương án', hint: 'Dán câu cần xét kèm phương án. Đoạn đọc thêm ở khung bên dưới.' };
  if (part === 7) return { label: 'Câu hỏi + phương án', hint: 'Dán một câu hỏi kèm phương án. Bài đọc thêm ở khung bên dưới.' };
  return { label: 'Câu hỏi + phương án', hint: 'Chọn Part trước khi phân tích hoặc lưu. Mỗi lần ghi một câu lỗi sai.' };
}
