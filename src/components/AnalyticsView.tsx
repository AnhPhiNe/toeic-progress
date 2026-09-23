import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  Trash2,
  Pencil,
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
  Filter,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  BarChart,
  Bar
} from 'recharts';
import { StudySession, MistakeEntry, LRPartScore, UserProfile, ErrorCategory, ERROR_CATEGORY_LABELS, ChartAttemptFilter } from '../types';
import { PART_MAX_QUESTIONS, getPracticeParts } from '../utils/etsScoring';
import { loadUserProfile, computeSessionAttemptMap, getRetestStats, loadPacingRuns, getTodayDateString } from '../utils/storage';
import { causePriority, heatmapDays, phaseOverruns, rollingPartStats } from '../utils/learningAnalytics';
import type { VocabLog } from '../utils/dataBundle';
import { CARD, SKILL_COLORS } from './surfaces';

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
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  onDeleteSession: (sessionId: string) => void;
  /** Mở form Nhập Điểm ở chế độ sửa cho bản ghi này */
  onEditSession: (session: StudySession) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  profile,
  sessions,
  mistakes,
  vocabLog,
  theme,
  onDeleteSession,
  onEditSession
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
  const rolling = useMemo(() => rollingPartStats(sessions), [sessions]);
  const priority = useMemo(() => causePriority(sessions, mistakes), [sessions, mistakes]);
  const heatmap = useMemo(() => heatmapDays(sessions, vocabLog, getTodayDateString()), [sessions, vocabLog]);
  const vocabTotal12Weeks = vocabLog.filter(item => !item.deletedAt && item.date >= heatmap[0].date && item.date <= heatmap[83].date).reduce((sum, item) => sum + item.count, 0);
  const pacing = useMemo(() => phaseOverruns(loadPacingRuns()), []);

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
  // Kết quả luyện Part của buổi đang mở chi tiết (có cứu cả dữ liệu chuỗi cũ)
  const detailPracticeParts = useMemo(
    () => selectedSessionDetail ? getPracticeParts(selectedSessionDetail) : [],
    [selectedSessionDetail]
  );

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
      stability: rolling.stability || 0
    };
  }, [sessions, fullTests, chronologicalFullTests, rolling.stability]);

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
  const partStats = useMemo(() => rolling.tests.length
    ? { averages: rolling.averages, accuracy: rolling.accuracy, validTestsCount: rolling.tests.length }
    : null, [rolling]);

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


  // Mục tiêu điểm của người học - dùng chung cho KPI, trục biểu đồ và đường mốc
  const goalScore = useMemo(
    () => Math.max(10, Math.min(990, (profile || loadUserProfile()).targetScore || 990)),
    [profile]
  );

  /**
   * Chẩn đoán theo NGUYÊN NHÂN sai, không theo Part (SPEC mục 1.4 điểm 1).
   * Các web luyện đề chỉ nói được "Part 3: 35/39". Chỉ sản phẩm này biết
   * VÌ SAO mất điểm, vì chính người học đã phân loại từng lỗi trong Sổ tay.
   */
  const errorDiagnosis = useMemo(() => {
    if (mistakes.length === 0) return null;

    const grouped = new Map<ErrorCategory, { count: number; parts: Set<number> }>();
    for (const m of mistakes) {
      const category = m.category || 'OTHER';
      let entry = grouped.get(category);
      if (!entry) {
        entry = { count: 0, parts: new Set<number>() };
        grouped.set(category, entry);
      }
      entry.count += 1;
      entry.parts.add(m.part);
    }

    const total = mistakes.length;
    const rows = Array.from(grouped.entries())
      .map(([category, value]) => ({
        category,
        label: (ERROR_CATEGORY_LABELS[category] || ERROR_CATEGORY_LABELS.OTHER).label,
        count: value.count,
        percent: Math.round((value.count / total) * 100),
        parts: Array.from(value.parts).sort((a, b) => a - b)
      }))
      // Nhiều lỗi nhất lên đầu; đồng hạng thì xếp theo tên cho ổn định giữa các lần render
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));

    const pendingCount = mistakes.filter(m => m.status === 'NEEDS_REVIEW').length;

    return {
      total,
      rows,
      top: rows[0],
      maxCount: rows[0].count,
      pendingCount
    };
  }, [mistakes]);

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
  // - Đỉnh là MỤC TIÊU của người học, không phải 990 cố định (SPEC mục 2.1).
  //   Kéo trục tới 990 cho người nhắm 700 sẽ ép đường tiến bộ phẳng lì.
  // - Đáy linh động lùi 50-100đ theo điểm thấp nhất, chia vạch chuẩn mốc TOEIC
  const chartYAxisConfig = useMemo(() => {
    const goal = goalScore;

    if (chartData.length === 0) {
      const emptyFloor = Math.max(100, goal - 500);
      const emptyTicks: number[] = [];
      for (let t = emptyFloor; t < goal; t += 200) emptyTicks.push(t);
      emptyTicks.push(goal);
      return {
        totalDomain: [emptyFloor, goal] as [number, number],
        totalTicks: emptyTicks,
        subDomain: [200, 495] as [number, number],
        subTicks: [200, 300, 400, 495]
      };
    }

    // 1. Cấu hình trục Total - trần là mục tiêu, nới ra nếu đã vượt mục tiêu
    const minTotal = Math.min(...chartData.map(d => d.total));
    const maxTotal = Math.max(...chartData.map(d => d.total));
    const ceilingTotal = Math.min(990, Math.max(goal, Math.ceil((maxTotal + 20) / 50) * 50));
    const rangeTotal = ceilingTotal - minTotal;
    
    let floorTotal: number;
    const totalTicks: number[] = [];

    if (rangeTotal <= 250) {
      // Dải điểm hẹp (người học ở band cao, ví dụ 750 - 950): Bước nhảy 50đ đều đặn
      floorTotal = Math.max(200, Math.floor((minTotal - 40) / 50) * 50);
      for (let s = floorTotal; s < ceilingTotal; s += 50) {
        totalTicks.push(s);
      }
      totalTicks.push(ceilingTotal);
    } else {
      // Dải điểm rộng: Bước nhảy 100đ tròn trịa theo các mốc chuẩn TOEIC (500, 600, 700, 800, 900, 990)
      floorTotal = Math.max(100, Math.floor((minTotal - 40) / 100) * 100);
      for (let s = floorTotal; s < ceilingTotal; s += 100) {
        totalTicks.push(s);
      }
      totalTicks.push(ceilingTotal);
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
      totalDomain: [floorTotal, ceilingTotal] as [number, number],
      totalTicks,
      subDomain: [floorSub, 495] as [number, number],
      subTicks
    };
  }, [chartData, goalScore]);

  const isDark = theme === 'dark';

  /**
   * Dải bốn chỉ số, cùng kiểu và cùng bốn tông màu với Tổng Quan:
   * xanh dương, xanh lá (đỏ khi giảm), hổ phách, hồng.
   */
  const isUp = stats.breakthrough >= 0;
  const hasTests = stats.totalTests > 0;
  const stabilityLabel = rolling.tests.length <= 1
    ? 'Cần từ 2 đề'
    : stats.stability <= 25 ? 'Rất ổn định' : stats.stability <= 45 ? 'Phong độ tốt' : 'Dao động mạnh';
  const kpis: {
    label: string;
    value: string | number;
    suffix?: string;
    note: string;
    hint?: string;
    icon: React.ElementType;
    number: string;
    badge: string;
    pill: string;
  }[] = [
    {
      label: 'Điểm trung bình',
      value: hasTests ? stats.avg : '—',
      suffix: `/ ${goalScore}`,
      note: retestStats.retestCount > 0 ? `Đề mới: ${retestStats.firstAttemptAvg}` : `${stats.totalTests} đề Full Test`,
      hint: retestStats.retestCount > 0
        ? `Số lớn tính mọi lượt, kể cả ${retestStats.retestCount} lượt làm lại. "Đề mới" chỉ tính lần làm đầu mỗi đề - con số sát thực lực hơn, vì làm lại thì nhớ đáp án (trung bình +${retestStats.avgRetestGain}đ).`
        : undefined,
      icon: BarChart3,
      number: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      pill: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
    },
    {
      label: 'Bứt phá',
      value: stats.totalTests > 1 ? `${stats.breakthrough > 0 ? '+' : ''}${stats.breakthrough}` : '—',
      note: stats.totalTests > 1 ? `${stats.firstScore} → ${stats.latestScore}` : 'Cần từ 2 đề',
      icon: isUp ? TrendingUp : TrendingDown,
      number: isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      badge: isUp
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
      pill: isUp
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
    },
    {
      label: 'Kỷ lục',
      value: hasTests ? stats.highest : '—',
      note: `L ${stats.highestListening} · R ${stats.highestReading}`,
      icon: Award,
      number: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
    },
    {
      label: 'Độ ổn định',
      value: rolling.tests.length > 1 ? `±${stats.stability}` : '—',
      note: `${stabilityLabel} · ${rolling.tests.length} đề mới`,
      hint: 'Độ lệch chuẩn tổng điểm của tối đa 5 Full Test gần nhất, loại lượt làm lại.',
      icon: Zap,
      number: 'text-pink-600 dark:text-pink-400',
      badge: 'bg-pink-50 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400',
      pill: 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300'
    }
  ];

  return (
    <div className="space-y-4 animate-fade-in text-slate-800 dark:text-slate-200">
      
      {/* 1. DẢI CHỈ SỐ - cùng kiểu dải bốn ô ở Tổng Quan: ô icon màu, con số
          cùng màu, nhãn màu thay cho dòng chữ xám. Cùng bốn tông màu. */}
      <div className={`${CARD} !p-0 grid grid-cols-2 lg:grid-cols-4`}>
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`px-3 py-3.5 2xl:px-5 min-w-0 border-slate-100 dark:border-slate-800 ${
              i % 2 === 1 ? 'border-l' : ''
            } ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${k.badge}`}>
                <k.icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold leading-tight text-slate-600 dark:text-slate-300 min-w-0">{k.label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-[28px] font-black tabular-nums leading-none ${k.number}`}>{k.value}</span>
              {k.suffix && <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">{k.suffix}</span>}
            </div>
            <span
              className={`mt-2 inline-block max-w-full truncate px-2 py-0.5 rounded-md text-xs font-semibold ${k.pill}`}
              title={k.hint || k.note}
            >
              {k.note}
            </span>
          </div>
        ))}
      </div>

      {/* 2. LỘ TRÌNH TĂNG TRƯỞNG - cùng kiểu biểu đồ ở Tổng Quan: số điểm trên
          từng chấm, chấm mới nhất tô đặc, nhãn mục tiêu nằm trên đường. */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Lộ trình tăng trưởng</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {chartViewMode === 'TOTAL' ? 'Tổng điểm quy đổi · các bài Full Test' : 'Listening và Reading trên cùng thang 495'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-sm">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={chartAttemptFilter}
                onChange={(e) => setChartAttemptFilter(e.target.value as ChartAttemptFilter)}
                aria-label="Lọc lượt thi"
                className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer py-0.5"
              >
                <option value="ALL">Tất cả lượt thi</option>
                <option value="FIRST_ONLY">Chỉ lần đầu</option>
                <option value="BEST_ONLY">Điểm cao nhất mỗi đề</option>
              </select>
            </label>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80" role="tablist">
              {([['TOTAL', 'Tổng điểm'], ['LR', 'Listening & Reading']] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={chartViewMode === key}
                  onClick={() => setChartViewMode(key)}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition cursor-pointer ${
                    chartViewMode === key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartViewMode === 'LR' && (
          <div className="flex items-center gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${SKILL_COLORS.listening.bar}`} /> Listening
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${SKILL_COLORS.reading.bar}`} /> Reading
            </span>
          </div>
        )}

        {chartData.length > 0 ? (
          <div className="h-[300px] sm:h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="anFillTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={isDark ? 0.3 : 0.16} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="anFillL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKILL_COLORS.listening.hex} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={SKILL_COLORS.listening.hex} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="anFillR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKILL_COLORS.reading.hex} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={SKILL_COLORS.reading.hex} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />

                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}
                  tickMargin={8}
                  axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                  tickLine={false}
                  padding={{ left: 24, right: 24 }}
                />
                <YAxis
                  domain={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalDomain : chartYAxisConfig.subDomain}
                  ticks={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalTicks : chartYAxisConfig.subTicks}
                  interval={0}
                  width={44}
                  tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    const diff = sessionDiffMap[d.id];
                    return (
                      <div className="p-3 rounded-xl bg-slate-900/95 text-white shadow-xl border border-slate-700 text-sm space-y-1 min-w-[200px]">
                        <div className="text-xs text-slate-300 font-semibold">
                          {d.date} · {d.name}{d.isRetest ? ` · Lần ${d.attemptNumber}` : ''}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-blue-300 tabular-nums">{d.total}đ</span>
                          {diff !== null && diff !== undefined && (
                            <span className={`text-xs font-bold ${diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {diff > 0 ? `+${diff}` : diff} so với đề trước
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300">L {d.listening} · R {d.reading}</div>
                        {d.isRetest && d.scoreDiffFromFirst !== null && d.scoreDiffFromFirst !== undefined && (
                          <div className="text-xs text-slate-300">
                            So với lần 1: {d.scoreDiffFromFirst >= 0 ? `+${d.scoreDiffFromFirst}` : d.scoreDiffFromFirst}đ
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {chartViewMode === 'TOTAL' && (
                  <ReferenceLine
                    y={goalScore}
                    stroke={isDark ? '#60A5FA' : '#93C5FD'}
                    strokeDasharray="6 3"
                    label={{
                      value: `Mục tiêu ${goalScore}`,
                      position: 'insideBottomRight',
                      fontSize: 12,
                      fontWeight: 600,
                      fill: isDark ? '#93C5FD' : '#2563EB'
                    }}
                  />
                )}

                {/* Không dùng hiệu ứng vẽ đường: Recharts chỉ vẽ chấm (và số
                    điểm) sau khi hiệu ứng xong, mà hiệu ứng có lúc không xong. */}
                {chartViewMode === 'TOTAL' ? (
                  <Area
                    type="linear"
                    dataKey="total"
                    name="Tổng điểm"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#anFillTotal)"
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props;
                      if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                      const isLast = index === chartData.length - 1;
                      return (
                        <g key={`an-dot-${payload?.id || cx}`}>
                          <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill={isDark ? '#E2E8F0' : '#1E293B'}>
                            {payload?.total}
                          </text>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isLast ? 5.5 : 4}
                            fill={isLast ? '#2563EB' : isDark ? '#0F172A' : '#FFFFFF'}
                            stroke="#2563EB"
                            strokeWidth={2}
                          />
                        </g>
                      );
                    }}
                    activeDot={{ r: 6, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                ) : (
                  <>
                    <Area
                      type="linear"
                      dataKey="listening"
                      name="Listening"
                      stroke={SKILL_COLORS.listening.hex}
                      strokeWidth={2.5}
                      fill="url(#anFillL)"
                      isAnimationActive={false}
                      dot={{ r: 4, fill: isDark ? '#0F172A' : '#FFFFFF', stroke: SKILL_COLORS.listening.hex, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: SKILL_COLORS.listening.hex, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                    <Area
                      type="linear"
                      dataKey="reading"
                      name="Reading"
                      stroke={SKILL_COLORS.reading.hex}
                      strokeWidth={2.5}
                      fill="url(#anFillR)"
                      isAnimationActive={false}
                      dot={{ r: 4, fill: isDark ? '#0F172A' : '#FFFFFF', stroke: SKILL_COLORS.reading.hex, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: SKILL_COLORS.reading.hex, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <BarChart3 className="w-8 h-8 opacity-40" />
            <span>Chưa có bài Full Test nào để vẽ biểu đồ.</span>
          </div>
        )}
      </div>

      {/* 3. MA TRẬN 7 PART - hai khối trung tính, màu nằm ở icon, thanh và
          chip của từng kỹ năng (chàm / xanh ngọc) như thẻ Kỹ năng ở Tổng Quan.
          Part thấp nhất đánh dấu hổ phách (màu cảnh báo), thanh vẫn giữ màu kỹ năng. */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Ma trận năng lực 7 Part</h2>
          {partStats && (
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg whitespace-nowrap">
              {partStats.validTestsCount}/5 đề mới gần nhất
            </span>
          )}
        </div>

        {partStats ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([
                {
                  skill: 'listening' as const,
                  icon: Headphones,
                  title: 'Listening',
                  current: targetGap.currentLC,
                  target: targetGap.targetLC,
                  gap: targetGap.lcGap,
                  questions: targetGap.lcQuestionsNeeded,
                  parts: [
                    { key: 'part1', code: 'P1', name: 'Mô tả tranh', max: 6 },
                    { key: 'part2', code: 'P2', name: 'Hỏi & Đáp', max: 25 },
                    { key: 'part3', code: 'P3', name: 'Hội thoại', max: 39 },
                    { key: 'part4', code: 'P4', name: 'Bài nói ngắn', max: 30 }
                  ]
                },
                {
                  skill: 'reading' as const,
                  icon: BookOpen,
                  title: 'Reading',
                  current: targetGap.currentRC,
                  target: targetGap.targetRC,
                  gap: targetGap.rcGap,
                  questions: targetGap.rcQuestionsNeeded,
                  parts: [
                    { key: 'part5', code: 'P5', name: 'Điền câu', max: 30 },
                    { key: 'part6', code: 'P6', name: 'Điền đoạn văn', max: 16 },
                    { key: 'part7', code: 'P7', name: 'Đọc hiểu văn bản', max: 54 }
                  ]
                }
              ]).map(block => {
                const c = SKILL_COLORS[block.skill];
                return (
                  <div key={block.skill} className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${c.soft}`}>
                          <block.icon className={`w-5 h-5 ${c.text}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{block.title}</h3>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-semibold ${c.chip}`}>
                            {block.gap > 0 ? `Cần thêm +${block.gap}đ (~${block.questions} câu)` : 'Đã đạt phần mục tiêu'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-2xl font-black tabular-nums ${c.text}`}>{block.current}</span>
                        <span className="text-sm font-semibold text-slate-400 dark:text-slate-500"> / {block.target}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {block.parts.map(p => {
                        const key = p.key as keyof LRPartScore;
                        const acc = partStats.accuracy[key] || 0;
                        const avg = Math.round(partStats.averages[key] || 0);
                        const isWeakest = weakestPart?.key === key;
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                              isWeakest
                                ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                                : 'bg-white border-slate-100 dark:bg-slate-900/70 dark:border-slate-800'
                            }`}
                          >
                            <span className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${c.chip}`}>
                              {p.code}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
                                {isWeakest && (
                                  <span className="px-1.5 py-0.5 rounded-md text-xs font-bold text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/60 whitespace-nowrap">
                                    Thấp nhất
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.max(2, acc)}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                  {avg}/{p.max} câu
                                </span>
                              </div>
                            </div>
                            <span className={`text-base font-black tabular-nums w-12 text-right shrink-0 ${
                              isWeakest ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'
                            }`}>
                              {acc}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gợi ý tính từ dữ liệu thật. Bản cũ ghi cứng "~2 câu · +25đ" cho mọi người. */}
            {weakestPart && weakestPart.accuracy < 100 && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-sm text-slate-700 dark:text-slate-200">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-current shrink-0" />
                <span className="min-w-0">
                  <strong className="font-bold">{weakestPart.name.split(':')[0]}</strong> đang thấp nhất: trung bình {weakestPart.avgCorrect}/{weakestPart.max} câu ({weakestPart.accuracy}%).
                  {' '}Mỗi câu đúng thêm ≈ +5đ {['part1', 'part2', 'part3', 'part4'].includes(weakestPart.key) ? 'Listening' : 'Reading'}.
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Chưa có bài Full Test nào ghi số câu đúng từng Part.
          </div>
        )}
      </div>

      {/* 4. Chẩn Đoán Theo Nguyên Nhân Sai (SPEC 1.4 điểm 1) */}
      <div className={`${CARD} space-y-4`}>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">Chẩn Đoán Nguyên Nhân Mất Điểm</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Không phải bạn sai ở Part nào, mà là bạn sai <strong className="font-semibold">vì sao</strong>
            </p>
          </div>
          {errorDiagnosis && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
              {errorDiagnosis.total} lỗi đã ghi · {errorDiagnosis.pendingCount} chờ ôn
            </span>
          )}
        </div>

        {errorDiagnosis ? (
          <>
            {/* Câu kết luận - thứ người dùng đọc trước tiên */}
            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40">
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                <strong className="font-bold">{errorDiagnosis.top.percent}%</strong> số lỗi của bạn thuộc nhóm{' '}
                <strong className="font-bold">{errorDiagnosis.top.label}</strong>
                {errorDiagnosis.top.parts.length > 1 ? (
                  <>
                    {' '}— rải ở {errorDiagnosis.top.parts.map(p => `Part ${p}`).join(', ')}.{' '}
                    <span className="text-slate-600 dark:text-slate-300">
                      Đây là lỗ hổng <strong className="font-semibold">kỹ năng</strong>, không phải lỗ hổng Part.
                      Luyện riêng một Part sẽ không giải quyết được.
                    </span>
                  </>
                ) : (
                  <>
                    {' '}— tập trung ở Part {errorDiagnosis.top.parts[0]}.{' '}
                    <span className="text-slate-600 dark:text-slate-300">
                      Khu trú ở một Part nên có thể xử lý bằng luyện tập nhắm đúng chỗ.
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Phân bố theo nhóm nguyên nhân: một màu, xếp giảm dần, nhãn trực tiếp */}
            <div className="space-y-2.5">
              {errorDiagnosis.rows.map((row, index) => {
                const barPercent = Math.round((row.count / errorDiagnosis.maxCount) * 100);
                const isTop = index === 0;

                return (
                  <div key={row.category} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {row.label}
                        </span>
                        {isTop && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 whitespace-nowrap shrink-0">
                            Điểm nghẽn
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap shrink-0">
                        {row.count} <span className="font-medium text-slate-400 dark:text-slate-500">· {row.percent}%</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-500"
                          style={{ width: `${Math.max(3, barPercent)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap shrink-0 w-[92px] text-right">
                        {row.parts.map(p => `P${p}`).join(' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              Cột bên phải là các Part mà nhóm lỗi đó xuất hiện. Dữ liệu lấy từ Sổ Tay Bắt Bẫy — ghi càng đủ, chẩn đoán càng chính xác.
            </p>
          </>
        ) : (
          <div className="py-10 text-center space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chưa có lỗi nào trong Sổ Tay Bắt Bẫy.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
              Mỗi lần làm đề, ghi lại vài câu sai kèm nguyên nhân. Sau khoảng 20 lỗi, phần này sẽ chỉ ra
              nguyên nhân nào đang lấy đi nhiều điểm nhất của bạn.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${CARD} space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Lịch học 12 tuần</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{heatmap.filter(day => day.active).length}/84 ngày</span>
          </div>
          <div className="grid grid-flow-col grid-rows-7 grid-cols-12 gap-1" aria-label="Lịch học 12 tuần">
            {heatmap.map(day => (
              <span key={day.date} title={`${day.date}: ${day.session ? 'có buổi học' : ''}${day.session && day.vocabulary ? ', ' : ''}${day.vocabulary ? 'có từ vựng' : ''}${!day.active ? 'chưa ghi học' : ''}`}
                aria-label={`${day.date}: ${day.active ? 'đã học' : 'chưa học'}`}
                className={`aspect-square rounded-[4px] border ${day.active ? 'border-blue-500 bg-blue-600 dark:border-blue-400 dark:bg-blue-500' : 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{vocabTotal12Weeks} từ đã ghi trong 12 tuần. Một ngày được tô khi có buổi học hoặc ghi từ vựng.</p>
        </section>

        <section className={`${CARD} space-y-3`}>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Thời gian vượt từng pha</h2>
          {pacing.phases.length ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">Trung bình từ {pacing.runsUsed} lượt Phòng Thi cùng chế độ có bấm “xong pha”.</p>
              <div className="h-40" aria-label="Biểu đồ thời gian vượt từng pha">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pacing.phases} margin={{ top: 4, right: 8, bottom: 4, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="′" />
                    <Tooltip formatter={(value: number) => [`${value} phút`, 'Vượt giờ trung bình']} />
                    <Bar dataKey="averageOverrun" fill="#475569" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">{pacing.phases.map(phase => (
                <div key={phase.name} className="flex justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <span>{phase.name} <span className="text-xs text-slate-400">({phase.count} lượt)</span></span>
                  <strong className={phase.averageOverrun > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}>{phase.averageOverrun > 0 ? '+' : ''}{phase.averageOverrun} phút</strong>
                </div>
              ))}</div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cần ít nhất 3 lượt cùng chế độ: vào Phòng Thi và bấm “xong pha” khi hoàn tất từng pha để xem xu hướng.</p>
          )}
        </section>
      </div>

      <section className={`${CARD} space-y-3`}>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Ưu tiên cải thiện theo nguyên nhân</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {priority.eligible
            ? `Ước tính từ ${priority.testsUsed} đề mới và ${priority.mistakeCount} lỗi đã phân loại; đây không phải điểm ETS chính thức.`
            : `Chưa đủ dữ liệu (${priority.testsUsed}/3 đề mới có điểm từng Part, ${priority.mistakeCount}/10 lỗi). Hiện chỉ xếp theo tần suất lỗi.`}
        </p>
        {priority.rows.length ? <div className="space-y-2">{priority.rows.map(row => (
          <div key={row.category} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <span>{ERROR_CATEGORY_LABELS[row.category].label}</span>
            <strong className="whitespace-nowrap">{priority.eligible ? `ước tính +${Math.round(row.estimatedPoints)}đ` : `${row.count} lỗi`}</strong>
          </div>
        ))}</div> : <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có lỗi đã phân loại.</p>}
      </section>

      {/* 5. Tinh Gọn: Bảng Lịch Sử Luyện Đề (Đã lược bỏ thông tin thừa, phẳng phiu & sắc nét) */}
      <div className={`${CARD} space-y-4`}>
        
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
                <span className="px-1.5 py-0.5 rounded bg-blue-200/80 dark:bg-blue-900/80 text-blue-800 dark:text-blue-200 group-hover:bg-rose-200 group-hover:text-rose-800 text-xs font-black flex items-center gap-0.5">
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
                          <span className="px-1.5 py-0.5 rounded text-xs font-black shrink-0 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            Lần {attemptMeta.attemptNumber}
                            {attemptMeta.scoreDiffFromFirst !== null && (
                              <span className="ml-1 text-xs font-extrabold text-blue-600 dark:text-blue-300">
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
                        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                          <Clock className="w-3 h-3 text-blue-500/80 dark:text-blue-400/80 shrink-0" />
                          <span>{session.durationMinutes} phút</span>
                        </div>
                      )}
                    </td>

                    {/* Hình thức gọn gàng */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs ${
                        isFull 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60'
                      }`}>
                        {isFull ? 'Full Test' : 'Luyện Part'}
                      </span>
                    </td>

                    {/* Listening - màu chàm như Tổng Quan */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {session.scaledListening ? (
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xs font-mono tabular-nums">
                          {session.scaledListening}đ
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">--</span>
                      )}
                    </td>

                    {/* Reading - màu xanh ngọc như Tổng Quan */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {session.scaledReading ? (
                        <span className="font-bold text-teal-600 dark:text-teal-400 text-xs font-mono tabular-nums">
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
                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full font-bold text-xs font-mono tabular-nums">
                              <TrendingUp className="w-3 h-3 mr-1" />+{diff}đ
                            </span>
                          ) : diff < 0 ? (
                            <span className="inline-flex items-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full font-bold text-xs font-mono tabular-nums">
                              <TrendingDown className="w-3 h-3 mr-1" />{diff}đ
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-semibold text-xs font-mono tabular-nums">
                              0đ
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs font-medium">Mốc đầu</span>
                        )
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">-</span>
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
                            onEditSession(session);
                          }}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-blue-200/50 dark:hover:border-blue-800/50 transition-all cursor-pointer shadow-2xs"
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
            <span className="text-slate-500 dark:text-slate-400 text-xs">
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
                /* Buổi luyện Part lẻ: hiện đúng các Part đã luyện, không phải
                   hai ô Listening/Reading vốn chỉ có nghĩa với đề đầy đủ */
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
                          {first.scaledListening}đ ➔ {selectedSessionDetail.scaledListening}đ
                        </div>
                        <span className="text-xs font-black text-slate-500 dark:text-slate-400 block mt-0.5">
                          {diffLC >= 0 ? `+${diffLC}` : diffLC}đ
                        </span>
                      </div>

                      {/* Reading */}
                      <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-xs text-teal-600 dark:text-teal-400 block font-semibold">Reading</span>
                        <div className="font-mono font-black text-sm text-teal-600 dark:text-teal-400 mt-0.5">
                          {first.scaledReading}đ ➔ {selectedSessionDetail.scaledReading}đ
                        </div>
                        <span className="text-xs font-black text-teal-600 dark:text-teal-400 block mt-0.5">
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
