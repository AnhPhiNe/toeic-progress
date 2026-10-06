import React from 'react';
import { 
  Mic, 
  PenTool, 
  Sparkles, 
  Layers
} from 'lucide-react';

export const SpeakingWritingRoadmap: React.FC = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Hero Banner */}
      <div className="ui-card p-6 sm:p-8 space-y-3 bg-gradient-to-br from-indigo-50/50 via-white to-pink-50/30 dark:from-slate-900 dark:via-[#121A2B] dark:to-purple-950/20">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Mô-đun Mở Rộng Tiếp Theo (Thang Điểm 400)</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
          Lộ Trình Toàn Diện: TOEIC Speaking & Writing
        </h2>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
          Hệ thống đã chuẩn bị sẵn sàng cấu trúc dữ liệu mô-đun để tích hợp 2 kỹ năng Nói & Viết ngay sau khi bạn cán mốc 900+ Listening & Reading.
        </p>
      </div>

      {/* Target & Score Structure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Speaking (200 điểm) */}
        <div className="ui-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">TOEIC Speaking</h3>
                <span className="text-xs text-pink-600 dark:text-pink-400 font-semibold">Thang điểm 0 - 200 (Level 1 đến 8)</span>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 font-bold border border-pink-200 dark:border-pink-900">
              ~20 Phút
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Tổng cộng <strong>11 câu hỏi</strong> kiểm tra độ phát âm, ngữ điệu, phản xạ giao tiếp công sở và diễn đạt quan điểm độc lập.
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 1 - 2: Đọc to đoạn văn (Read Aloud)</span>
              <span className="text-pink-600 dark:text-pink-400 font-semibold">Phát âm & Ngữ điệu</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 3 - 4: Miêu tả tranh (Describe a Picture)</span>
              <span className="text-pink-600 dark:text-pink-400 font-semibold">Từ vựng & Ngữ pháp</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 5 - 7: Trả lời câu hỏi (Respond to Questions)</span>
              <span className="text-pink-600 dark:text-pink-400 font-semibold">Phản xạ tức thì</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 8 - 10: Trả lời theo thông tin</span>
              <span className="text-pink-600 dark:text-pink-400 font-semibold">Xử lý dữ liệu</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 11: Trình bày quan điểm (Express Opinion)</span>
              <span className="text-pink-600 dark:text-pink-400 font-semibold">Lập luận 60 giây</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Mục tiêu khuyến nghị:</span>
            <strong className="text-pink-600 dark:text-pink-400 font-bold">180 - 200 điểm (Level 8 Master)</strong>
          </div>
        </div>

        {/* Writing (200 điểm) */}
        <div className="ui-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">TOEIC Writing</h3>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Thang điểm 0 - 200 (Level 1 đến 9)</span>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900">
              60 Phút
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Tổng cộng <strong>8 câu hỏi</strong> đánh giá kỹ năng viết email thương mại, ngữ pháp chính xác và bài luận phân tích quan điểm 300 từ.
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 1 - 5: Viết câu dựa trên tranh & 2 từ</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Ngữ pháp tuyệt đối</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 6 - 7: Phản hồi email công sở</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Văn phong chuyên nghiệp</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 flex flex-wrap justify-between items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Câu 8: Viết bài luận quan điểm (Opinion Essay)</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Tối thiểu 300 từ</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Mục tiêu khuyến nghị:</span>
            <strong className="text-amber-600 dark:text-amber-400 font-bold">180 - 200 điểm (Level 8-9 Master)</strong>
          </div>
        </div>

      </div>

      {/* Modular Readiness Assurance */}
      <div className="ui-card p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase">
            <Layers className="w-4 h-4" />
            <span>Kiến Trúc Đã Sẵn Sàng</span>
          </div>
          <h4 className="text-base font-bold text-slate-900 dark:text-white">
            Tập trung cao độ cho Listening & Reading 990 trước
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Toàn bộ cơ sở dữ liệu đã được thiết kế mở rộng sẵn sàng. Khi bạn hoàn thành mục tiêu 990 L&R, tab Speaking & Writing sẽ kích hoạt ngay các công cụ đo thang 400.
          </p>
        </div>

        <div className="shrink-0 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold block">Tổng Điểm 4 Kỹ Năng</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            1390 Điểm
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">TOEIC All-Star Grandmaster</span>
        </div>
      </div>

    </div>
  );
};
