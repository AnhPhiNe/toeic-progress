import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Clock,
  X,
  FileText,
  RotateCcw,
  PlusCircle,
  Layers,
  Headphones,
  BookOpen,
  Zap,
  Award
} from 'lucide-react';
import type { StudySession, MistakeEntry } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { computeSessionAttemptMap, getRetestStats } from '@/shared/data/storage';
import { PART_MAX_QUESTIONS, getPracticeParts } from '@/shared/domain/etsScoring';

import { scoreSourceLabel } from '@/features/study-sessions/lib/fullTestScore';

export interface ExamHistoryViewProps {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme?: 'light' | 'dark';
  onDeleteSession: (sessionId: string) => void;
  onEditSession: (session: StudySession) => void;
  onOpenSessionLogger: () => void;
}

type SortField = 'date' | 'testName' | 'scaledListening' | 'scaledReading' | 'totalScore' | null;
type SortOrder = 'asc' | 'desc';

export const ExamHistoryView: React.FC<ExamHistoryViewProps> = ({
  sessions,
  mistakes,
  onDeleteSession,
  onEditSession,
  onOpenSessionLogger
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'FULL_TEST' | 'PART_PRACTICE'>('ALL');
  const [tableAttemptFilter, setTableAttemptFilter] = useState<'ALL' | 'FIRST_ONLY' | 'RETEST_ONLY'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Metadata lần làm bài & thống kê làm lại
  const attemptMap = useMemo(() => computeSessionAttemptMap(sessions), [sessions]);
  const retestStats = useMemo(() => getRetestStats(sessions), [sessions]);

  // Sắp xếp cột linh hoạt cho bảng (null = mặc định theo ngày mới nhất)
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Modal xem chi tiết bài thi
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<StudySession | null>(null);

  // Đóng modal khi bấm Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSessionDetail) {
        setSelectedSessionDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSessionDetail]);

  // Định dạng ngày hiển thị DD/MM/YYYY
  const formatDateDisplay = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Full tests có điểm
  const fullTests = useMemo(() => {
    return sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0);
  }, [sessions]);

  // Sắp xếp thời gian tăng dần cho tính toán chênh lệch (diff)
  const chronologicalFullTests = useMemo(() => {
    return [...fullTests].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fullTests]);

  // Bản đồ độ lệch điểm số so với bài liền trước
  const sessionDiffMap = useMemo(() => {
    const diffs: Record<string, number | null> = {};
    for (let i = 0; i < chronologicalFullTests.length; i++) {
      const current = chronologicalFullTests[i];
      if (i === 0) {
        diffs[current.id] = null; // Baseline
      } else {
        const prev = chronologicalFullTests[i - 1];
        diffs[current.id] = (current.totalScore || 0) - (prev.totalScore || 0);
      }
    }
    return diffs;
  }, [chronologicalFullTests]);

  // Thống kê nhanh hiển thị ở đầu trang
  const quickStats = useMemo(() => {
    const total = sessions.length;
    const fullCount = fullTests.length;
    const partPracticeCount = sessions.filter(s => s.sessionType === 'PART_PRACTICE').length;
    const maxScore = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.totalScore || 0)) : 0;
    const retestedCount = retestStats.retestCount;

    return {
      total,
      fullCount,
      partPracticeCount,
      maxScore,
      retestedCount
    };
  }, [sessions, fullTests, retestStats]);

  // Lọc danh sách bài làm
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      const matchSearch = s.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchType = filterType === 'ALL' || s.sessionType === filterType;

      const meta = attemptMap[s.id];
      const attemptNum = meta?.attemptNumber || s.attemptNumber || 1;
      const matchAttempt = tableAttemptFilter === 'ALL'
        ? true
        : tableAttemptFilter === 'FIRST_ONLY'
        ? attemptNum === 1
        : attemptNum > 1;

      return matchSearch && matchType && matchAttempt;
    });
  }, [sessions, searchTerm, filterType, tableAttemptFilter, attemptMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, tableAttemptFilter, sortField, sortOrder]);

  // Chu kỳ sắp xếp 3 trạng thái
  const handleSort = (field: Exclude<SortField, null>) => {
    if (sortField === field) {
      if (field === 'testName') {
        if (sortOrder === 'asc') {
          setSortOrder('desc');
        } else {
          setSortField(null);
          setSortOrder('desc');
        }
      } else {
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else {
          setSortField(null);
          setSortOrder('desc');
        }
      }
    } else {
      setSortField(field);
      setSortOrder(field === 'testName' ? 'asc' : 'desc');
    }
  };

  // Sắp xếp danh sách
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      if (!sortField) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'testName') {
        comparison = a.testName.localeCompare(b.testName);
      } else if (sortField === 'scaledListening') {
        comparison = (a.scaledListening || 0) - (b.scaledListening || 0);
      } else if (sortField === 'scaledReading') {
        comparison = (a.scaledReading || 0) - (b.scaledReading || 0);
      } else if (sortField === 'totalScore') {
        comparison = (a.totalScore || 0) - (b.totalScore || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredSessions, sortField, sortOrder]);

  const totalPages = Math.ceil(sortedSessions.length / itemsPerPage) || 1;
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSessions.slice(start, start + itemsPerPage);
  }, [sortedSessions, currentPage, itemsPerPage]);

  // Chi tiết buổi đang xem trong Modal
  const detailPracticeParts = useMemo(
    () => selectedSessionDetail ? getPracticeParts(selectedSessionDetail) : [],
    [selectedSessionDetail]
  );

  const selectedSessionMistakes = useMemo(() => {
    if (!selectedSessionDetail) return [];
    return mistakes.filter(m => m.sessionId === selectedSessionDetail.id);
  }, [mistakes, selectedSessionDetail]);

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      
      {/* Master Card: Chuẩn Neo-Brutalism tinh gọn, không lồng khung */}
      <div className="rounded-3xl border-2 border-slate-900 dark:border-slate-300 bg-white dark:bg-[#111A2C] shadow-[3.5px_3.5px_0px_0px_#0f172a] dark:shadow-[3.5px_3.5px_0px_0px_#cbd5e1] overflow-hidden">
        
        {/* Table Top Toolbar: 1 hàng tinh gọn & đồng bộ */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-900 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Trái: Tiêu đề + Segmented Tabs + Reset Sort nếu có */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-base font-black text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-2">
              <span>📋 Lịch Sử Luyện Đề</span>
            </h2>

            {/* Segmented Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700 w-fit">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer text-xs ${
                  filterType === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white border border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white font-bold'
                }`}
              >
                Tất Cả ({quickStats.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('FULL_TEST')}
                className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer text-xs ${
                  filterType === 'FULL_TEST'
                    ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white border border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white font-bold'
                }`}
              >
                Full Test ({quickStats.fullCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('PART_PRACTICE')}
                className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer text-xs ${
                  filterType === 'PART_PRACTICE'
                    ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white border border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white font-bold'
                }`}
              >
                Luyện Part ({quickStats.partPracticeCount})
              </button>
            </div>

            {sortField && (
              <button
                onClick={() => setSortField(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition cursor-pointer shadow-2xs group w-fit"
                title="Nhấp để HỦY sắp xếp và trở về mặc định (theo ngày)"
              >
                <span>
                  Xếp: {sortField === 'totalScore' ? 'Tổng Điểm' : sortField === 'scaledListening' ? 'Listening' : sortField === 'scaledReading' ? 'Reading' : sortField === 'testName' ? 'Tên đề' : 'Ngày thi'} ({sortOrder === 'desc' ? 'Giảm' : 'Tăng'})
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-200/80 dark:bg-blue-900/80 text-blue-800 dark:text-blue-200 group-hover:bg-rose-200 group-hover:text-rose-800 text-[11px] font-black flex items-center gap-0.5">
                  <X className="w-2.5 h-2.5" /> Hủy
                </span>
              </button>
            )}
          </div>

          {/* Phải: Search + Dropdown + Nút Ghi Điểm */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm tên đề, ghi chú..."
                className="w-full sm:w-44 md:w-56 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            {/* Filter by Attempt: Dropdown */}
            <div className="relative inline-flex items-center">
              <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={tableAttemptFilter}
                  onChange={(e) => setTableAttemptFilter(e.target.value as any)}
                  aria-label="Lọc lượt thi"
                  className="bg-transparent font-bold text-slate-700 dark:text-slate-300 text-xs outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Mọi lượt thi
                  </option>
                  <option value="FIRST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Chỉ đề mới (L1)
                  </option>
                  <option value="RETEST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Chỉ đề làm lại (Retest)
                  </option>
                </select>
              </div>
            </div>

            {/* Button Ghi Điểm Nhanh */}
            <button
              onClick={onOpenSessionLogger}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white border-2 border-slate-900 dark:border-slate-300 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Ghi Điểm</span>
            </button>
          </div>
        </div>

        {/* Table Container: Bỏ border bên trong để bảng liền mạch với vỏ ngoài */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 font-black uppercase text-[11px] select-none tracking-wider">
                {/* Ngày làm */}
                <th 
                  onClick={() => handleSort('date')}
                  className="py-3.5 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap group"
                  title="Nhấp để sắp xếp theo Ngày thi"
                >
                  <div className="flex items-center space-x-1">
                    <span>Ngày</span>
                    <span className={`inline-flex items-center ${sortField === 'date' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                      {sortField === 'date' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Tên đề thi */}
                <th 
                  onClick={() => handleSort('testName')}
                  className="py-3.5 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap group"
                  title="Nhấp để sắp xếp theo Tên đề thi (A-Z)"
                >
                  <div className="flex items-center space-x-1">
                    <span>Tên Đề Thi</span>
                    <span className={`inline-flex items-center ${sortField === 'testName' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                      {sortField === 'testName' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Listening */}
                <th 
                  onClick={() => handleSort('scaledListening')}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap group"
                  title="Nhấp để sắp xếp theo Điểm Listening"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Listening</span>
                    <span className={`inline-flex items-center ${sortField === 'scaledListening' ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                      {sortField === 'scaledListening' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Reading */}
                <th 
                  onClick={() => handleSort('scaledReading')}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-teal-600 dark:hover:text-teal-400 transition-colors whitespace-nowrap group"
                  title="Nhấp để sắp xếp theo Điểm Reading"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Reading</span>
                    <span className={`inline-flex items-center ${sortField === 'scaledReading' ? 'text-teal-600 dark:text-teal-400 font-black' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                      {sortField === 'scaledReading' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Tổng Điểm */}
                <th 
                  onClick={() => handleSort('totalScore')}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap group"
                  title="Nhấp để sắp xếp theo Tổng điểm"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Tổng Điểm</span>
                    <span className={`inline-flex items-center ${sortField === 'totalScore' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                      {sortField === 'totalScore' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Xu Hướng (+/-) */}
                <th className="py-3.5 px-3 text-center whitespace-nowrap">
                  Xu Hướng
                </th>

                {/* Thao tác */}
                <th className="py-3.5 px-5 text-right whitespace-nowrap">
                  Thao Tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {paginatedSessions.length > 0 ? (
                paginatedSessions.map((session) => {
                  const meta = attemptMap[session.id];
                  const attemptNumber = meta?.attemptNumber || session.attemptNumber || 1;
                  const isRetest = attemptNumber > 1;
                  const isFull = session.sessionType === 'FULL_TEST';
                  const diff = isFull ? sessionDiffMap[session.id] : null;

                  // Thống kê số câu đúng của Part lẻ (nếu có)
                  const practiceList = !isFull ? getPracticeParts(session) : [];
                  const totalPracticeCorrect = practiceList.reduce((acc, p) => acc + p.correct, 0);
                  const totalPracticeQuestions = practiceList.reduce((acc, p) => acc + p.total, 0);
                  const practiceAccuracy = totalPracticeQuestions > 0
                    ? Math.round((totalPracticeCorrect / totalPracticeQuestions) * 1000) / 10
                    : null;

                  return (
                    <tr 
                      key={session.id} 
                      onClick={() => setSelectedSessionDetail(session)}
                      className={`transition-colors cursor-pointer group ${
                        !isFull
                          ? 'bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/50 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Cột 1: Ngày làm độc lập */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs sm:text-sm">
                        {formatDateDisplay(session.date)}
                      </td>

                      {/* Cột 2: Tên đề thi & Thời gian & Badge */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span 
                            className="font-black text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition" 
                            title={`${session.testName} · ${scoreSourceLabel(session)}`}
                          >
                            {session.testName}
                          </span>

                          {isFull && session.scoreSource && <span className="text-[10px] text-slate-500 dark:text-slate-400">{scoreSourceLabel(session)}</span>}
                          {/* Badge Lần thi / Part lẻ */}
                          {isFull ? (
                            isRetest ? (
                              <span 
                                className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                title={`Làm lại lần thứ ${attemptNumber} của bộ đề này`}
                              >
                                Lần {attemptNumber}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                Lần 1
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-slate-950 border border-slate-900">
                              ⚡ Luyện Part
                            </span>
                          )}

                          {session.durationMinutes && (
                            <span 
                              className="text-[11px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
                              title={`Thời gian làm: ${session.durationMinutes} phút`}
                            >
                              ⏱ {session.durationMinutes}'
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Các cột điểm Full Test vs Part lẻ */}
                      {isFull ? (
                        <>
                          {/* Listening */}
                          <td className="py-4 px-3 text-center font-mono whitespace-nowrap tabular-nums">
                            {session.scaledListening ? (
                              <span className="font-black text-xs sm:text-sm text-indigo-600 dark:text-indigo-400">
                                {session.scaledListening}đ
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-bold">—</span>
                            )}
                          </td>

                          {/* Reading */}
                          <td className="py-4 px-3 text-center font-mono whitespace-nowrap tabular-nums">
                            {session.scaledReading ? (
                              <span className="font-black text-xs sm:text-sm text-teal-600 dark:text-teal-400">
                                {session.scaledReading}đ
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-bold">—</span>
                            )}
                          </td>

                          {/* Tổng Điểm */}
                          <td className="py-4 px-3 text-center font-mono whitespace-nowrap tabular-nums">
                            {session.totalScore ? (
                              <span className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                                {session.totalScore}đ
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-bold">—</span>
                            )}
                          </td>
                        </>
                      ) : (
                        /* Gộp 3 cột điểm của Part lẻ thành 1 pill thông tin giàu ý nghĩa */
                        <td colSpan={3} className="py-4 px-3 text-center">
                          {totalPracticeQuestions > 0 ? (
                            <div className="inline-flex items-center gap-2.5 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-amber-300/80 dark:border-amber-800/80 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-2xs">
                              <span>🎯 Đúng <strong className="text-amber-600 dark:text-amber-400 font-black">{totalPracticeCorrect}/{totalPracticeQuestions} câu</strong></span>
                              {practiceAccuracy !== null && (
                                <>
                                  <span className="w-[1.5px] h-3 bg-slate-300 dark:bg-slate-700"></span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black">{practiceAccuracy}% chính xác</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs font-bold">Luyện tập kỹ năng</span>
                          )}
                        </td>
                      )}

                      {/* Xu Hướng (+/-) */}
                      <td className="py-4 px-3 text-center whitespace-nowrap tabular-nums">
                        {isFull ? (
                          diff !== null && diff !== undefined ? (
                            diff > 0 ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-mono tabular-nums">
                                +{diff}đ
                              </span>
                            ) : diff < 0 ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-black bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-mono tabular-nums">
                                {diff}đ
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold text-xs font-mono">
                                0đ
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-xs font-bold">Mốc đầu</span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs font-mono font-medium">Part lẻ</span>
                        )}
                      </td>

                      {/* Thao tác (Sửa + Xóa - bỏ con mắt thừa) */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditSession(session);
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center justify-center cursor-pointer shadow-2xs"
                            title="Sửa bản ghi này"
                            aria-label={`Sửa bản ghi ${session.testName}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Xóa bản ghi bài thi "${session.testName}"?`)) {
                                onDeleteSession(session.id);
                              }
                            }}
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500 transition flex items-center justify-center cursor-pointer shadow-2xs"
                            title="Xóa bài thi này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <History className="w-8 h-8 mx-auto mb-2.5 opacity-30" />
                    <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">
                      Không tìm thấy bài thi phù hợp
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {sessions.length === 0
                        ? 'Bạn chưa ghi nhận bài thi nào. Hãy bắt đầu bằng cách ghi điểm bài thi đầu tiên!'
                        : 'Thử điều chỉnh lại từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc phía trên.'}
                    </p>
                    {sessions.length === 0 && (
                      <button
                        onClick={onOpenSessionLogger}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Ghi Điểm Ngay</span>
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        {totalPages > 1 && (
          <div className="p-3.5 px-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Hiển thị {Math.min((currentPage - 1) * itemsPerPage + 1, sortedSessions.length)} - {Math.min(currentPage * itemsPerPage, sortedSessions.length)} trong số {sortedSessions.length} bài
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition cursor-pointer text-xs"
              >
                Trước
              </button>
              <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-200 text-xs">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition cursor-pointer text-xs"
              >
                Sau
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 4. Modal Xem Chi Tiết Bài Thi (Part 1 - 7, Thời Lượng, Ghi Chú & Sổ Tay Bẫy) */}
      {selectedSessionDetail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in"
          onClick={() => setSelectedSessionDetail(null)}
        >
          <div 
            className="relative w-full max-w-2xl my-6 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200/60 dark:border-blue-800/60 shadow-2xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                    {selectedSessionDetail.testName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold">{formatDateDisplay(selectedSessionDetail.date)}</span>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold text-xs ${
                      selectedSessionDetail.sessionType === 'FULL_TEST'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                    }`}>
                      {selectedSessionDetail.sessionType === 'FULL_TEST' ? 'Full Test 200 câu' : 'Luyện Part'}
                    </span>
                    {selectedSessionDetail.sessionType === 'FULL_TEST' && attemptMap[selectedSessionDetail.id] && (
                      <>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded font-black text-xs ${
                          attemptMap[selectedSessionDetail.id].isRetest
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          Lần {attemptMap[selectedSessionDetail.id].attemptNumber}
                        </span>
                      </>
                    )}
                    {selectedSessionDetail.durationMinutes && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {selectedSessionDetail.durationMinutes} phút
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score Strip Banner */}
            <div className="grid grid-cols-3 gap-2.5 p-4 bg-slate-100/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800">
              {/* Tổng Điểm */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-center shadow-2xs">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Tổng Điểm
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
                  {selectedSessionDetail.totalScore ? `${selectedSessionDetail.totalScore}đ` : '--'}
                </div>
                {sessionDiffMap[selectedSessionDetail.id] !== undefined && sessionDiffMap[selectedSessionDetail.id] !== null && (
                  <div className="mt-1">
                    {sessionDiffMap[selectedSessionDetail.id]! > 0 ? (
                      <span className="inline-flex items-center text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-full">
                        <TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{sessionDiffMap[selectedSessionDetail.id]}đ
                      </span>
                    ) : sessionDiffMap[selectedSessionDetail.id]! < 0 ? (
                      <span className="inline-flex items-center text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="w-2.5 h-2.5 mr-0.5" />{sessionDiffMap[selectedSessionDetail.id]}đ
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">0đ so với trước</span>
                    )}
                  </div>
                )}
              </div>

              {detailPracticeParts.length > 0 ? (
                <div className="col-span-2 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs space-y-1.5">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    Các Part đã luyện
                  </span>
                  {detailPracticeParts.map((pp, i) => {
                    const acc = pp.total > 0 ? Math.round((pp.correct / pp.total) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate min-w-0">
                          Part {pp.part}
                        </span>
                        <span className="tabular-nums whitespace-nowrap shrink-0 text-slate-600 dark:text-slate-300">
                          {pp.correct}/{pp.total} câu
                          <span className="ml-1.5 font-bold text-blue-700 dark:text-blue-300">{acc}%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* Listening */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-center shadow-2xs">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                      Listening
                    </span>
                    <div className="text-xl sm:text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {selectedSessionDetail.scaledListening ? `${selectedSessionDetail.scaledListening}đ` : '--'}
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
                      {selectedSessionDetail.rawListening !== undefined 
                        ? `${selectedSessionDetail.rawListening}/100 câu` 
                        : selectedSessionDetail.partScores 
                        ? `${(selectedSessionDetail.partScores.part1 || 0) + (selectedSessionDetail.partScores.part2 || 0) + (selectedSessionDetail.partScores.part3 || 0) + (selectedSessionDetail.partScores.part4 || 0)}/100 câu` 
                        : '--'}
                    </span>
                  </div>

                  {/* Reading */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-center shadow-2xs">
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">
                      Reading
                    </span>
                    <div className="text-xl sm:text-2xl font-black font-mono text-teal-600 dark:text-teal-400 mt-0.5">
                      {selectedSessionDetail.scaledReading ? `${selectedSessionDetail.scaledReading}đ` : '--'}
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
                      {selectedSessionDetail.rawReading !== undefined 
                        ? `${selectedSessionDetail.rawReading}/100 câu` 
                        : selectedSessionDetail.partScores 
                        ? `${(selectedSessionDetail.partScores.part5 || 0) + (selectedSessionDetail.partScores.part6 || 0) + (selectedSessionDetail.partScores.part7 || 0)}/100 câu` 
                        : '--'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Scrollable Body Content */}
            <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
              {/* Head-to-head Retest Comparison Panel */}
              {selectedSessionDetail.sessionType === 'FULL_TEST' && attemptMap[selectedSessionDetail.id]?.isRetest && attemptMap[selectedSessionDetail.id]?.firstSession && (() => {
                const meta = attemptMap[selectedSessionDetail.id];
                const first = meta.firstSession!;
                const diffTotal = (selectedSessionDetail.totalScore || 0) - (first.totalScore || 0);
                const diffLC = (selectedSessionDetail.scaledListening || 0) - (first.scaledListening || 0);
                const diffRC = (selectedSessionDetail.scaledReading || 0) - (first.scaledReading || 0);

                return (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <RotateCcw className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                          So Sánh Đối Đầu Với Lần 1 ({formatDateDisplay(first.date)})
                        </h4>
                      </div>
                      <span className="text-xs font-black text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                        Lần {meta.attemptNumber} (Làm lại)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {/* Tổng Điểm */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-xs text-slate-400 block font-semibold">Tổng Điểm</span>
                        <div className="font-mono font-black text-sm text-slate-900 dark:text-white mt-0.5">
                          {first.totalScore}đ ➔ {selectedSessionDetail.totalScore}đ
                        </div>
                        <span className={`text-xs font-black block mt-0.5 ${
                          diffTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {diffTotal >= 0 ? `+${diffTotal}` : diffTotal} điểm
                        </span>
                      </div>

                      {/* Listening */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 block font-semibold">Listening</span>
                        <div className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {first.scaledListening !== undefined && selectedSessionDetail.scaledListening !== undefined ? `${first.scaledListening}đ ➔ ${selectedSessionDetail.scaledListening}đ` : 'Chưa đủ điểm L/R'}
                        </div>
                        <span className="text-xs font-black text-slate-500 dark:text-slate-400 block mt-0.5">
                          {first.scaledListening !== undefined && selectedSessionDetail.scaledListening !== undefined ? `${diffLC >= 0 ? '+' : ''}${diffLC}đ` : '—'}
                        </span>
                      </div>

                      {/* Reading */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-xs text-teal-600 dark:text-teal-400 block font-semibold">Reading</span>
                        <div className="font-mono font-black text-sm text-teal-600 dark:text-teal-400 mt-0.5">
                          {first.scaledReading !== undefined && selectedSessionDetail.scaledReading !== undefined ? `${first.scaledReading}đ ➔ ${selectedSessionDetail.scaledReading}đ` : 'Chưa đủ điểm L/R'}
                        </div>
                        <span className="text-xs font-black text-teal-600 dark:text-teal-400 block mt-0.5">
                          {first.scaledReading !== undefined && selectedSessionDetail.scaledReading !== undefined ? `${diffRC >= 0 ? '+' : ''}${diffRC}đ` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Part Breakdown 1-7 */}
              {selectedSessionDetail.partScores ? (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>Chi Tiết Số Câu Đúng Từng Part (1 - 7)</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Listening Parts (1-4) */}
                    <div className="space-y-2 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        <span className="flex items-center gap-1.5">
                          <Headphones className="w-3.5 h-3.5" />
                          Listening (Part 1 - 4)
                        </span>
                        <span className="font-mono text-xs">
                          {(selectedSessionDetail.partScores.part1 || 0) + (selectedSessionDetail.partScores.part2 || 0) + (selectedSessionDetail.partScores.part3 || 0) + (selectedSessionDetail.partScores.part4 || 0)}/100 đúng
                        </span>
                      </div>

                      {([
                        { key: 'part1', code: 'P1', name: 'Mô tả tranh', max: PART_MAX_QUESTIONS.part1, score: selectedSessionDetail.partScores.part1 || 0 },
                        { key: 'part2', code: 'P2', name: 'Hỏi & Đáp', max: PART_MAX_QUESTIONS.part2, score: selectedSessionDetail.partScores.part2 || 0 },
                        { key: 'part3', code: 'P3', name: 'Hội thoại', max: PART_MAX_QUESTIONS.part3, score: selectedSessionDetail.partScores.part3 || 0 },
                        { key: 'part4', code: 'P4', name: 'Bài nói ngắn', max: PART_MAX_QUESTIONS.part4, score: selectedSessionDetail.partScores.part4 || 0 },
                      ] as const).map(p => {
                        const acc = Math.round((p.score / p.max) * 100);
                        return (
                          <div key={p.key} className="flex items-center justify-between gap-2 text-xs py-1">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className="w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center justify-center shrink-0">
                                {p.code}
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                {p.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                {p.score}/{p.max}
                              </span>
                              <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-500 rounded-full" 
                                  style={{ width: `${acc}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-slate-400 w-8 text-right font-semibold">
                                {acc}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reading Parts (5-7) */}
                    <div className="space-y-2 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800 text-xs font-bold text-teal-700 dark:text-teal-300">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          Reading (Part 5 - 7)
                        </span>
                        <span className="font-mono text-xs">
                          {(selectedSessionDetail.partScores.part5 || 0) + (selectedSessionDetail.partScores.part6 || 0) + (selectedSessionDetail.partScores.part7 || 0)}/100 đúng
                        </span>
                      </div>

                      {([
                        { key: 'part5', code: 'P5', name: 'Điền câu', max: PART_MAX_QUESTIONS.part5, score: selectedSessionDetail.partScores.part5 || 0 },
                        { key: 'part6', code: 'P6', name: 'Điền đoạn văn', max: PART_MAX_QUESTIONS.part6, score: selectedSessionDetail.partScores.part6 || 0 },
                        { key: 'part7', code: 'P7', name: 'Đọc hiểu văn bản', max: PART_MAX_QUESTIONS.part7, score: selectedSessionDetail.partScores.part7 || 0 },
                      ] as const).map(p => {
                        const acc = Math.round((p.score / p.max) * 100);
                        return (
                          <div key={p.key} className="flex items-center justify-between gap-2 text-xs py-1">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className="w-6 h-6 rounded bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center shrink-0">
                                {p.code}
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                {p.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                {p.score}/{p.max}
                              </span>
                              <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-teal-500 rounded-full" 
                                  style={{ width: `${acc}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-slate-400 w-8 text-right font-semibold">
                                {acc}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 text-center">
                  Bài làm này không ghi nhận chi tiết Part 1 - 7 (chỉ lưu tổng điểm hoặc kết quả luyện nhanh).
                </div>
              )}

              {/* Notes Section */}
              {selectedSessionDetail.notes && (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Ghi Chú & Đánh Giá Cá Nhân</span>
                  </h4>
                  <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/60 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line font-mono">
                    {selectedSessionDetail.notes}
                  </div>
                </div>
              )}

              {/* Linked Mistakes Section */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-rose-500" />
                    <span>Lỗi Sai & Bẫy Đã Lưu Vào Sổ Tay ({selectedSessionMistakes.length})</span>
                  </span>
                </h4>
                {selectedSessionMistakes.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSessionMistakes.map(m => {
                      const catInfo = ERROR_CATEGORY_LABELS[m.category];
                      return (
                        <div 
                          key={m.id} 
                          className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-xs">
                                Part {m.part}
                              </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {m.questionContext}
                              </span>
                            </div>
                            {catInfo && (
                              <span 
                                className="px-2 py-0.5 rounded-full font-bold text-xs shrink-0"
                                style={{ backgroundColor: catInfo.bg, color: catInfo.color }}
                              >
                                {catInfo.label}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-xs">
                            <div className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded-lg">
                              <span className="font-bold">Lỗi chọn: </span>{m.userMistake}
                            </div>
                            <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-1.5 rounded-lg">
                              <span className="font-bold">Đáp án đúng: </span>{m.correctAnswer}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                    Không có câu hỏi nào được lưu vào Sổ tay bẫy từ bài thi này.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-3.5 px-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs">
              <span className="text-slate-400 text-xs">
                Nhấn phím <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-xs text-slate-700 dark:text-slate-300">Esc</kbd> hoặc nhấp ra ngoài để đóng
              </span>
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
