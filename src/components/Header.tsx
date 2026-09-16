import React, { useRef } from 'react';
import { 
  Flame, 
  ShieldAlert, 
  PlusCircle, 
  Download, 
  Upload, 
  Settings, 
  Sparkles, 
  RotateCcw,
  Headphones,
  BookOpen,
  Mic,
  PenTool
} from 'lucide-react';
import { UserProfile } from '../types';
import { exportDataAsJSON, importDataFromJSON } from '../utils/storage';

interface HeaderProps {
  profile: UserProfile;
  activeTab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap') => void;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onResetData: () => void;
  onLoadDemo: () => void;
  onImportSuccess: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activeTab,
  setActiveTab,
  onOpenSessionLogger,
  onOpenSettings,
  onResetData,
  onLoadDemo,
  onImportSuccess
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content && importDataFromJSON(content)) {
          alert('Khôi phục dữ liệu sao lưu thành công!');
          onImportSuccess();
        } else {
          alert('Tệp dữ liệu không hợp lệ hoặc bị lỗi định dạng!');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 via-purple-600 to-indigo-600 shadow-lg shadow-orange-500/20 p-0.5">
              <div className="w-full h-full bg-[#090D16] rounded-[10px] flex items-center justify-center">
                <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-purple-400 text-lg">
                  990
                </span>
              </div>
              <div className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-extrabold tracking-tight text-white">
                  TOEIC <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-purple-400 to-cyan-400">PROGRESS</span>
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/30">
                  Target 990
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Trạm chỉ huy tự học công nghệ cao</p>
            </div>
          </div>

          {/* Center: Skill Switcher (Modular Architecture) */}
          <div className="hidden md:flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab !== 'sw-roadmap'
                  ? 'bg-gradient-to-r from-purple-600/90 to-indigo-600/90 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-1">
                <Headphones className="w-3.5 h-3.5 text-cyan-300" />
                <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
              </div>
              <span>Listening & Reading (990)</span>
            </button>

            <button
              onClick={() => setActiveTab('sw-roadmap')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'sw-roadmap'
                  ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-1">
                <Mic className="w-3.5 h-3.5 text-pink-400" />
                <PenTool className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span>Speaking & Writing (400)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                Roadmap
              </span>
            </button>
          </div>

          {/* Right: Gamified Streak, Freeze Shield & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Streak Flame Badge */}
            <div 
              className="flex items-center space-x-1.5 bg-gradient-to-r from-orange-950/60 to-amber-950/40 border border-orange-500/40 px-3 py-1.5 rounded-xl glow-flame"
              title={`Chuỗi học liên tục ${profile.currentStreak} ngày. Kỷ lục: ${profile.longestStreak} ngày.`}
            >
              <Flame className="w-5 h-5 text-orange-400 fill-orange-500 animate-pulse" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-sm font-extrabold text-orange-200">
                  {profile.currentStreak} <span className="text-[10px] font-normal text-orange-300">ngày</span>
                </span>
                <span className="text-[9px] text-orange-400/80 font-medium">Chuỗi Streak</span>
              </div>
            </div>

            {/* Streak Freeze Shield */}
            <div 
              className="hidden sm:flex items-center space-x-1 bg-slate-900/80 border border-cyan-500/30 px-2.5 py-1.5 rounded-xl text-cyan-300"
              title={`Khiên cứu chuỗi: Còn ${profile.streakFreezes} lần sử dụng tự động khi bạn bận 1 ngày.`}
            >
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold">{profile.streakFreezes}</span>
            </div>

            {/* Log Session Button */}
            <button
              onClick={onOpenSessionLogger}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-lg shadow-orange-500/25 transition-all transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden xs:inline">Nhập Kết Quả</span>
            </button>

            {/* Export & Import JSON Backup */}
            <div className="hidden lg:flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={exportDataAsJSON}
                title="Sao lưu toàn bộ dữ liệu ra file JSON"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Khôi phục dữ liệu từ file JSON"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>

            {/* Demo / Reset Data */}
            <div className="relative group">
              <button 
                title="Tùy chọn dữ liệu Demo / Reset"
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
              </button>
              
              <div className="absolute right-0 mt-2 w-48 py-2 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <button
                  onClick={onLoadDemo}
                  className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-amber-400 flex items-center space-x-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Nạp Dữ Liệu Demo Mẫu</span>
                </button>
                <button
                  onClick={onResetData}
                  className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-slate-800 flex items-center space-x-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Xóa Trắng (Bắt đầu thật)</span>
                </button>
              </div>
            </div>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
              title="Cài đặt mục tiêu & Ngày thi"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'dashboard' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40' : 'text-slate-400'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'analytics' ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
            }`}
          >
            Phân Tích
          </button>
          <button
            onClick={() => setActiveTab('mistakes')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'mistakes' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'text-slate-400'
            }`}
          >
            Sổ Tay Lỗi
          </button>
          <button
            onClick={() => setActiveTab('sw-roadmap')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'sw-roadmap' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-slate-400'
            }`}
          >
            S&W 400
          </button>
        </div>

      </div>
    </header>
  );
};
