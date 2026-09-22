import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Search, 
  Trash2, 
  Tag, 
  X,
  BookOpen,
  Brain
} from 'lucide-react';
import { MistakeEntry, ErrorCategory, ERROR_CATEGORY_LABELS } from '../types';

interface MistakeNotebookViewProps {
  mistakes: MistakeEntry[];
  /** Số thẻ tới hạn ôn hôm nay (SPEC mục 4.6) */
  dueCount: number;
  onStartReview: () => void;
  onAddMistake: (mistake: MistakeEntry) => void;
  onToggleStatus: (mistakeId: string) => void;
  onDeleteMistake: (mistakeId: string) => void;
}

export const MistakeNotebookView: React.FC<MistakeNotebookViewProps> = ({
  mistakes,
  dueCount,
  onStartReview,
  onAddMistake,
  onToggleStatus,
  onDeleteMistake
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'NEEDS_REVIEW' | 'MASTERED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');

  // Modal thêm mới
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMistake, setNewMistake] = useState({
    part: 5 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    questionContext: '',
    userMistake: '',
    correctAnswer: '',
    category: 'VOCABULARY_TRAP' as ErrorCategory,
    tags: ''
  });

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = mistakes.length;
    const mastered = mistakes.filter(m => m.status === 'MASTERED').length;
    const needsReview = total - mastered;
    const masteryRate = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return {
      total,
      mastered,
      needsReview,
      masteryRate
    };
  }, [mistakes]);

  // Danh sách sau khi lọc
  const filteredMistakes = useMemo(() => {
    return mistakes.filter(m => {
      const matchSearch = m.questionContext.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.userMistake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.correctAnswer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchPart = selectedPart === 'ALL' || m.part === selectedPart;
      const matchStatus = selectedStatus === 'ALL' || m.status === selectedStatus;
      const matchCategory = selectedCategory === 'ALL' || m.category === selectedCategory;

      return matchSearch && matchPart && matchStatus && matchCategory;
    });
  }, [mistakes, searchTerm, selectedPart, selectedStatus, selectedCategory]);

  const handleCreateMistake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMistake.questionContext.trim()) return;

    const entry: MistakeEntry = {
      id: `mistake-${Date.now()}`,
      part: newMistake.part,
      questionContext: newMistake.questionContext,
      userMistake: newMistake.userMistake,
      correctAnswer: newMistake.correctAnswer,
      category: newMistake.category,
      tags: newMistake.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: 'NEEDS_REVIEW',
      createdAt: new Date().toISOString()
    };

    onAddMistake(entry);
    setNewMistake({
      part: 5,
      questionContext: '',
      userMistake: '',
      correctAnswer: '',
      category: 'VOCABULARY_TRAP',
      tags: ''
    });
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Sổ Tay Bắt Bẫy & Lỗi Sai</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold">
              Chiến Lược 990
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Giải mã mọi bẫy đề thi và chuyển hóa thành kiến thức đã thông suốt
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onStartReview}
            disabled={dueCount === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Brain className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">
              {dueCount > 0 ? `Ôn ${dueCount} thẻ đến hạn` : 'Chưa có thẻ đến hạn'}
            </span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Ghi Chú Bẫy Mới</span>
          </button>
        </div>
      </div>

      {/* 4 Mini Cards Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ui-card p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Tổng Số Bẫy Đã Lưu</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{stats.total}</span>
          <span className="text-[11px] text-slate-400">Kho kinh nghiệm</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-rose-600 dark:text-rose-400 font-medium block">Cần Ôn Lại</span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 block">{stats.needsReview}</span>
          <span className="text-[11px] text-slate-400">Chưa thuần thục</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Đã Thông Suốt</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{stats.mastered}</span>
          <span className="text-[11px] text-slate-400">Không bao giờ sai lại</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium block">Đến Hạn Ôn Hôm Nay</span>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">{dueCount}</span>
          <span className="text-[11px] text-slate-400">Thuần thục {stats.masteryRate}%</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="ui-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo bẫy, từ khóa, tag..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Part Filter */}
          <select
            value={selectedPart}
            onChange={e => setSelectedPart(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 shadow-2xs"
          >
            <option value="ALL">Tất cả Part</option>
            {[1, 2, 3, 4, 5, 6, 7].map(p => (
              <option key={p} value={p}>Part {p}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 shadow-2xs"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="NEEDS_REVIEW">Cần ôn lại</option>
            <option value="MASTERED">Đã thông suốt</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 shadow-2xs"
          >
            <option value="ALL">Mọi nguyên nhân</option>
            {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => (
              <option key={cat} value={cat}>{val.label}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Mistakes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMistakes.map(mistake => {
          const categoryInfo = ERROR_CATEGORY_LABELS[mistake.category] || ERROR_CATEGORY_LABELS.OTHER;
          const isMastered = mistake.status === 'MASTERED';

          return (
            <div 
              key={mistake.id}
              className={`ui-card p-5 flex flex-col justify-between space-y-3.5 transition-all ${
                isMastered 
                  ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10' 
                  : 'hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <div className="space-y-2.5">
                
                {/* Card Top: Part, Category & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs">
                      Part {mistake.part}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {categoryInfo.label}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm('Xóa lỗi này khỏi sổ tay?')) {
                        onDeleteMistake(mistake.id);
                      }
                    }}
                    className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition"
                    title="Xóa lỗi này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Question Context */}
                <div>
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ngữ cảnh câu hỏi</h4>
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {mistake.questionContext}
                  </p>
                </div>

                {/* User Mistake */}
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 text-xs">
                  <span className="font-semibold text-rose-700 dark:text-rose-400 block mb-0.5">Lỗi sai mắc phải:</span>
                  <p className="text-slate-700 dark:text-slate-300">{mistake.userMistake || 'Chưa ghi chú'}</p>
                </div>

                {/* Correct Answer */}
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 block mb-0.5">💡 Đáp án đúng & Giải mã bẫy:</span>
                  <p className="text-slate-800 dark:text-slate-200 font-medium">{mistake.correctAnswer}</p>
                </div>

                {/* Tags */}
                {mistake.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {mistake.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center space-x-1">
                        <Tag className="w-2.5 h-2.5" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                )}

              </div>

              {/* Card Footer: Status Toggle Button */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {mistake.createdAt ? new Date(mistake.createdAt).toLocaleDateString('vi-VN') : ''}
                </span>

                <button
                  onClick={() => onToggleStatus(mistake.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                    isMastered
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {isMastered ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Đã Thông Suốt</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Cần Ôn Lại</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          );
        })}

        {filteredMistakes.length === 0 && (
          <div className="col-span-full text-center py-12 ui-card text-slate-400 text-xs space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-slate-600 dark:text-slate-400">Không tìm thấy bẫy nào theo bộ lọc.</p>
          </div>
        )}
      </div>

      {/* Modal: Thêm Bẫy Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ghi Chép Bẫy & Lỗi Sai Mới</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMistake} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Part</label>
                  <select
                    value={newMistake.part}
                    onChange={e => setNewMistake({ ...newMistake, part: Number(e.target.value) as any })}
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(p => (
                      <option key={p} value={p}>Part {p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Phân loại lỗi</label>
                  <select
                    value={newMistake.category}
                    onChange={e => setNewMistake({ ...newMistake, category: e.target.value as any })}
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => (
                      <option key={cat} value={cat}>{val.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Vị trí câu / Ngữ cảnh câu hỏi</label>
                <input
                  type="text"
                  required
                  placeholder="vd: Câu 142 Part 5 hoặc Đọc hiểu đôi Part 7..."
                  value={newMistake.questionContext}
                  onChange={e => setNewMistake({ ...newMistake, questionContext: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Lỗi sai mình đã mắc phải</label>
                <textarea
                  rows={2}
                  placeholder="vd: Chọn nhầm phương án B..."
                  value={newMistake.userMistake}
                  onChange={e => setNewMistake({ ...newMistake, userMistake: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">💡 Đáp án đúng & Bí kíp giải bẫy</label>
                <textarea
                  rows={2}
                  required
                  placeholder="vd: Đáp án A vì có cấu trúc..."
                  value={newMistake.correctAnswer}
                  onChange={e => setNewMistake({ ...newMistake, correctAnswer: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Thẻ phân loại (ngăn cách bởi dấu phẩy)</label>
                <input
                  type="text"
                  placeholder="vd: Subjunctive, Part5, Trap"
                  value={newMistake.tags}
                  onChange={e => setNewMistake({ ...newMistake, tags: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm shadow-blue-600/20 cursor-pointer transition active:scale-95"
                >
                  Lưu Vào Sổ Tay
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
