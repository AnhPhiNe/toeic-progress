import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  Target, 
  Trash2, 
  Search, 
  Award,
  Zap,
  Layers,
  BarChart3,
  Headphones,
  BookOpen,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  X,
  Eye,
  FileText,
  RotateCcw,
  Filter
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine
} from 'recharts';
import { StudySession, MistakeEntry, LRPartScore, UserProfile, ERROR_CATEGORY_LABELS, ChartAttemptFilter } from '../types';
import { calculatePartAccuracy, PART_MAX_QUESTIONS } from '../utils/etsScoring';
import { loadUserProfile, computeSessionAttemptMap, getRetestStats } from '../utils/storage';

// Tên tiếng Việt ngắn gọn, dễ đọc, không rườm rà
const PART_SHORT_NAMES: Record<keyof LRPartScore, string> = {
  part1: 'Part 1: Mô tả tranh',
  part2: 'Part 2: Hỏi & Đáp',
  part3: 'Part 3: Hội thoại',
  part4: 'Part 4: Bài nói ngắn',
  part5: 'Part 5: Điền câu',
  part6: 'Part 6: Điền đoạn văn',
  part7: 'Part 7: Đọc hiểu văn bản'
};

type SortField = 'date' | 'testName' | 'scaledListening' | 'scaledReading' | 'totalScore' | null;
type SortOrder = 'asc' | 'desc';

interface AnalyticsViewProps {
  profile?: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme: 'light' | 'dark';
  onDeleteSession: (sessionId: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  profile,
  sessions,
  mistakes,
  theme,
  onDeleteSession
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'FULL_TEST' | 'PART_PRACTICE'>('ALL');
  const [chartViewMode, setChartViewMode] = useState<'TOTAL' | 'LR'>('TOTAL');
  const [chartAttemptFilter, setChartAttemptFilter] = useState<ChartAttemptFilter>('ALL');
  const [tableAttemptFilter, setTableAttemptFilter] = useState<'ALL' | 'FIRST_ONLY' | 'RETEST_ONLY'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Bản đồ metadata lần làm bài
  const attemptMap = useMemo(() => computeSessionAttemptMap(sessions), [sessions]);
  const retestStats = useMemo(() => getRetestStats(sessions), [sessions]);

  // Sắp xếp cột linh hoạt cho bảng lịch sử (null = mặc định tự nhiên theo ngày mới nhất)
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

  // Lọc danh sách buổi học
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

  // Chu kỳ sắp xếp 3 trạng thái: Chiều 1 -> Chiều 2 -> HỦY SORT (trở về mặc định)
  const handleSort = (field: Exclude<SortField, null>) => {
    if (sortField === field) {
      if (field === 'testName') {
        // Tên đề thi: A->Z -> Z->A -> Hủy
        if (sortOrder === 'asc') {
          setSortOrder('desc');
        } else {
          setSortField(null); // Click lần 3 -> HỦY SORT!
          setSortOrder('desc');
        }
      } else {
        // Điểm số và ngày thi: Giảm dần -> Tăng dần -> Hủy
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else {
          setSortField(null); // Click lần 3 -> HỦY SORT!
          setSortOrder('desc');
        }
      }
    } else {
      setSortField(field);
      setSortOrder(field === 'testName' ? 'asc' : 'desc');
    }
  };

  // Các bài Full Test có điểm
  const fullTests = useMemo(() => {
    return sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0);
  }, [sessions]);

  // SẮP XẾP THỜI GIAN CHUẨN XÁC TĂNG DẦN (Cũ nhất -> Mới nhất, Trái qua Phải) cho Biểu đồ
  const chronologicalFullTests = useMemo(() => {
    return [...fullTests].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fullTests]);

  // Bản đồ tính độ lệch điểm số (diff) so với bài thi ngay trước đó
  const sessionDiffMap = useMemo(() => {
    const diffs: Record<string, number | null> = {};
    for (let i = 0; i < chronologicalFullTests.length; i++) {
      const current = chronologicalFullTests[i];
      if (i === 0) {
        diffs[current.id] = null; // Mốc ban đầu (Baseline)
      } else {
        const prev = chronologicalFullTests[i - 1];
        diffs[current.id] = (current.totalScore || 0) - (prev.totalScore || 0);
      }
    }
    return diffs;
  }, [chronologicalFullTests]);

  // Sắp xếp danh sách bảng theo tiêu chí người dùng chọn (hoặc mặc định theo ngày mới nhất khi null)
  const sortedSessionsForTable = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      if (!sortField) {
        // Mặc định khi chưa sort hoặc đã HỦY sort: Ngày mới nhất lên đầu
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

  // Danh sách lỗi sai ghi nhận từ bài thi được chọn
  const selectedSessionMistakes = useMemo(() => {
    if (!selectedSessionDetail) return [];
    return mistakes.filter(m => m.sessionId === selectedSessionDetail.id);
  }, [mistakes, selectedSessionDetail]);

  const totalPages = Math.ceil(sortedSessionsForTable.length / itemsPerPage) || 1;
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSessionsForTable.slice(start, start + itemsPerPage);
  }, [sortedSessionsForTable, currentPage, itemsPerPage]);

  // Thống kê tổng quan & KPI
  const stats = useMemo(() => {
    const totalTimeHours = Math.round(sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / 60);
    const highest = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.totalScore || 0)) : 0;
    const avg = fullTests.length > 0 ? Math.round(fullTests.reduce((acc, s) => acc + (s.totalScore || 0), 0) / fullTests.length) : 0;
    const highestListening = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledListening || 0)) : 0;
    const highestReading = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledReading || 0)) : 0;

    // Tính điểm bứt phá (Từ bài đầu đến bài gần nhất)
    const firstScore = chronologicalFullTests.length > 0 ? (chronologicalFullTests[0].totalScore || 0) : 0;
    const latestScore = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].totalScore || 0) : 0;
    const breakthrough = latestScore - firstScore;

    // Tính điểm dự báo ETS dựa trên trung bình trọng số 3 bài gần nhất (ETS Projected Score)
    let projectedScore = latestScore;
    if (chronologicalFullTests.length >= 3) {
      const last3 = chronologicalFullTests.slice(-3);
      // Trọng số: 50% đề mới nhất, 30% đề giữa, 20% đề cũ
      const weighted = (last3[2].totalScore || 0) * 0.5 + (last3[1].totalScore || 0) * 0.3 + (last3[0].totalScore || 0) * 0.2;
      projectedScore = Math.round(weighted / 5) * 5; // Quy đổi bội số 5 của ETS
    } else if (chronologicalFullTests.length === 2) {
      const weighted = (chronologicalFullTests[1].totalScore || 0) * 0.6 + (chronologicalFullTests[0].totalScore || 0) * 0.4;
      projectedScore = Math.round(weighted / 5) * 5;
    }

    // Tính độ ổn định (Độ lệch chuẩn điểm số của các bài gần nhất)
    let stability = 0;
    if (fullTests.length > 1) {
      const variance = fullTests.reduce((acc, s) => acc + Math.pow((s.totalScore || 0) - avg, 2), 0) / fullTests.length;
      stability = Math.round(Math.sqrt(variance));
    }

    return {
      totalTests: fullTests.length,
      totalHours: totalTimeHours,
      highest,
      avg,
      highestListening,
      highestReading,
      firstScore,
      latestScore,
      breakthrough,
      projectedScore,
      stability
    };
  }, [sessions, fullTests, chronologicalFullTests]);

  // Danh sách hiển thị trên biểu đồ dựa theo chế độ lọc lần thi (Tất cả / Chỉ lần 1 / Điểm cao nhất)
  const displayedFullTests = useMemo(() => {
    if (chartAttemptFilter === 'FIRST_ONLY') {
      return chronologicalFullTests.filter(s => (attemptMap[s.id]?.attemptNumber || 1) === 1);
    }
    if (chartAttemptFilter === 'BEST_ONLY') {
      const bestByTest: Record<string, StudySession> = {};
      chronologicalFullTests.forEach(s => {
        const key = s.testName.trim().toLowerCase();
        if (!bestByTest[key] || (s.totalScore || 0) > (bestByTest[key].totalScore || 0)) {
          bestByTest[key] = s;
        }
      });
      return Object.values(bestByTest).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return chronologicalFullTests;
  }, [chronologicalFullTests, chartAttemptFilter, attemptMap]);

  // Format Dữ liệu cho Biểu đồ đường diện tích (AreaChart) - Thứ tự chuẩn thời gian
  const chartData = useMemo(() => {
    return displayedFullTests.map((session, idx) => {
      const dateParts = session.date.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : session.date;
      const meta = attemptMap[session.id];
      const attemptNumber = meta?.attemptNumber || session.attemptNumber || 1;
      const isRetest = attemptNumber > 1;

      return {
        id: session.id,
        rawDate: session.date,
        date: formattedDate,
        name: session.testName,
        listening: session.scaledListening || 0,
        reading: session.scaledReading || 0,
        total: session.totalScore || 0,
        testIndex: `Test ${idx + 1}`,
        attemptNumber,
        isRetest,
        scoreDiffFromFirst: meta?.scoreDiffFromFirst,
        scoreDiffFromPrevious: meta?.scoreDiffFromPrevious
      };
    });
  }, [displayedFullTests, attemptMap]);

  // Phân tích trung bình từng Part 1-7
  const partStats = useMemo(() => {
    const validTests = fullTests.filter(t => t.partScores);
    if (validTests.length === 0) return null;

    const totals: LRPartScore = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 };
    validTests.forEach(t => {
      if (t.partScores) {
        totals.part1 += t.partScores.part1 || 0;
        totals.part2 += t.partScores.part2 || 0;
        totals.part3 += t.partScores.part3 || 0;
        totals.part4 += t.partScores.part4 || 0;
        totals.part5 += t.partScores.part5 || 0;
        totals.part6 += t.partScores.part6 || 0;
        totals.part7 += t.partScores.part7 || 0;
      }
    });

    const averages: LRPartScore = {
      part1: Number((totals.part1 / validTests.length).toFixed(1)),
      part2: Number((totals.part2 / validTests.length).toFixed(1)),
      part3: Number((totals.part3 / validTests.length).toFixed(1)),
      part4: Number((totals.part4 / validTests.length).toFixed(1)),
      part5: Number((totals.part5 / validTests.length).toFixed(1)),
      part6: Number((totals.part6 / validTests.length).toFixed(1)),
      part7: Number((totals.part7 / validTests.length).toFixed(1)),
    };

    const accuracy = calculatePartAccuracy(averages);

    return {
      averages,
      accuracy,
      validTestsCount: validTests.length
    };
  }, [fullTests]);

  // Xác định Part yếu nhất (Điểm nghẽn)
  const { weakestPart } = useMemo(() => {
    if (!partStats) return { weakestPart: null };
    let minAcc = 101;
    let worstKey = 'part7' as keyof LRPartScore;

    (Object.keys(partStats.accuracy) as Array<keyof LRPartScore>).forEach(key => {
      const acc = partStats.accuracy[key];
      if (acc < minAcc) {
        minAcc = acc;
        worstKey = key;
      }
    });

    return {
      weakestPart: {
        key: worstKey,
        name: PART_SHORT_NAMES[worstKey],
        accuracy: minAcc,
        avgCorrect: Math.round(partStats.averages[worstKey]),
        max: PART_MAX_QUESTIONS[worstKey]
      }
    };
  }, [partStats]);


  // Phân tích khoảng cách mục tiêu & dư địa điểm số ETS (Target Gap Analysis)
  const targetGap = useMemo(() => {
    const userProfile = profile || loadUserProfile();
    const targetScore = userProfile.targetScore || 900;

    let currentLC = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].scaledListening || 0) : 0;
    let currentRC = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].scaledReading || 0) : 0;

    if (chronologicalFullTests.length >= 3) {
      const last3 = chronologicalFullTests.slice(-3);
      const weightedLC = (last3[2].scaledListening || 0) * 0.5 + (last3[1].scaledListening || 0) * 0.3 + (last3[0].scaledListening || 0) * 0.2;
      const weightedRC = (last3[2].scaledReading || 0) * 0.5 + (last3[1].scaledReading || 0) * 0.3 + (last3[0].scaledReading || 0) * 0.2;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    } else if (chronologicalFullTests.length === 2) {
      const weightedLC = (chronologicalFullTests[1].scaledListening || 0) * 0.6 + (chronologicalFullTests[0].scaledListening || 0) * 0.4;
      const weightedRC = (chronologicalFullTests[1].scaledReading || 0) * 0.6 + (chronologicalFullTests[0].scaledReading || 0) * 0.4;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    }

    const currentScore = stats.projectedScore > 0 ? stats.projectedScore : (currentLC + currentRC);
    
    // Tỷ lệ phân bổ mục tiêu chuẩn ETS (LC thường nhỉnh hơn RC khoảng 20-30đ)
    let targetLC = Math.min(495, Math.round((targetScore * 0.52) / 5) * 5);
    let targetRC = targetScore - targetLC;
    if (targetRC > 495) {
      targetRC = 495;
      targetLC = targetScore - 495;
    }

    const totalGap = Math.max(0, targetScore - currentScore);
    const lcGap = Math.max(0, targetLC - currentLC);
    const rcGap = Math.max(0, targetRC - currentRC);
    const progressPercent = targetScore > 0 ? Math.min(100, Math.round((currentScore / targetScore) * 100)) : 0;

    const lcQuestionsNeeded = Math.ceil(lcGap / 5);
    const rcQuestionsNeeded = Math.ceil(rcGap / 5);

    return {
      targetScore,
      currentScore,
      targetLC,
      targetRC,
      currentLC,
      currentRC,
      totalGap,
      lcGap,
      rcGap,
      progressPercent,
      lcQuestionsNeeded,
      rcQuestionsNeeded
    };
  }, [profile, chronologicalFullTests, stats.projectedScore]);



  // Định dạng ngày hiển thị gọn gàng DD/MM/YYYY
  const formatDateDisplay = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Cấu hình trục Y Bán Linh Động Thông Minh (Smart Hybrid):
  // - Đỉnh luôn cố định ở 990đ (hoặc 495đ) để người học luôn thấy rõ vạch đích
  // - Đáy linh động lùi 50-100đ theo điểm thấp nhất, chia vạch chuẩn mốc TOEIC
  const chartYAxisConfig = useMemo(() => {
    if (chartData.length === 0) {
      return {
        totalDomain: [400, 990] as [number, number],
        totalTicks: [400, 600, 800, 900, 990],
        subDomain: [200, 495] as [number, number],
        subTicks: [200, 300, 400, 495]
      };
    }

    // 1. Cấu hình trục Total (Tổng Điểm 10-990)
    const minTotal = Math.min(...chartData.map(d => d.total));
    const rangeTotal = 990 - minTotal;
    
    let floorTotal: number;
    const totalTicks: number[] = [];

    if (rangeTotal <= 250) {
      // Dải điểm hẹp (người học ở band cao, ví dụ 750 - 950): Bước nhảy 50đ đều đặn
      floorTotal = Math.max(200, Math.floor((minTotal - 40) / 50) * 50);
      for (let s = floorTotal; s <= 950; s += 50) {
        totalTicks.push(s);
      }
      totalTicks.push(990);
    } else {
      // Dải điểm rộng: Bước nhảy 100đ tròn trịa theo các mốc chuẩn TOEIC (500, 600, 700, 800, 900, 990)
      floorTotal = Math.max(100, Math.floor((minTotal - 40) / 100) * 100);
      for (let s = floorTotal; s <= 900; s += 100) {
        totalTicks.push(s);
      }
      totalTicks.push(990);
    }

    // 2. Cấu hình trục Subscore (Listening & Reading 5-495)
    const minSub = Math.min(...chartData.map(d => Math.min(d.listening, d.reading)));
    const rangeSub = 495 - minSub;

    let floorSub: number;
    const subTicks: number[] = [];

    if (rangeSub <= 150) {
      // Dải điểm thành phần hẹp: Bước nhảy 25đ mượt mà
      floorSub = Math.max(50, Math.floor((minSub - 25) / 25) * 25);
      for (let s = floorSub; s <= 475; s += 25) {
        subTicks.push(s);
      }
      subTicks.push(495);
    } else {
      // Dải điểm thành phần rộng: Bước nhảy 50đ (200, 250, 300, 350, 400, 450, 495)
      floorSub = Math.max(50, Math.floor((minSub - 30) / 50) * 50);
      for (let s = floorSub; s <= 450; s += 50) {
        subTicks.push(s);
      }
      subTicks.push(495);
    }

    return {
      totalDomain: [floorTotal, 990] as [number, number],
      totalTicks,
      subDomain: [floorSub, 495] as [number, number],
      subTicks
    };
  }, [chartData]);

  return (
    <div className="space-y-5 animate-fade-in text-slate-800 dark:text-slate-200">
      
      {/* 1. Top 4 High-Value Bento KPI Cards (Compact & Tinh Tế theo chuẩn UI/UX Pro Max) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Điểm Trung Bình - Vibrant Blue Pastel Gradient */}
        <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-blue-100/90 via-blue-50/75 to-indigo-100/50 dark:from-blue-950/60 dark:via-slate-900/90 dark:to-blue-950/40 border border-blue-300/80 dark:border-blue-800/70 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-700 transition-all duration-200 group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/15 dark:bg-blue-500/20 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate mr-1">
                Điểm Trung Bình
              </span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 flex items-center justify-center shadow-2xs shrink-0">
                <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 tracking-tight tabular-nums leading-none">
                {stats.avg > 0 ? stats.avg : '--'}
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">/ 990đ</span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-blue-200/70 dark:border-blue-900/50 shadow-2xs flex items-center justify-between gap-1 text-[11px] backdrop-blur-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
              {retestStats.retestCount > 0 
                ? `Đề mới: ${retestStats.firstAttemptAvg}đ` 
                : `${stats.totalTests} đề Full Test`}
            </span>
            {retestStats.retestCount > 0 ? (
              <span 
                className="inline-flex items-center text-blue-700 dark:text-blue-300 font-black bg-blue-100/90 dark:bg-blue-950/80 border border-blue-200/80 dark:border-blue-800/80 px-1.5 py-0.5 rounded text-[10.5px] shadow-2xs shrink-0"
                title={`Đã làm lại ${retestStats.retestCount} lượt đề thi cũ. Trung bình tăng +${retestStats.avgRetestGain}đ so với lần đầu.`}
              >
                ▲ +{retestStats.avgRetestGain}đ
              </span>
            ) : (
              <span className="inline-flex items-center text-blue-700 dark:text-blue-300 font-black bg-blue-100 dark:bg-blue-950/80 px-1.5 py-0.5 rounded text-[10.5px] shadow-2xs shrink-0">
                ETS Scaled
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Mức Độ Bứt Phá - Vibrant Emerald Pastel Gradient */}
        <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-emerald-100/90 via-emerald-50/75 to-teal-100/50 dark:from-emerald-950/60 dark:via-slate-900/90 dark:to-emerald-950/40 border border-emerald-300/80 dark:border-emerald-800/70 shadow-xs hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-700 transition-all duration-200 group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/15 dark:bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate mr-1">
                Mức Độ Bứt Phá
              </span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center shadow-2xs shrink-0">
                <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <div className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums leading-none ${
                stats.breakthrough >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {stats.breakthrough > 0 ? `+${stats.breakthrough}` : stats.breakthrough}
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">điểm</span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-emerald-200/70 dark:border-emerald-900/50 flex items-center justify-between gap-1 text-[11px] backdrop-blur-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">So với mốc đầu</span>
            <div className="flex items-center gap-1 text-[11px] shrink-0 font-bold">
              <span className="text-slate-600 dark:text-slate-300">{stats.firstScore}đ</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-black">➔</span>
              <span className="bg-emerald-200/90 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs">
                {stats.latestScore}đ
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Kỷ Lục Điểm Số (Personal Best) - Vibrant Amber Pastel Gradient */}
        <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-amber-100/90 via-amber-50/75 to-orange-100/50 dark:from-amber-950/60 dark:via-slate-900/90 dark:to-amber-950/40 border border-amber-300/80 dark:border-amber-800/70 shadow-xs hover:shadow-md hover:border-amber-400 dark:hover:border-amber-700 transition-all duration-200 group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/15 dark:bg-amber-500/20 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate mr-1">
                Kỷ Lục Điểm Số (PB)
              </span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-center shadow-2xs shrink-0">
                <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 tracking-tight tabular-nums leading-none">
                {stats.highest > 0 ? stats.highest : '--'}
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">điểm</span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-amber-200/70 dark:border-amber-900/50 flex items-center justify-between gap-1 text-[11px] backdrop-blur-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Đỉnh LC / RC</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="bg-amber-200/90 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs">
                L: {stats.highestListening}
              </span>
              <span className="bg-amber-200/90 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs">
                R: {stats.highestReading}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Độ Ổn Định Phong Độ - Vibrant Purple Pastel Gradient */}
        <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-purple-100/90 via-purple-50/75 to-violet-100/50 dark:from-purple-950/60 dark:via-slate-900/90 dark:to-purple-950/40 border border-purple-300/80 dark:border-purple-800/70 shadow-xs hover:shadow-md hover:border-purple-400 dark:hover:border-purple-700 transition-all duration-200 group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/15 dark:bg-purple-500/20 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate mr-1">
                Độ Ổn Định Phong Độ
              </span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 flex items-center justify-center shadow-2xs shrink-0">
                <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 tracking-tight tabular-nums leading-none">
                {stats.totalTests > 1 ? `±${stats.stability}` : '--'}
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">điểm</span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-purple-200/70 dark:border-purple-900/50 flex items-center justify-between gap-1 text-[11px] backdrop-blur-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Đánh giá</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-black text-[10.5px] shadow-2xs shrink-0 ${
              stats.totalTests <= 1 
                ? 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                : stats.stability <= 25 
                ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60'
                : stats.stability <= 45
                ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-300/60 dark:border-blue-800/60'
                : 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300/60 dark:border-purple-800/60'
            }`}>
              {stats.totalTests <= 1 
                ? 'Cần thêm đề' 
                : stats.stability <= 25 
                ? 'Rất Ổn Định' 
                : stats.stability <= 45
                ? 'Phong Độ Tốt' 
                : 'Đang Bứt Tốc'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Growth Timeline Chart (Dual Y-Axis, Clean TOEIC Ticks, High Contrast) */}
      <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0E1526]/90 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs border border-blue-100/80 dark:border-blue-900/60">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
              Lộ Trình Tăng Trưởng Điểm Số
            </h2>
          </div>

          {/* Chart Controls: Clean Dropdown Filter + Segmented View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* 1. Attempt Scope Filter Dropdown */}
            <div className="relative inline-flex items-center">
              <div className="flex items-center space-x-1.5 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 text-xs shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={chartAttemptFilter}
                  onChange={(e) => setChartAttemptFilter(e.target.value as ChartAttemptFilter)}
                  aria-label="Lọc lượt thi"
                  className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 text-xs outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Tất cả lượt thi
                  </option>
                  <option value="FIRST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Chỉ lần đầu (Đề mới)
                  </option>
                  <option value="BEST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Điểm cao nhất mỗi đề
                  </option>
                </select>
              </div>
            </div>

            {/* 2. Series View Mode Toggle: Tổng Điểm | Listening & Reading */}
            <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
              <button
                onClick={() => setChartViewMode('TOTAL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  chartViewMode === 'TOTAL'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                <span>Tổng Điểm</span>
              </button>
              <button
                onClick={() => setChartViewMode('LR')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  chartViewMode === 'LR'
                    ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Listening & Reading</span>
              </button>
            </div>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="h-72 sm:h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={chartData} 
                margin={{ 
                  top: 16, 
                  right: 16, 
                  left: -8, 
                  bottom: 0 
                }}
              >
                <defs>
                  {/* Royal Blue Gradient for Total */}
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                  {/* Violet Gradient for Listening */}
                  <linearGradient id="colorListening" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                  </linearGradient>
                  {/* Emerald Gradient for Reading */}
                  <linearGradient id="colorReading" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke={theme === 'dark' ? '#1E293B' : '#E2E8F0'} 
                  vertical={false} 
                  horizontalValues={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalTicks : chartYAxisConfig.subTicks}
                />
                
                <XAxis 
                  dataKey="date" 
                  stroke={theme === 'dark' ? '#64748B' : '#94A3B8'} 
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: theme === 'dark' ? '#334155' : '#CBD5E1' }}
                  tickFormatter={(val, idx) => `${val} (${chartData[idx]?.testIndex || ''}${chartData[idx]?.isRetest ? ' • L' + chartData[idx]?.attemptNumber : ''})`}
                />
                
                {/* Trục Y duy nhất bên trái: Rõ ràng, không bao giờ bị đè hoặc lẫn lộn */}
                <YAxis 
                  orientation="left"
                  domain={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalDomain : chartYAxisConfig.subDomain} 
                  ticks={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalTicks : chartYAxisConfig.subTicks}
                  stroke={theme === 'dark' ? '#64748B' : '#94A3B8'} 
                  fontSize={10.5}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tick={{ fill: theme === 'dark' ? '#94A3B8' : '#64748B', fontWeight: 600 }}
                />

                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const dataItem = payload[0].payload;
                      const diff = sessionDiffMap[dataItem.id];
                      return (
                        <div className="bg-white/95 dark:bg-slate-900/95 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[210px]">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5 font-bold gap-2">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="text-slate-900 dark:text-white truncate max-w-[120px]">{dataItem.name}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-black shrink-0 ${
                                dataItem.isRetest
                                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300/60 dark:border-purple-800/60'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                Lần {dataItem.attemptNumber}
                              </span>
                            </div>
                            <span className="text-slate-400 font-normal shrink-0">{dataItem.rawDate}</span>
                          </div>
                          
                          <div className="space-y-1 pt-0.5">
                            <div className="flex justify-between items-center text-blue-600 dark:text-blue-400 font-black text-sm">
                              <span>Tổng điểm ETS:</span>
                              <span className="flex items-center">
                                {dataItem.total}đ
                                {diff !== null && diff !== undefined && (
                                  <span className={`ml-1 text-[10px] font-bold px-1 rounded ${
                                    diff >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' : 'text-rose-600 bg-rose-50 dark:bg-rose-950/50'
                                  }`}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                )}
                              </span>
                            </div>

                            {dataItem.isRetest && dataItem.scoreDiffFromFirst !== null && dataItem.scoreDiffFromFirst !== undefined && (
                              <div className="py-1 px-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/50 text-[10.5px] text-purple-900 dark:text-purple-200 flex items-center justify-between">
                                <span>Tiến bộ so với Lần 1:</span>
                                <span className="font-extrabold text-purple-700 dark:text-purple-300">
                                  {dataItem.scoreDiffFromFirst >= 0 ? `+${dataItem.scoreDiffFromFirst}` : dataItem.scoreDiffFromFirst}đ
                                </span>
                              </div>
                            )}

                            <div className="flex justify-between items-center text-purple-600 dark:text-purple-400 font-semibold">
                              <span>Listening (LC):</span>
                              <span className="font-bold">{dataItem.listening}đ</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                              <span>Reading (RC):</span>
                              <span className="font-bold">{dataItem.reading}đ</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Reference Target Lines: Đặt nhãn góc trái tránh va chạm số và đường cong */}
                {chartViewMode === 'TOTAL' && (
                  <>
                    {chartYAxisConfig.totalDomain[0] <= 900 && (
                      <ReferenceLine 
                        y={900} 
                        stroke="#8B5CF6" 
                        strokeDasharray="3 3" 
                        strokeOpacity={0.6} 
                        label={{ value: 'Mốc 900+ Master', fill: '#8B5CF6', fontSize: 10, position: 'insideTopLeft' }} 
                      />
                    )}
                    {chartYAxisConfig.totalDomain[0] <= 800 && (
                      <ReferenceLine 
                        y={800} 
                        stroke="#3B82F6" 
                        strokeDasharray="3 3" 
                        strokeOpacity={0.4} 
                        label={{ value: 'Mốc 800+ Vàng', fill: '#3B82F6', fontSize: 10, position: 'insideBottomLeft' }} 
                      />
                    )}
                  </>
                )}

                {/* Đường biểu đồ theo chế độ: Đường thẳng chuẩn xác (linear) thể hiện rõ độ dốc tăng/giảm */}
                {chartViewMode === 'TOTAL' ? (
                  <Area 
                    type="linear" 
                    dataKey="total" 
                    name="Tổng Điểm" 
                    stroke="#2563EB" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                      const isRetest = payload?.isRetest;
                      return (
                        <circle
                          key={`dot-${payload?.id || cx}`}
                          cx={cx}
                          cy={cy}
                          r={isRetest ? 5.5 : 4}
                          fill={isRetest ? '#8B5CF6' : '#2563EB'}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6.5, fill: '#1D4ED8', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                ) : (
                  <>
                    <Area 
                      type="linear" 
                      dataKey="listening" 
                      name="Listening" 
                      stroke="#8B5CF6" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorListening)" 
                      dot={{ r: 3.5, fill: '#8B5CF6', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                      activeDot={{ r: 5.5, fill: '#7C3AED', stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                    <Area 
                      type="linear" 
                      dataKey="reading" 
                      name="Reading" 
                      stroke="#10B981" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorReading)" 
                      dot={{ r: 3.5, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                      activeDot={{ r: 5.5, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
            <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
            <span>Chưa có dữ liệu bài thi Full Test nào để vẽ đồ thị.</span>
          </div>
        )}

        {/* Legend strip Tinh Gọn */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {chartViewMode === 'TOTAL' ? (
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-600 shadow-2xs" />
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Tổng điểm ETS (10–990)
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-purple-500 shadow-2xs" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Listening (5–495)
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-2xs" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Reading (5–495)
                  </span>
                </div>
              </>
            )}
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {chartViewMode === 'TOTAL' 
              ? '💡 Rê chuột vào từng bài thi để xem chi tiết LC & RC'
              : '💡 So sánh tương quan 2 kỹ năng trên cùng thang chuẩn 495đ'}
          </span>
        </div>
      </div>

      {/* 3. Ma Trận Năng Lực 7 Part: Thẻ Hợp Nhất Chống Chói & Liền Mạch (Unified Master Card) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white/95 dark:bg-[#0E1526]/95 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        {/* Header Tổng Thể Trong Cùng 1 Khung Tinh Gọn */}
        <div className="flex items-center justify-between gap-3.5 pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Ma Trận Năng Lực 7 Part
              </h2>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                Chuẩn ETS
              </span>
            </div>
          </div>

          {partStats && (
            <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 px-3 py-1.5 rounded-xl border border-blue-200/80 dark:border-blue-800 shadow-2xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              <span>{partStats.validTestsCount} bài thi chuẩn ETS</span>
            </div>
          )}
        </div>

        {partStats ? (
          /* 2 Cột Song Song Có Ranh Giới Phân Định Rõ Ràng & Sắc Thái Màu Riêng Biệt */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
            
            {/* CỘT TRÁI: KỸ NĂNG NGHE (LISTENING) - BLUE SURFACE */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-100/60 via-blue-50/40 to-sky-100/30 dark:from-blue-950/40 dark:via-slate-900/60 dark:to-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 flex flex-col space-y-4 shadow-2xs">
              {/* Header Kỹ Năng Nghe */}
              <div className="flex items-center justify-between gap-3 pb-1 min-h-[48px]">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/90 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs border border-blue-200/80 dark:border-blue-800/60">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      Kỹ Năng Nghe (Listening)
                    </h3>
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/90 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shadow-2xs">
                        {targetGap.lcGap > 0 ? `Cần bù +${targetGap.lcGap}đ (~${targetGap.lcQuestionsNeeded} câu)` : '✓ Cận cực đại'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-blue-700 dark:text-blue-300 tracking-tight">
                    {targetGap.currentLC}
                  </span>
                  <span className="text-xs sm:text-sm font-bold font-mono text-slate-500 dark:text-slate-400 ml-1">
                    / {targetGap.targetLC}đ
                  </span>
                </div>
              </div>

              {/* Danh Sách 4 Part Listening Dạng Capsule Nổi Bật */}
              <div className="space-y-2.5">
                {[
                  { key: 'part1', code: 'P1', name: 'Part 1: Mô tả tranh', max: 6 },
                  { key: 'part2', code: 'P2', name: 'Part 2: Hỏi & Đáp', max: 25 },
                  { key: 'part3', code: 'P3', name: 'Part 3: Hội thoại', max: 39 },
                  { key: 'part4', code: 'P4', name: 'Part 4: Bài nói ngắn', max: 30 },
                ].map(p => {
                  const key = p.key as keyof LRPartScore;
                  const acc = partStats.accuracy[key] || 0;
                  const avg = Math.round(partStats.averages[key] || 0);

                  return (
                    <div 
                      key={key} 
                      className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-blue-200/70 dark:border-blue-900/40 shadow-2xs hover:shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                    >
                      {/* Tên Part & Số câu đúng */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-xs font-black text-blue-700 dark:text-blue-300 flex items-center justify-center border border-blue-200 dark:border-blue-800/80 shrink-0">
                          {p.code}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                            {p.name}
                          </h4>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-mono">
                            {avg} / {p.max} câu đúng
                          </span>
                        </div>
                      </div>

                      {/* Thanh Cầu Nối Tiến Độ Trực Quan & Điểm % */}
                      <div className="flex items-center space-x-3 shrink-0">
                        <div className="w-20 sm:w-28 md:w-36 h-2 bg-blue-100/90 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all duration-500"
                            style={{ width: `${acc}%` }}
                          />
                        </div>
                        <span className="text-base sm:text-lg font-black font-mono text-blue-900 dark:text-blue-100 w-12 text-right">
                          {acc}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CỘT PHẢI: KỸ NĂNG ĐỌC (READING) - PURPLE SURFACE */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-100/60 via-purple-50/40 to-indigo-100/30 dark:from-purple-950/40 dark:via-slate-900/60 dark:to-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 flex flex-col space-y-4 shadow-2xs">
              {/* Header Kỹ Năng Đọc */}
              <div className="flex items-center justify-between gap-3 pb-1 min-h-[48px]">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/90 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-2xs border border-purple-200/80 dark:border-purple-800/60">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      Kỹ Năng Đọc (Reading)
                    </h3>
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/90 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800 shadow-2xs">
                        {targetGap.rcGap > 0 ? `Cần bù +${targetGap.rcGap}đ (~${targetGap.rcQuestionsNeeded} câu)` : '✓ Đạt chuẩn'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-purple-700 dark:text-purple-300 tracking-tight">
                    {targetGap.currentRC}
                  </span>
                  <span className="text-xs sm:text-sm font-bold font-mono text-slate-500 dark:text-slate-400 ml-1">
                    / {targetGap.targetRC}đ
                  </span>
                </div>
              </div>

              {/* Danh Sách 3 Part Reading + 1 Khung Khuyến Nghị */}
              <div className="space-y-2.5">
                {[
                  { key: 'part5', code: 'P5', name: 'Part 5: Điền câu', max: 30 },
                  { key: 'part6', code: 'P6', name: 'Part 6: Điền đoạn văn', max: 16 },
                  { key: 'part7', code: 'P7', name: 'Part 7: Đọc hiểu văn bản', max: 54 },
                ].map(p => {
                  const key = p.key as keyof LRPartScore;
                  const acc = partStats.accuracy[key] || 0;
                  const avg = Math.round(partStats.averages[key] || 0);
                  const isWeakest = weakestPart?.key === key;

                  return (
                    <div 
                      key={key} 
                      className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl transition-all shadow-2xs ${
                        isWeakest 
                          ? 'bg-amber-50/95 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 hover:border-amber-400' 
                          : 'bg-white/95 dark:bg-slate-900/85 border border-purple-200/70 dark:border-purple-900/40 hover:shadow-xs hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                    >
                      {/* Tên Part & Số câu đúng */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center border shrink-0 ${
                          isWeakest
                            ? 'bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                            : 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70'
                        }`}>
                          {p.code}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                              {p.name}
                            </h4>
                            {isWeakest && (
                              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 border border-amber-300 shrink-0">
                                Điểm nghẽn
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-mono">
                            {avg} / {p.max} câu đúng
                          </span>
                        </div>
                      </div>

                      {/* Thanh Cầu Nối Tiến Độ Trực Quan & Điểm % */}
                      <div className="flex items-center space-x-3 shrink-0">
                        <div className="w-20 sm:w-28 md:w-36 h-2 bg-purple-100/90 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              isWeakest 
                                ? 'bg-gradient-to-r from-amber-500 to-amber-400' 
                                : 'bg-gradient-to-r from-purple-600 to-indigo-400'
                            }`}
                            style={{ width: `${acc}%` }}
                          />
                        </div>
                        <span className={`text-base sm:text-lg font-black font-mono w-12 text-right ${
                          isWeakest ? 'text-amber-700 dark:text-amber-300' : 'text-purple-900 dark:text-purple-100'
                        }`}>
                          {acc}%
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Khung Khuyến Nghị Chiến Lược */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50/95 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800/70 flex items-center justify-between gap-2.5 shadow-2xs">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 dark:bg-amber-400/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                    </div>
                    <span className="text-xs text-slate-800 dark:text-slate-200 truncate">
                      Tập trung vá <strong className="font-bold text-amber-900 dark:text-amber-200">{weakestPart ? weakestPart.name.split(':')[0] : 'Part 6'}</strong> (~2 câu) để tăng ngay +25đ mốc mục tiêu.
                    </span>
                  </div>
                  <span className="text-[10px] font-black text-amber-800 dark:text-amber-200 bg-amber-200/80 dark:bg-amber-900/80 px-2.5 py-1 rounded-lg shrink-0 border border-amber-300 dark:border-amber-700">
                    Mục tiêu +25đ
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs">
            Chưa có dữ liệu bài thi chi tiết Part 1 - Part 7.
          </div>
        )}
      </div>

      {/* 4. Tinh Gọn: Bảng Lịch Sử Luyện Đề (Đã lược bỏ thông tin thừa, phẳng phiu & sắc nét) */}
      <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0E1526]/90 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        
        {/* Table Top Controls: Search & Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Nhật Ký & Lịch Sử Luyện Đề
            </h2>
            {sortField && (
              <button
                onClick={() => setSortField(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition cursor-pointer shadow-2xs group"
                title="Nhấp để HỦY sắp xếp và trở về mặc định (theo ngày)"
              >
                <span>
                  Đang xếp: {sortField === 'totalScore' ? 'Tổng Điểm' : sortField === 'scaledListening' ? 'Listening' : sortField === 'scaledReading' ? 'Reading' : sortField === 'testName' ? 'Tên đề' : 'Ngày thi'} ({sortOrder === 'desc' ? 'Giảm dần' : 'Tăng dần'})
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-200/80 dark:bg-blue-900/80 text-blue-800 dark:text-blue-200 group-hover:bg-rose-200 group-hover:text-rose-800 text-[10.5px] font-black flex items-center gap-0.5">
                  <X className="w-2.5 h-2.5" /> Hủy xếp
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm tên đề thi..."
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-52"
              />
            </div>

            {/* Filter by Attempt: Sleek Dropdown */}
            <div className="relative inline-flex items-center">
              <div className="flex items-center space-x-1.5 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 text-xs shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={tableAttemptFilter}
                  onChange={(e) => setTableAttemptFilter(e.target.value as any)}
                  aria-label="Lọc lượt thi"
                  className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 text-xs outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Mọi lượt thi
                  </option>
                  <option value="FIRST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Chỉ đề mới (L1)
                  </option>
                  <option value="RETEST_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                    Chỉ làm lại (L2+)
                  </option>
                </select>
              </div>
            </div>

            {/* Filter Pills: Tất Cả | Full Test | Luyện Part */}
            <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterType === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tất Cả
              </button>
              <button
                onClick={() => setFilterType('FULL_TEST')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterType === 'FULL_TEST'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Full Test
              </button>
              <button
                onClick={() => setFilterType('PART_PRACTICE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterType === 'PART_PRACTICE'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Luyện Part
              </button>
            </div>
          </div>
        </div>

        {/* The Clean Streamlined Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200/80 dark:border-slate-800">
                {/* Ngày Thi (Sortable) */}
                <th 
                  onClick={() => handleSort('date')}
                  className={`py-3 px-3.5 whitespace-nowrap cursor-pointer select-none group/th transition-colors ${
                    sortField === 'date' 
                      ? 'text-blue-600 dark:text-blue-400 font-black' 
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  title={sortField === 'date' ? `Đang xếp Ngày thi (${sortOrder === 'desc' ? 'Mới nhất' : 'Cũ nhất'}). Nhấp lần nữa để đổi chiều, hoặc nhấp lần 3 để HỦY.` : 'Nhấp để sắp xếp theo Ngày thi'}
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>Ngày Thi</span>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
                      sortField === 'date'
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 group-hover/th:bg-blue-100 group-hover/th:text-blue-700 dark:group-hover/th:bg-blue-950 dark:group-hover/th:text-blue-300'
                    }`}>
                      {sortField === 'date' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Tên Đề Thi (Sortable) */}
                <th 
                  onClick={() => handleSort('testName')}
                  className={`py-3 px-3.5 cursor-pointer select-none group/th transition-colors ${
                    sortField === 'testName' 
                      ? 'text-blue-600 dark:text-blue-400 font-black' 
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  title={sortField === 'testName' ? `Đang xếp Tên đề (${sortOrder === 'asc' ? 'A → Z' : 'Z → A'}). Nhấp lần nữa để đổi chiều, hoặc nhấp lần 3 để HỦY.` : 'Nhấp để sắp xếp theo Tên đề thi'}
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>Tên Đề Thi</span>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
                      sortField === 'testName'
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 group-hover/th:bg-blue-100 group-hover/th:text-blue-700 dark:group-hover/th:bg-blue-950 dark:group-hover/th:text-blue-300'
                    }`}>
                      {sortField === 'testName' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Hình Thức */}
                <th className="py-3 px-3 whitespace-nowrap">Hình Thức</th>

                {/* Listening (Sortable) */}
                <th 
                  onClick={() => handleSort('scaledListening')}
                  className={`py-3 px-3 text-center whitespace-nowrap cursor-pointer select-none group/th transition-colors ${
                    sortField === 'scaledListening' 
                      ? 'text-blue-600 dark:text-blue-400 font-black' 
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  title={sortField === 'scaledListening' ? `Đang xếp Listening (${sortOrder === 'desc' ? 'Cao → Thấp' : 'Thấp → Cao'}). Nhấp lần nữa để đổi chiều, hoặc nhấp lần 3 để HỦY.` : 'Nhấp để sắp xếp theo Điểm Listening'}
                >
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <span>Listening</span>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
                      sortField === 'scaledListening'
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 group-hover/th:bg-blue-100 group-hover/th:text-blue-700 dark:group-hover/th:bg-blue-950 dark:group-hover/th:text-blue-300'
                    }`}>
                      {sortField === 'scaledListening' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Reading (Sortable) */}
                <th 
                  onClick={() => handleSort('scaledReading')}
                  className={`py-3 px-3 text-center whitespace-nowrap cursor-pointer select-none group/th transition-colors ${
                    sortField === 'scaledReading' 
                      ? 'text-blue-600 dark:text-blue-400 font-black' 
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  title={sortField === 'scaledReading' ? `Đang xếp Reading (${sortOrder === 'desc' ? 'Cao → Thấp' : 'Thấp → Cao'}). Nhấp lần nữa để đổi chiều, hoặc nhấp lần 3 để HỦY.` : 'Nhấp để sắp xếp theo Điểm Reading'}
                >
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <span>Reading</span>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
                      sortField === 'scaledReading'
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 group-hover/th:bg-blue-100 group-hover/th:text-blue-700 dark:group-hover/th:bg-blue-950 dark:group-hover/th:text-blue-300'
                    }`}>
                      {sortField === 'scaledReading' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Tổng Điểm (Sortable) */}
                <th 
                  onClick={() => handleSort('totalScore')}
                  className={`py-3 px-3 text-center whitespace-nowrap cursor-pointer select-none group/th transition-colors ${
                    sortField === 'totalScore' 
                      ? 'text-blue-600 dark:text-blue-400 font-black' 
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  title={sortField === 'totalScore' ? `Đang xếp Tổng Điểm (${sortOrder === 'desc' ? 'Cao → Thấp' : 'Thấp → Cao'}). Nhấp lần nữa để đổi chiều, hoặc nhấp lần 3 để HỦY.` : 'Nhấp để sắp xếp theo Tổng Điểm'}
                >
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <span>Tổng Điểm</span>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
                      sortField === 'totalScore'
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 group-hover/th:bg-blue-100 group-hover/th:text-blue-700 dark:group-hover/th:bg-blue-950 dark:group-hover/th:text-blue-300'
                    }`}>
                      {sortField === 'totalScore' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>
                </th>

                {/* Xu Hướng */}
                <th className="py-3 px-3 text-center whitespace-nowrap">Xu Hướng</th>

                {/* Thao Tác */}
                <th className="py-3 px-3 text-right whitespace-nowrap">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedSessions.map((session) => {
                const diff = sessionDiffMap[session.id];
                const isFull = session.sessionType === 'FULL_TEST';
                const attemptMeta = attemptMap[session.id];

                return (
                  <tr 
                    key={session.id}
                    onClick={() => setSelectedSessionDetail(session)}
                    className="hover:bg-blue-50/50 dark:hover:bg-blue-950/25 transition-colors cursor-pointer group/row"
                  >
                    {/* Ngày thi chuẩn Việt Nam DD/MM/YYYY */}
                    <td className="py-3 px-3.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateDisplay(session.date)}
                    </td>

                    {/* Tên đề thi kèm thời gian làm bài rõ nét, icon ghi chú tinh tế nếu có */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center space-x-1.5 min-w-0 max-w-[240px] sm:max-w-sm flex-wrap gap-y-1">
                        <span 
                          className="font-bold text-slate-900 dark:text-white truncate group-hover/row:text-blue-600 dark:group-hover/row:text-blue-400 transition-colors"
                          title={session.notes ? `${session.testName}\n\nGhi chú: ${session.notes}` : session.testName}
                        >
                          {session.testName}
                        </span>

                        {isFull && attemptMeta && attemptMeta.isRetest && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300/60 dark:border-purple-800/60">
                            Lần {attemptMeta.attemptNumber}
                            {attemptMeta.scoreDiffFromFirst !== null && (
                              <span className="ml-1 text-[9px] font-extrabold text-purple-600 dark:text-purple-300">
                                {attemptMeta.scoreDiffFromFirst >= 0 ? `+${attemptMeta.scoreDiffFromFirst}` : attemptMeta.scoreDiffFromFirst}đ
                              </span>
                            )}
                          </span>
                        )}

                        {session.notes && (
                          <span 
                            className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 shrink-0 transition-transform hover:scale-110 cursor-help"
                            title={`Ghi chú: ${session.notes}`}
                          >
                            <FileText className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      {session.durationMinutes && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                          <Clock className="w-3 h-3 text-blue-500/80 dark:text-blue-400/80 shrink-0" />
                          <span>{session.durationMinutes} phút</span>
                        </div>
                      )}
                    </td>

                    {/* Hình thức gọn gàng */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        isFull 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60'
                      }`}>
                        {isFull ? 'Full Test' : 'Luyện Part'}
                      </span>
                    </td>

                    {/* Listening - Chuẩn màu Blue đồng bộ toàn hệ thống */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {session.scaledListening ? (
                        <span className="font-bold text-blue-600 dark:text-blue-400 text-xs font-mono tabular-nums">
                          {session.scaledListening}đ
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">--</span>
                      )}
                    </td>

                    {/* Reading - Chuẩn màu Purple đồng bộ toàn hệ thống */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {session.scaledReading ? (
                        <span className="font-bold text-purple-600 dark:text-purple-400 text-xs font-mono tabular-nums">
                          {session.scaledReading}đ
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">--</span>
                      )}
                    </td>

                    {/* Tổng Điểm */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {session.totalScore ? (
                        <span className="font-black text-slate-900 dark:text-white text-sm font-mono tabular-nums">
                          {session.totalScore}đ
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">--</span>
                      )}
                    </td>

                    {/* Xu Hướng (+/-) */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isFull ? (
                        diff !== null && diff !== undefined ? (
                          diff > 0 ? (
                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full font-bold text-[11px] font-mono tabular-nums">
                              <TrendingUp className="w-3 h-3 mr-1" />+{diff}đ
                            </span>
                          ) : diff < 0 ? (
                            <span className="inline-flex items-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full font-bold text-[11px] font-mono tabular-nums">
                              <TrendingDown className="w-3 h-3 mr-1" />{diff}đ
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-semibold text-[11px] font-mono tabular-nums">
                              0đ
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">Mốc đầu</span>
                        )
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Thao tác (Xem chi tiết + Xóa) - Nút bấm tactile hiện đại */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSessionDetail(session);
                          }}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-blue-200/50 dark:hover:border-blue-800/50 transition-all cursor-pointer shadow-2xs"
                          title="Xem chi tiết điểm Part 1 - 7 & ghi chú"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Xóa bản ghi bài thi "${session.testName}"?`)) {
                              onDeleteSession(session.id);
                            }
                          }}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-transparent hover:border-rose-200/50 dark:hover:border-rose-800/50 transition-all cursor-pointer shadow-2xs"
                          title="Xóa bài thi này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedSessionsForTable.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    Không tìm thấy bài thi hoặc buổi luyện tập nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Hiển thị {(currentPage - 1) * itemsPerPage + 1} – {Math.min(currentPage * itemsPerPage, sortedSessionsForTable.length)} trên tổng {sortedSessionsForTable.length} bài thi
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition cursor-pointer"
              >
                Trước
              </button>
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-800">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition cursor-pointer"
              >
                Sau
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 5. Modal Xem Chi Tiết Bài Thi (Part 1 - 7, Thời Lượng, Ghi Chú & Sổ Tay Bẫy) */}
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
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      selectedSessionDetail.sessionType === 'FULL_TEST'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                    }`}>
                      {selectedSessionDetail.sessionType === 'FULL_TEST' ? 'Full Test 200 câu' : 'Luyện Part'}
                    </span>
                    {selectedSessionDetail.sessionType === 'FULL_TEST' && attemptMap[selectedSessionDetail.id] && (
                      <>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                          attemptMap[selectedSessionDetail.id].isRetest
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300/60 dark:border-purple-800/60'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          Lần {attemptMap[selectedSessionDetail.id].attemptNumber}
                        </span>
                      </>
                    )}
                    {selectedSessionDetail.durationMinutes && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
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
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Tổng Điểm
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
                  {selectedSessionDetail.totalScore ? `${selectedSessionDetail.totalScore}đ` : '--'}
                </div>
                {sessionDiffMap[selectedSessionDetail.id] !== undefined && sessionDiffMap[selectedSessionDetail.id] !== null && (
                  <div className="mt-1">
                    {sessionDiffMap[selectedSessionDetail.id]! > 0 ? (
                      <span className="inline-flex items-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-full">
                        <TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{sessionDiffMap[selectedSessionDetail.id]}đ
                      </span>
                    ) : sessionDiffMap[selectedSessionDetail.id]! < 0 ? (
                      <span className="inline-flex items-center text-[10px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="w-2.5 h-2.5 mr-0.5" />{sessionDiffMap[selectedSessionDetail.id]}đ
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">0đ so với trước</span>
                    )}
                  </div>
                )}
              </div>

              {/* Listening */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-center shadow-2xs">
                <span className="text-[10.5px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                  Listening
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-0.5">
                  {selectedSessionDetail.scaledListening ? `${selectedSessionDetail.scaledListening}đ` : '--'}
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
                  {selectedSessionDetail.rawListening !== undefined 
                    ? `${selectedSessionDetail.rawListening}/100 câu` 
                    : selectedSessionDetail.partScores 
                    ? `${(selectedSessionDetail.partScores.part1 || 0) + (selectedSessionDetail.partScores.part2 || 0) + (selectedSessionDetail.partScores.part3 || 0) + (selectedSessionDetail.partScores.part4 || 0)}/100 câu` 
                    : '--'}
                </span>
              </div>

              {/* Reading */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-center shadow-2xs">
                <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Reading
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {selectedSessionDetail.scaledReading ? `${selectedSessionDetail.scaledReading}đ` : '--'}
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
                  {selectedSessionDetail.rawReading !== undefined 
                    ? `${selectedSessionDetail.rawReading}/100 câu` 
                    : selectedSessionDetail.partScores 
                    ? `${(selectedSessionDetail.partScores.part5 || 0) + (selectedSessionDetail.partScores.part6 || 0) + (selectedSessionDetail.partScores.part7 || 0)}/100 câu` 
                    : '--'}
                </span>
              </div>
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
                  <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="text-xs font-bold text-purple-950 dark:text-purple-200 uppercase tracking-wider">
                          So Sánh Đối Đầu Với Lần 1 ({formatDateDisplay(first.date)})
                        </h4>
                      </div>
                      <span className="text-[10.5px] font-black text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full border border-purple-300/60 dark:border-purple-800/60">
                        Lần {meta.attemptNumber} (Làm lại)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {/* Tổng Điểm */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-purple-100 dark:border-purple-900/50 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">Tổng Điểm</span>
                        <div className="font-mono font-black text-sm text-slate-900 dark:text-white mt-0.5">
                          {first.totalScore}đ ➔ {selectedSessionDetail.totalScore}đ
                        </div>
                        <span className={`text-[11px] font-black block mt-0.5 ${
                          diffTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {diffTotal >= 0 ? `+${diffTotal}` : diffTotal} điểm
                        </span>
                      </div>

                      {/* Listening */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-purple-100 dark:border-purple-900/50 shadow-2xs">
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 block font-semibold">Listening</span>
                        <div className="font-mono font-black text-sm text-purple-600 dark:text-purple-400 mt-0.5">
                          {first.scaledListening}đ ➔ {selectedSessionDetail.scaledListening}đ
                        </div>
                        <span className="text-[11px] font-black text-purple-600 dark:text-purple-400 block mt-0.5">
                          {diffLC >= 0 ? `+${diffLC}` : diffLC}đ
                        </span>
                      </div>

                      {/* Reading */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-purple-100 dark:border-purple-900/50 shadow-2xs">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">Reading</span>
                        <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {first.scaledReading}đ ➔ {selectedSessionDetail.scaledReading}đ
                        </div>
                        <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">
                          {diffRC >= 0 ? `+${diffRC}` : diffRC}đ
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
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800 text-xs font-bold text-purple-700 dark:text-purple-300">
                        <span className="flex items-center gap-1.5">
                          <Headphones className="w-3.5 h-3.5" />
                          Listening (Part 1 - 4)
                        </span>
                        <span className="font-mono text-[11px]">
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
                              <span className="w-6 h-6 rounded bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 text-[10.5px] font-black flex items-center justify-center shrink-0">
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
                                  className="h-full bg-purple-500 rounded-full" 
                                  style={{ width: `${acc}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10.5px] text-slate-400 w-8 text-right font-semibold">
                                {acc}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reading Parts (5-7) */}
                    <div className="space-y-2 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          Reading (Part 5 - 7)
                        </span>
                        <span className="font-mono text-[11px]">
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
                              <span className="w-6 h-6 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-black flex items-center justify-center shrink-0">
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
                                  className="h-full bg-emerald-500 rounded-full" 
                                  style={{ width: `${acc}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10.5px] text-slate-400 w-8 text-right font-semibold">
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
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                                Part {m.part}
                              </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {m.questionContext}
                              </span>
                            </div>
                            {catInfo && (
                              <span 
                                className="px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0"
                                style={{ backgroundColor: catInfo.bg, color: catInfo.color }}
                              >
                                {catInfo.label}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
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
              <span className="text-slate-400 text-[11px]">
                Nhấn phím <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-[10px] text-slate-700 dark:text-slate-300">Esc</kbd> hoặc nhấp ra ngoài để đóng
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
