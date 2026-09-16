import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Target, 
  Trash2, 
  Search, 
  Lightbulb,
  BarChart3
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { StudySession, MistakeEntry, ERROR_CATEGORY_LABELS, LRPartScore } from '../types';
import { calculatePartAccuracy, PART_MAX_QUESTIONS, PART_NAMES } from '../utils/etsScoring';

interface AnalyticsViewProps {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme: 'light' | 'dark';
  onDeleteSession: (sessionId: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sessions,
  mistakes,
  theme,
  onDeleteSession
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'FULL_TEST' | 'PART_PRACTICE'>('ALL');

  // Lọc danh sách buổi học
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      const matchSearch = s.testName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchType = filterType === 'ALL' || s.sessionType === filterType;
      return matchSearch && matchType;
    });
  }, [sessions, searchTerm, filterType]);

  const fullTests = useMemo(() => sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0), [sessions]);

  // Thống kê tổng quan
  const stats = useMemo(() => {
    const totalTimeHours = Math.round(sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / 60);
    const highest = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.totalScore || 0)) : 0;
    const avg = fullTests.length > 0 ? Math.round(fullTests.reduce((acc, s) => acc + (s.totalScore || 0), 0) / fullTests.length) : 0;
    const highestListening = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledListening || 0)) : 0;
    const highestReading = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledReading || 0)) : 0;

    return {
      totalTests: fullTests.length,
      totalHours: totalTimeHours,
      highest,
      avg,
      highestListening,
      highestReading
    };
  }, [sessions, fullTests]);

  // Dữ liệu cho biểu đồ diện tích (AreaChart)
  const chartData = useMemo(() => {
    return [...fullTests].reverse().map(session => ({
      date: session.date,
      name: session.testName,
      listening: session.scaledListening || 0,
      reading: session.scaledReading || 0,
      total: session.totalScore || 0
    }));
  }, [fullTests]);

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
      accuracy
    };
  }, [fullTests]);

  // Radar Data
  const radarData = useMemo(() => {
    if (!partStats) return [];
    return [
      { part: 'P1 (Tranh)', accuracy: partStats.accuracy.part1 },
      { part: 'P2 (Hỏi-Đáp)', accuracy: partStats.accuracy.part2 },
      { part: 'P3 (Hội thoại)', accuracy: partStats.accuracy.part3 },
      { part: 'P4 (Bài nói)', accuracy: partStats.accuracy.part4 },
      { part: 'P5 (Điền câu)', accuracy: partStats.accuracy.part5 },
      { part: 'P6 (Đoạn văn)', accuracy: partStats.accuracy.part6 },
      { part: 'P7 (Đọc hiểu)', accuracy: partStats.accuracy.part7 },
    ];
  }, [partStats]);

  // Phân bổ nguyên nhân lỗi sai từ Mistakes
  const errorBreakdownData = useMemo(() => {
    const counts: Record<string, number> = {};
    mistakes.forEach(m => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });

    return Object.entries(ERROR_CATEGORY_LABELS).map(([catKey, info]) => ({
      name: info.label,
      key: catKey,
      count: counts[catKey] || 0,
      color: info.color
    })).sort((a, b) => b.count - a.count);
  }, [mistakes]);

  // Xác định điểm yếu lớn nhất cần khắc phục để bứt phá 990
  const weakestPart = useMemo(() => {
    if (!partStats) return null;
    let minAcc = 100;
    let worstKey = 'part7' as keyof LRPartScore;

    (Object.keys(partStats.accuracy) as Array<keyof LRPartScore>).forEach(key => {
      if (partStats.accuracy[key] < minAcc) {
        minAcc = partStats.accuracy[key];
        worstKey = key;
      }
    });

    return {
      key: worstKey,
      name: PART_NAMES[worstKey],
      accuracy: minAcc
    };
  }, [partStats]);

  const isDark = theme === 'dark';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
  const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
  const tooltipText = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ui-card p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Đề Full Test Đã Làm</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{stats.totalTests}</span>
          <span className="text-[11px] text-slate-400">Chuẩn 200 câu</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Tổng Thời Gian Làm Bài</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">{stats.totalHours}h</span>
          <span className="text-[11px] text-slate-400">Giữ vững phong độ</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Listening Kỷ Lục</span>
          <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1 block">{stats.highestListening}/495</span>
          <span className="text-[11px] text-slate-400">Độ nhạy âm thanh</span>
        </div>

        <div className="ui-card p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Reading Kỷ Lục</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{stats.highestReading}/495</span>
          <span className="text-[11px] text-slate-400">Tốc độ & ngữ pháp</span>
        </div>
      </div>

      {/* Strategic Insight Alert if Weak Part identified */}
      {weakestPart && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start space-x-3">
          <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Khuyến Nghị Chiến Lược Cho Mốc 990
            </h4>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              Phần <strong className="text-slate-900 dark:text-white">{weakestPart.name}</strong> đang có độ chính xác thấp nhất (<strong className="text-amber-700 dark:text-amber-400">{weakestPart.accuracy}%</strong>). 
              Tập trung giải quyết các bẫy của phần này sẽ giúp bạn tăng từ 20-40 điểm ngay trong tuần tới!
            </p>
          </div>
        </div>
      )}

      {/* Main Graph: Area Chart Score Timeline */}
      <div className="ui-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Lộ Trình Điểm Số Toàn Diện</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Đường phát triển qua từng kỳ thi so với mốc 990 tuyệt đối</p>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" stroke={textColor} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 1000]} ticks={[0, 200, 400, 600, 800, 990]} stroke={textColor} tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: tooltipBg, 
                    borderColor: tooltipBorder,
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    color: tooltipText,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }} 
                />
                <ReferenceLine 
                  y={990} 
                  stroke="#8B5CF6" 
                  strokeDasharray="4 4" 
                  label={{ value: 'MỤC TIÊU 990', fill: '#8B5CF6', fontSize: 10, position: 'insideTopRight' }} 
                />
                <Area type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" name="Tổng Điểm" />
                <Area type="monotone" dataKey="listening" stroke="#06B6D4" strokeWidth={2} fillOpacity={0} name="Listening" />
                <Area type="monotone" dataKey="reading" stroke="#10B981" strokeWidth={2} fillOpacity={0} name="Reading" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              Chưa có dữ liệu bài test để vẽ biểu đồ.
            </div>
          )}
        </div>
      </div>

      {/* 2-Columns: Radar 7 Parts & Error Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Radar & Part Accuracies */}
        <div className="ui-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Target className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Độ Làm Chủ 7 Part</h3>
          </div>

          <div className="h-60 w-full">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke={gridColor} />
                  <PolarAngleAxis dataKey="part" stroke={textColor} tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} stroke={textColor} tick={false} />
                  <Radar name="Chính xác (%)" dataKey="accuracy" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có dữ liệu chi tiết Part.
              </div>
            )}
          </div>

          {/* Detailed Part Accuracies */}
          {partStats && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              {(Object.keys(partStats.accuracy) as Array<keyof LRPartScore>).map(k => {
                const acc = partStats.accuracy[k];
                const avg = partStats.averages[k];
                const max = PART_MAX_QUESTIONS[k];

                return (
                  <div key={k} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{PART_NAMES[k].split(':')[0]}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500 dark:text-slate-400">{avg}/{max} câu</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                        acc >= 90 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        acc >= 80 ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300' :
                        acc >= 70 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 
                        'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}>
                        {acc}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error Breakdown Bar Chart */}
        <div className="ui-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Phân Loại Nguyên Nhân Sai Sót</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dữ liệu từ Sổ tay bẫy đề thi để vá lỗ hổng</p>

          <div className="h-60 w-full">
            {errorBreakdownData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorBreakdownData} layout="vertical" margin={{ top: 10, right: 15, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" stroke={textColor} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" stroke={textColor} tick={{ fontSize: 10 }} width={110} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: tooltipBg, 
                      borderColor: tooltipBorder,
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: tooltipText,
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }} 
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {errorBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có lỗi sai nào trong Sổ tay.
              </div>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {errorBreakdownData.slice(0, 3).map(item => (
              <div key={item.key} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{item.count} câu</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Full Test History Table */}
      <div className="ui-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Toàn Bộ Lịch Sử Luyện Đề ({filteredSessions.length})</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Nhật ký các đề thi và buổi học đã thực hiện</p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm đề..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Tất cả</option>
              <option value="FULL_TEST">Full Test</option>
              <option value="PART_PRACTICE">Luyện Part</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Tên Đề / Buổi Học</th>
                <th className="py-2.5 px-3 font-semibold">Loại</th>
                <th className="py-2.5 px-3 font-semibold">Ngày</th>
                <th className="py-2.5 px-3 font-semibold">Thời Gian</th>
                <th className="py-2.5 px-3 font-semibold text-center">Listening</th>
                <th className="py-2.5 px-3 font-semibold text-center">Reading</th>
                <th className="py-2.5 px-3 font-semibold text-center">Tổng Điểm</th>
                <th className="py-2.5 px-3 font-semibold text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSessions.map(session => (
                <tr key={session.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                    {session.testName}
                    {session.notes && (
                      <p className="text-[11px] text-slate-400 font-normal italic mt-0.5 line-clamp-1">
                        {session.notes}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      session.sessionType === 'FULL_TEST'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}>
                      {session.sessionType === 'FULL_TEST' ? 'Full Test' : 'Luyện Part'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{session.date}</td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{session.durationMinutes}p</td>
                  <td className="py-3 px-3 text-center font-bold text-cyan-600 dark:text-cyan-400">
                    {session.sessionType === 'FULL_TEST' ? session.scaledListening : '---'}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                    {session.sessionType === 'FULL_TEST' ? session.scaledReading : '---'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {session.sessionType === 'FULL_TEST' ? (
                      <span className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                        {session.totalScore}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Xong</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Bạn có chắc muốn xóa buổi học "${session.testName}"?`)) {
                          onDeleteSession(session.id);
                        }
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-500 transition"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                    Không tìm thấy buổi học nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
