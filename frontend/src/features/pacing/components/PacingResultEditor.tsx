import { useRef, useState } from 'react';
import type { PacingRun } from '@/shared/types';
import { collectTestNames } from '@/shared/domain/testNames';
import { readDataBundle } from '@/shared/data/dataBundle';
import { linkedStudyVersion, updatePacingResult } from '@/features/pacing/services/pacingStorage';
import { runLabel, runSeconds } from '@/features/pacing/lib/pacingStats';
import { pacingError } from '@/features/pacing/lib/pacingErrors';
import { PacingResultModal } from './PacingDialogs';

/** Main history edits measured Reading results through the same grading form. */
export function PacingResultEditor({ run, owner, onClose, onSaved }: { run: PacingRun; owner: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(run.testName ?? ''), [correct, setCorrect] = useState(run.correctAnswers?.toString() ?? '');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [study] = useState(() => linkedStudyVersion(run));
  const [suggestions] = useState(() => { const data = readDataBundle(); return collectTestNames(data.sessions, data.mistakes); });
  const busy = useRef(false);
  const save = () => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { updatePacingResult(run, owner, name, correct, study); onSaved(); onClose(); }
    catch (reason) { setError(pacingError(reason, 'Chưa lưu được kết quả. Dữ liệu nhập vẫn được giữ.')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <PacingResultModal title={`Kết quả ${runLabel(run)}`} seconds={runSeconds(run) ?? 0} questions={run.totalQuestions ?? 0} name={name} correct={correct}
    suggestions={suggestions} error={error} saving={saving} onName={setName} onCorrect={setCorrect} onClose={onClose} onSave={save} />;
}
