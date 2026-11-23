import { useEffect, useMemo, useState } from 'react';
import { PhoneAvatarButton } from '@/app/components/phone';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { MistakeEntry, NavTabId, StudySession, SuggestedTask, UserProfile } from '@/shared/types';
import type { AdviceAction } from '../lib/attemptAdvice';
import { fullTests } from '../lib/journeyData';
import { JourneyScore } from './phone/JourneyScore';
import { JourneyParts } from './phone/JourneyParts';
import { JourneyTests } from './phone/JourneyTests';
import { TestSheet } from './phone/TestSheet';
import { PageTip } from '@/features/guide/PageTip';
import './phone/journeyPhone.css';

type Tab = 'score' | 'parts' | 'tests';

/**
 * Hành trình on phones (design/previews/mock-phone-journey.html, rows "Bản bớt chữ" and "Khi chạm").
 * Serves tabs 'history' and 'analytics'. Header carries PhoneAvatarButton; the shell provides the bottom nav.
 */
export interface JourneyPhoneProps {
  /** Same data and handlers JourneyPage (desktop) receives. */
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  profile: UserProfile;
  today: string;
  /** 'parts' when the active tab is 'analytics', otherwise 'score'. */
  initialTab: 'score' | 'parts' | 'tests';
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onEditSession: (session: StudySession) => void;
  onDeleteSession: (id: string) => void;
  onOpenSessionLogger: () => void;
  /** Sóc's advice: add a one-off task to Hôm nay. */
  onAddSuggestion: (task: Omit<SuggestedTask, 'addedDate' | 'doneDate'>) => void;
  /** Open this test's detail with the advice block in view (from the result screen). */
  openRequest?: { id: string; nonce: number; advice?: boolean } | null;
  /** Extras for the phone version. */
  bundle: DataBundle;
  activeTab: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}

export function JourneyPhone({ sessions, mistakes, profile, today, initialTab, onOpenNotebook, onPractice, onEditSession, onDeleteSession, onOpenSessionLogger, onAddSuggestion, openRequest }: JourneyPhoneProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(openRequest?.id ?? null);
  const [focusAdvice, setFocusAdvice] = useState(Boolean(openRequest) && openRequest?.advice !== false);
  useEffect(() => { if (openRequest) { setOpenId(openRequest.id); setFocusAdvice(openRequest.advice !== false); } }, [openRequest]);
  const openTest = (id: string | null) => { setFocusAdvice(false); setOpenId(id); };
  const startAdvice = (action: AdviceAction, name: string) => {
    setOpenId(null);
    if (action.kind === 'timer' && (action.part === 5 || action.part === 6 || action.part === 7)) onPractice(action.part);
    else onOpenNotebook(name, action.part ?? undefined);
  };
  const tests = useMemo(() => fullTests(sessions), [sessions]);
  const open = tests.find(s => s.id === openId) ?? null;
  const tabs: Array<[Tab, string]> = [['score', 'Điểm số'], ['parts', 'Từng Part'], ['tests', tests.length ? `Các đề ${tests.length}` : 'Các đề']];

  return (
    <div className={'rd jp is-' + tab}>
      <header className="jp-head">
        <h1>Hành trình điểm</h1>
        <PhoneAvatarButton />
      </header>
      <div className="jp-seg" role="tablist" aria-label="Hành trình điểm">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'score' && <JourneyScore sessions={sessions} profile={profile} today={today} onOpenTest={openTest} onLog={onOpenSessionLogger} />}
      {tab === 'parts' && <JourneyParts sessions={sessions} mistakes={mistakes} onOpenNotebook={onOpenNotebook} onPractice={onPractice} onOpenSessionLogger={onOpenSessionLogger} />}
      {tab === 'tests' && <JourneyTests sessions={sessions} onOpenTest={openTest} onOpenSessionLogger={onOpenSessionLogger} />}
      <PageTip id="journey" ready={tests.length > 0} />
      {open && (
        <TestSheet session={open} sessions={sessions} mistakes={mistakes} onClose={() => openTest(null)}
          onOpenNotebook={name => { setOpenId(null); onOpenNotebook(name); }}
          onEdit={s => { setOpenId(null); onEditSession(s); }}
          onDelete={s => { setOpenId(null); onDeleteSession(s.id); }}
          profile={profile} today={today} onAddTask={onAddSuggestion} focusAdvice={focusAdvice}
          onStartAdvice={action => startAdvice(action, open.testName)} />
      )}
    </div>
  );
}
