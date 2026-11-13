import { useMemo, useState } from 'react';
import type { MistakeEntry, StudySession, UserProfile } from '@/shared/types';
import { fullTests } from '../lib/journeyData';
import { ScoreTab } from './ScoreTab';
import { PartsTab } from './PartsTab';
import { TestsTab } from './TestsTab';
import { TestDrawer } from './TestDrawer';
import './journey.css';

type Tab = 'score' | 'parts' | 'tests';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  profile: UserProfile;
  today: string;
  initialTab?: Tab;
  onOpenNotebook: (testName: string) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onEditSession: (session: StudySession) => void;
  onDeleteSession: (id: string) => void;
  onOpenSessionLogger: () => void;
}

/** Hành trình điểm (design/previews/mock-journey-score2.html + mock-journey-tabs.html). */
export function JourneyPage({ sessions, mistakes, profile, today, initialTab = 'score', onOpenNotebook, onPractice, onEditSession, onDeleteSession, onOpenSessionLogger }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(null);
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
      {tab === 'score' && <ScoreTab sessions={sessions} profile={profile} today={today} onOpenTest={setOpenId} onShowTests={() => setTab('tests')} />}
      {tab === 'parts' && <PartsTab sessions={sessions} onOpenNotebook={onOpenNotebook} onPractice={onPractice} onOpenSessionLogger={onOpenSessionLogger} />}
      {tab === 'tests' && <TestsTab sessions={sessions} onOpenTest={setOpenId} onOpenSessionLogger={onOpenSessionLogger} />}
      {open && (
        <TestDrawer session={open} sessions={sessions} mistakes={mistakes} target={profile.targetScore}
          onClose={() => setOpenId(null)} onOpenNotebook={name => { setOpenId(null); onOpenNotebook(name); }}
          onEdit={s => { setOpenId(null); onEditSession(s); }}
          onDelete={s => { setOpenId(null); onDeleteSession(s.id); }} />
      )}
    </div>
  );
}
