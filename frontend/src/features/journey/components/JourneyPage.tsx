import { useEffect, useMemo, useState } from 'react';
import type { MistakeEntry, StudySession, SuggestedTask, UserProfile } from '@/shared/types';
import type { AdviceAction } from '../lib/attemptAdvice';
import { fullTests } from '../lib/journeyData';
import { ScoreTab } from './ScoreTab';
import { PartsTab } from './PartsTab';
import { TestsTab } from './TestsTab';
import { TestDrawer } from './TestDrawer';
import { PageTip } from '@/features/guide/PageTip';
import './journey.css';

type Tab = 'score' | 'parts' | 'tests';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  profile: UserProfile;
  today: string;
  initialTab?: Tab;
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onEditSession: (session: StudySession) => void;
  onDeleteSession: (id: string) => void;
  onOpenSessionLogger: () => void;
  /** Sóc's advice: add a one-off task to Hôm nay. */
  onAddSuggestion: (task: Omit<SuggestedTask, 'addedDate' | 'doneDate'>) => void;
  /** Open this test's detail with the advice block in view (from the result screen). */
  openRequest?: { id: string; nonce: number; advice?: boolean } | null;
}

/** Hành trình điểm (design/previews/mock-journey-score3.html J1, mock-journey-parts4.html, mock-journey-tabs.html). */
export function JourneyPage({ sessions, mistakes, profile, today, initialTab = 'score', onOpenNotebook, onPractice, onEditSession, onDeleteSession, onOpenSessionLogger, onAddSuggestion, openRequest }: Props) {
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
  const tabs: Array<[Tab, string]> = [['score', 'Điểm số'], ['parts', 'Từng Part'], ['tests', 'Các đề']];

  return (
    <div className="rd jr-page">
      <div className="jr-top">
        <h1>Hành trình điểm</h1>
        <div className="jr-tabs" role="tablist" aria-label="Hành trình điểm">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}{id === 'tests' && tests.length > 0 && <em>{tests.length}</em>}
            </button>
          ))}
        </div>
      </div>
      {tab === 'score' && <ScoreTab sessions={sessions} profile={profile} today={today} onOpenTest={openTest} onShowTests={() => setTab('tests')} onLog={onOpenSessionLogger} />}
      {tab === 'parts' && <PartsTab sessions={sessions} mistakes={mistakes} onOpenNotebook={onOpenNotebook} onPractice={onPractice} onOpenSessionLogger={onOpenSessionLogger} />}
      {tab === 'tests' && <TestsTab sessions={sessions} onOpenTest={openTest} onOpenSessionLogger={onOpenSessionLogger} />}
      <PageTip id="journey" ready={tests.length > 0} />
      {open && (
        <TestDrawer session={open} sessions={sessions} mistakes={mistakes} target={profile.targetScore}
          onClose={() => openTest(null)} onOpenNotebook={name => { setOpenId(null); onOpenNotebook(name); }}
          onEdit={s => { setOpenId(null); onEditSession(s); }}
          onDelete={s => { setOpenId(null); onDeleteSession(s.id); }}
          profile={profile} today={today} onAddTask={onAddSuggestion} focusAdvice={focusAdvice}
          onStartAdvice={action => startAdvice(action, open.testName)} />
      )}
    </div>
  );
}
