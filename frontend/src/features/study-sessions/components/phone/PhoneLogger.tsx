import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LRPartScore, PartTimingDurations, PracticePartResult, StudySession } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { getTodayDateString, loadVocabLog } from '@/shared/data/storage';
import { Soc } from '@/shared/ui/soc/Soc';
import { PhoneSheet } from '@/app/components/phone';
import { getAIConfiguration } from '@/features/mistakes/services/aiMistakeExtractor';
import type { ResultImageTiming } from '@/shared/types';
import { WrongQuestionGrid } from '../WrongQuestionGrid';
import { PartTimingModal } from '../PartTimingModal';
import type { AppliedResultScore, ResultScoreStore } from '../ResultScoreReview';
import type { WrongNumberDraft } from '../../lib/wrongNumberDraft';
import { WheelPicker } from './WheelPicker';
import { chipNames, clamp, countFromScaled, dayLabel, percent, previousDay, previousScored, recentTestNames, scaledFromCount, vocabWeek, dayMonth, VOCAB_CHIPS, type VocabEditApi } from './phoneLogLib';
import './phoneLog.css';

export type PhoneStep = 'pick' | 'manual' | 'wrong';
type PartNumber = PracticePartResult['part'];
const partMax = (part: PartNumber) => PART_MAX_QUESTIONS[`part${part}` as keyof LRPartScore];

export interface PhoneLoggerProps {
  sessionType: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB';
  isEditing: boolean;
  step: PhoneStep; setStep: (step: PhoneStep) => void;
  onClose: () => void;
  sessions: StudySession[]; editingId?: string;
  testName: string; setTestName: (value: string) => void; suggestions: string[];
  date: string; setDate: (value: string) => void;
  duration: number; setDuration: (value: number) => void;
  partDurations?: PartTimingDurations; onPartDurationsChange: (value: PartTimingDurations | undefined) => void;
  scoreSource: string;
  manualListening: string; manualReading: string; manualTotal: string;
  changeSectionScores: (listening: string, reading: string) => void;
  totalPreview?: number;
  wrongQuestions: number[]; onWrong: (wrong: number[]) => void;
  numberDraft: WrongNumberDraft; onNumberDraft: (value: WrongNumberDraft) => void;
  onTiming: (value: ResultImageTiming) => void;
  onScores: (score: AppliedResultScore) => void;
  onScoresPending: (pending: boolean) => void;
  scoreStore: ResultScoreStore;
  onRevertScore: () => void;
  initialFiles?: File[]; setInitialFiles: (files: File[] | undefined) => void;
  timingNotice: ReactNode;
  scoreError: string;
  /** Same test already logged that day: shown above the save button, which then saves anyway. */
  duplicateNotice?: ReactNode;
  practiceRows: PracticePartResult[]; setPracticeRows: (rows: PracticePartResult[]) => void;
  vocabCount: number; setVocabCount: (value: number) => void;
  vocab: VocabEditApi;
}

function Header({ title, right, onClose }: { title: string; right?: ReactNode; onClose: () => void }) {
  return (
    <header className="pl-head">
      <button type="button" className="pl-x" aria-label="Đóng form ghi nhận buổi học" onClick={onClose}>×</button>
      <h2 id="session-logger-title" className="pl-title">{title}</h2>
      {right ? <span className="pl-right">{right}</span> : null}
    </header>
  );
}

function DateChip({ date, setDate, today }: { date: string; setDate: (value: string) => void; today: string }) {
  return (
    <label className="pl-chip pl-chip--ghost">
      <span>📅 {dayLabel(date, today)}</span>
      <input type="date" required max={today} value={date} aria-label="Ngày làm" onChange={event => event.target.value && setDate(event.target.value)} />
    </label>
  );
}

function Stepper({ title, sub, value, min, max, onChange, label }: { title: string; sub: string; value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  const set = (next: number) => onChange(clamp(Math.round(next), min, max));
  return (
    <div className="pl-row pl-row--step">
      <div><b>{title}</b><small>{sub}</small></div>
      <span className="pl-pm">
        <button type="button" aria-label={`Giảm ${label}`} onClick={() => set(value - 1)}>−</button>
        <input data-large-text type="text" inputMode="numeric" pattern="[0-9]*" aria-label={label} value={String(value)}
          onFocus={event => event.currentTarget.select()} onChange={event => set(Number(event.target.value.replace(/\D/g, '') || 0))} />
        <button type="button" aria-label={`Tăng ${label}`} onClick={() => set(value + 1)}>+</button>
      </span>
    </div>
  );
}

export function PhoneLogger(props: PhoneLoggerProps) {
  const today = getTodayDateString();
  const { sessionType, step, setStep } = props;
  const prev = useMemo(() => previousScored(props.sessions, props.editingId), [props.sessions, props.editingId]);
  const [mode, setMode] = useState<'score' | 'count'>('score');
  const [counts, setCounts] = useState({ listening: 80, reading: 80 });
  const [timeOpen, setTimeOpen] = useState(false);
  const [partTimeOpen, setPartTimeOpen] = useState(false);
  const [wrongFrom, setWrongFrom] = useState<'pick' | 'manual'>('pick');
  const [aiOn, setAiOn] = useState(true);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setConfirmDel(false); }, [props.date]);
  useEffect(() => { let off = false; void getAIConfiguration().then(c => { if (!off) setAiOn(c.resultImages !== false); }).catch(() => {}); return () => { off = true; }; }, []);

  const listening = Number(props.manualListening) || 0;
  const reading = Number(props.manualReading) || 0;
  const total = listening + reading;
  const delta = prev ? total - (prev.totalScore ?? 0) : null;

  const goManual = () => {
    if (props.scoreSource === 'ESTIMATED' || !props.manualListening || !props.manualReading) {
      const l = prev?.scaledListening ?? 250, r = prev?.scaledReading ?? 250;
      props.changeSectionScores(String(l), String(r));
    }
    setMode('score');
    setStep('manual');
  };
  const setScore = (skill: 'listening' | 'reading', value: number) => {
    const l = skill === 'listening' ? value : listening, r = skill === 'reading' ? value : reading;
    props.changeSectionScores(String(l), String(r));
  };
  const setCount = (skill: 'listening' | 'reading', value: number) => {
    const next = { ...counts, [skill]: value };
    setCounts(next);
    props.changeSectionScores(String(scaledFromCount('listening', next.listening)), String(scaledFromCount('reading', next.reading)));
  };
  const switchMode = (next: 'score' | 'count') => {
    if (next === mode) return;
    if (next === 'count') {
      const c = { listening: countFromScaled('listening', listening), reading: countFromScaled('reading', reading) };
      setCounts(c);
    }
    setMode(next);
  };

  const err = props.scoreError ? <p role="alert" className="pl-err">{props.scoreError}</p> : null;
  const saveBtn = (label: string, tone: 'green' | 'violet' | 'blue') => (
    <footer className="pl-foot">
      {err}
      {props.duplicateNotice}
      {props.duplicateNotice
        ? <button type="submit" name="afterSave" value="duplicate" className={'pl-save pl-save--' + tone}>Vẫn lưu</button>
        : <button type="submit" name="afterSave" value="close" className={'pl-save pl-save--' + tone}>{label}</button>}
    </footer>
  );

  /* ---------- Vocabulary ---------- */
  if (sessionType === 'VOCAB') {
    const week = vocabWeek(loadVocabLog(), today);
    const maxBar = Math.max(30, ...week.map(day => day.count));
    const { edit, existing } = props.vocab;
    const dm = dayMonth(props.date);
    return (
      <div className="pl" key="vocab">
        <Header title={edit ? `Sửa ngày ${dm}` : 'Từ vựng hôm nay'} onClose={props.onClose} right={<DateChip date={props.date} setDate={props.vocab.onPick} today={today} />} />
        <div className="pl-body pl-center">
          <Soc state="idle" size={96} className="pl-soc" />
          {edit && <button type="button" className="pl-back" onClick={props.vocab.onBack}>‹ Hôm nay</button>}
          <p className="pl-mut">{props.date === today ? 'Hôm nay' : edit ? `Ngày ${dm}` : dayLabel(props.date, today)} bạn học được</p>
          <div className="pl-big-count">
            <button type="button" aria-label="Giảm số từ" onClick={() => props.setVocabCount(clamp(props.vocabCount - 1, 1, 10000))}>−</button>
            <input data-large-text type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Số từ đã học" value={String(props.vocabCount)}
              onFocus={event => event.currentTarget.select()}
              onChange={event => props.setVocabCount(clamp(Number(event.target.value.replace(/\D/g, '') || 0), 1, 10000))} />
            <button type="button" aria-label="Tăng số từ" onClick={() => props.setVocabCount(clamp(props.vocabCount + 1, 1, 10000))}>+</button>
          </div>
          <p className="pl-unit">từ mới</p>
          <div className="pl-chips pl-chips--c" role="group" aria-label="Chọn nhanh số từ">
            {VOCAB_CHIPS.map(n => <button key={n} type="button" aria-pressed={props.vocabCount === n} className={'pl-chip' + (props.vocabCount === n ? ' is-on' : '')} onClick={() => props.setVocabCount(n)}>{n}</button>)}
          </div>
          <div className="pl-week">
            <p className="pl-lab">7 NGÀY QUA · CHẠM ĐỂ SỬA</p>
            <div className="pl-bars">
              {week.map((day, index) => (
                <button key={day.date} type="button" className={'pl-bar' + (day.date === props.date ? ' is-on' : '')} aria-pressed={day.date === props.date}
                  aria-label={`Ngày ${dayMonth(day.date)}: ${day.count > 0 ? `${day.count} từ` : 'chưa có từ'}`}
                  onClick={() => props.vocab.onPick(day.date)}>
                  <i style={{ height: 4 + (day.count / maxBar) * 62 }} />
                  <small>{index === 6 ? 'Nay' : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(day.date + 'T00:00:00').getDay()]}</small>
                </button>
              ))}
            </div>
          </div>
          {edit && existing > 0 && (confirmDel
            ? (
              <div className="pl-del-ask" role="group" aria-label="Xác nhận xóa ngày">
                Xóa {existing} từ của ngày {dm}?
                <div>
                  <button type="button" className="is-danger" onClick={() => { setConfirmDel(false); props.vocab.onDelete(); }}>Xóa</button>
                  <button type="button" onClick={() => setConfirmDel(false)}>Giữ lại</button>
                </div>
              </div>
            )
            : <button type="button" className="pl-del" onClick={() => setConfirmDel(true)}>Xóa ngày này</button>)}
        </div>
        {saveBtn(edit ? `Lưu ngày ${dm}` : `Lưu ${props.vocabCount} từ`, 'green')}
      </div>
    );
  }

  /* ---------- Part practice ---------- */
  if (sessionType === 'PART_PRACTICE') {
    const row = props.practiceRows[0] ?? { part: 5 as PartNumber, correct: 0, total: 30 };
    const pct = percent(row.correct, row.total);
    const setRow = (patch: Partial<PracticePartResult>) => {
      const next = { ...row, ...patch };
      next.correct = clamp(next.correct, 0, next.total);
      props.setPracticeRows([next]);
    };
    return (
      <div className="pl" key="practice">
        <Header title="Ghi buổi luyện" onClose={props.onClose} right={<DateChip date={props.date} setDate={props.setDate} today={today} />} />
        <div className="pl-body">
          <p className="pl-lab">PART NÀO?</p>
          <div className="pl-parts" role="group" aria-label="Part đã luyện">
            {([1, 2, 3, 4, 5, 6, 7] as const).map(part => (
              <button key={part} type="button" aria-pressed={row.part === part} aria-label={`Part ${part}`}
                className={'pl-part' + (row.part === part ? ' is-on' : '')}
                onClick={() => props.setPracticeRows([{ part, correct: 0, total: partMax(part) }])}>
                <span>{part}<small>{part <= 4 ? 'nghe' : 'đọc'}</small></span>
              </button>
            ))}
          </div>
          <div className="pl-ring" role="img" aria-label={`${pct}% đúng`} style={{ background: `conic-gradient(#7c5ce0 0 ${pct}%, #ece6ff ${pct}% 100%)` }}>
            <span>{pct}%<small>đúng</small></span>
          </div>
          <Stepper title="Câu đúng" sub="trên tổng số câu" value={row.correct} min={0} max={row.total} label="Số câu đúng" onChange={value => setRow({ correct: value })} />
          <Stepper title="Tổng số câu" sub={`Part ${row.part} thường ${partMax(row.part)} câu`} value={row.total} min={1} max={200} label="Tổng số câu" onChange={value => setRow({ total: value })} />
          <Stepper title="Thời gian" sub="phút" value={Math.round(props.duration) || 0} min={1} max={1440} label="Thời gian (phút)" onChange={props.setDuration} />
          <p className="pl-note">Bấm giờ ở Tiệm bánh thì buổi luyện tự ghi, không cần vào đây.</p>
        </div>
        {saveBtn('Lưu buổi luyện', 'violet')}
      </div>
    );
  }

  /* ---------- Full test: step 1 ---------- */
  if (step === 'pick') {
    const chips = chipNames(props.testName, props.suggestions, recentTestNames(props.sessions));
    const yesterday = previousDay(today);
    const customDate = props.date !== today && props.date !== yesterday;
    const openOther = () => pickerRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')?.click();
    return (
      <div className="pl" key="pick">
        <Header title="Ghi điểm đề" right="1/2" onClose={props.onClose} />
        <div className="pl-body">
          <p className="pl-lab">ĐỀ NÀO?</p>
          <div className="pl-chips" role="group" aria-label="Đề">
            {chips.map(name => <button key={name} type="button" aria-pressed={name === props.testName} className={'pl-chip' + (name === props.testName ? ' is-on' : '')} onClick={() => props.setTestName(name)}>{name}</button>)}
            <button type="button" className="pl-chip" onClick={openOther}>🔍 Đề khác</button>
          </div>
          <div ref={pickerRef} className="pl-hidden-picker" aria-hidden="true">
            <TestNamePicker compact field required id="session-test-name" label="Tên đề" value={props.testName} onChange={props.setTestName} suggestions={props.suggestions} />
          </div>
          <p className="pl-lab pl-lab--gap">NGÀY LÀM</p>
          <div className="pl-chips" role="group" aria-label="Ngày làm">
            <button type="button" aria-pressed={props.date === today} className={'pl-chip' + (props.date === today ? ' is-on' : '')} onClick={() => props.setDate(today)}>Hôm nay</button>
            <button type="button" aria-pressed={props.date === yesterday} className={'pl-chip' + (props.date === yesterday ? ' is-on' : '')} onClick={() => props.setDate(yesterday)}>Hôm qua</button>
            <label className={'pl-chip' + (customDate ? ' is-on' : '')}>
              <span>📅 {customDate ? dayLabel(props.date, today) : 'Chọn ngày'}</span>
              <input type="date" required max={today} value={props.date} aria-label="Chọn ngày" onChange={event => event.target.value && props.setDate(event.target.value)} />
            </label>
          </div>
          <div className="pl-hero">
            <div className="pl-hero-art" aria-hidden="true"><Soc state="focus" size={120} /></div>
            <h3>Chụp trang kết quả</h3>
            <p>Sóc đọc điểm và các câu bạn sai.</p>
          </div>
          <label className={'pl-shoot' + (aiOn ? '' : ' is-off')}>
            <span><i aria-hidden="true">📷</i>{aiOn ? 'Chụp hoặc chọn ảnh' : 'Chưa dùng được lúc này'}</span>
            <input type="file" accept="image/*" multiple disabled={!aiOn} aria-label="Chụp màn kết quả"
              onChange={event => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                if (!files.length) return;
                setWrongFrom('pick'); props.setInitialFiles(files); setStep('wrong');
              }} />
          </label>
          <button type="button" className="pl-quiet" onClick={() => { setWrongFrom('pick'); setStep('wrong'); }}>✎ Tự chọn câu sai</button>
        </div>
      </div>
    );
  }

  /* ---------- Full test: wrong questions ---------- */
  if (step === 'wrong') {
    const fromManual = wrongFrom === 'manual';
    const markOnly = props.isEditing;
    return (
      <div className="pl" key="wrong">
        <Header title="Câu sai" onClose={props.onClose}
          right={!markOnly && !fromManual ? <button type="button" className="pl-link" onClick={goManual}>Sửa điểm ›</button> : undefined} />
        <div className="pl-body">
          <div className="pl-score-mini" aria-live="polite">
            <span>{props.testName || 'Đề'}</span>
            <b>{props.totalPreview ?? '—'}</b>
            <small>{props.wrongQuestions.length ? `${props.wrongQuestions.length} câu sai` : 'Chưa chọn câu sai'}</small>
          </div>
          <WrongQuestionGrid wrong={props.wrongQuestions} onChange={props.onWrong} onTiming={props.onTiming}
            onScores={props.onScores} onScoresPending={props.onScoresPending} scoreStore={props.scoreStore}
            numberDraft={props.numberDraft} onNumberDraft={props.onNumberDraft}
            appliedScore={props.scoreSource !== 'ESTIMATED' ? { listening: props.manualListening, reading: props.manualReading, total: props.manualTotal || (props.totalPreview ? String(props.totalPreview) : '') } : undefined}
            onRevertScore={props.onRevertScore} initialFiles={props.initialFiles} onInitialFilesHandled={() => props.setInitialFiles(undefined)} />
          {props.timingNotice}
        </div>
        {fromManual
          ? <footer className="pl-foot">{err}<button type="button" className="pl-save pl-save--green" onClick={() => setStep('manual')}>Xong</button></footer>
          : saveBtn(markOnly ? 'Lưu câu sai' : `Lưu điểm${props.totalPreview ? ' ' + props.totalPreview : ''}`, 'green')}
      </div>
    );
  }

  /* ---------- Full test: manual score ---------- */
  const isScore = mode === 'score';
  const timeLabel = props.duration > 0 ? `${Math.round(props.duration * 100) / 100} phút` : 'Chưa ghi';
  return (
    <div className="pl" key="manual">
      <Header title={props.testName || 'Ghi điểm đề'} onClose={props.onClose}
        right={props.isEditing ? undefined : <button type="button" className="pl-link" onClick={() => setStep('pick')}>‹ Bước 1</button>} />
      <div className="pl-body">
        <div className="pl-total" aria-live="polite">
          <small>TỔNG</small>
          <b>{total}</b>
          {delta !== null && <span className={'pl-delta' + (delta < 0 ? ' is-down' : '')}>{delta === 0 ? 'Bằng đề trước' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} so với đề trước`}</span>}
        </div>
        <div className="pl-seg" role="group" aria-label="Cách nhập">
          <button type="button" aria-pressed={isScore} onClick={() => switchMode('score')}>Điểm thang 495</button>
          <button type="button" aria-pressed={!isScore} onClick={() => switchMode('count')}>Số câu đúng</button>
        </div>
        <div className="pl-wheels">
          <WheelPicker label="Điểm Nghe" caption="🎧 Nghe" color="#1c8fe3" min={isScore ? 5 : 0} max={isScore ? 495 : 100} step={isScore ? 5 : 1}
            value={isScore ? clamp(listening, 5, 495) : counts.listening} onChange={value => (isScore ? setScore('listening', value) : setCount('listening', value))} />
          <WheelPicker label="Điểm Đọc" caption="📖 Đọc" color="#14b8a6" min={isScore ? 5 : 0} max={isScore ? 495 : 100} step={isScore ? 5 : 1}
            value={isScore ? clamp(reading, 5, 495) : counts.reading} onChange={value => (isScore ? setScore('reading', value) : setCount('reading', value))} />
        </div>
        <p className="pl-hint">{isScore ? 'Vuốt để chọn · bước 5 điểm' : `Vuốt để chọn số câu · Nghe ${listening}đ, Đọc ${reading}đ`}</p>
        <button type="button" className="pl-row pl-row--btn" onClick={() => { setWrongFrom('manual'); setStep('wrong'); }}>
          <div><b>Câu sai</b><small>{props.wrongQuestions.length ? `${props.wrongQuestions.length} câu đã chọn` : 'Thêm số câu để ôn trong Sổ tay'}</small></div>
          <span className="pl-act pl-act--pink">{props.wrongQuestions.length ? 'Sửa ›' : '+ Chọn câu ›'}</span>
        </button>
        <button type="button" className="pl-row pl-row--btn" onClick={() => setTimeOpen(true)}>
          <div><b>Thời gian làm</b><small>{timeLabel} · chia theo Part</small></div>
          <span className="pl-act">Sửa ›</span>
        </button>
      </div>
      {saveBtn(props.isEditing ? 'Lưu thay đổi' : `Lưu điểm ${total}`, 'green')}
      {timeOpen && (
        <PhoneSheet title="Thời gian làm" onClose={() => setTimeOpen(false)}>
          <Stepper title="Phút" sub="cả bài thi" value={Math.round(props.duration) || 0} min={1} max={1440} label="Thời gian làm (phút)" onChange={props.setDuration} />
          <button type="button" className="pl-row pl-row--btn" onClick={() => setPartTimeOpen(true)}>
            <div><b>Chia theo Part</b><small>Part 5 – 7, không bắt buộc</small></div><span className="pl-act">Mở ›</span>
          </button>
          <button type="button" className="pl-save pl-save--green pl-save--sheet" onClick={() => setTimeOpen(false)}>Xong</button>
        </PhoneSheet>
      )}
      <PartTimingModal isOpen={partTimeOpen} onClose={() => setPartTimeOpen(false)} value={props.partDurations} onChange={props.onPartDurationsChange} />
    </div>
  );
}
