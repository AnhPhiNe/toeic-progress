import { useState } from 'react';
import type { ConfirmedResultTiming, ResultImageTiming } from '@/shared/types';
import { formatElapsed, hasResultTiming, parseElapsed } from '@/shared/domain/resultTiming';

type TimingKey = 'totalSeconds' | 'listeningSeconds' | 'readingSeconds' | keyof ResultImageTiming['parts'];
const labels: [TimingKey, string][] = [['totalSeconds', 'Tổng thời gian'], ['listeningSeconds', 'Listening'], ['readingSeconds', 'Reading'],
  ...Array.from({ length: 7 }, (_, index) => [`part${index + 1}` as keyof ResultImageTiming['parts'], `Part ${index + 1}`] as [TimingKey, string])];
export interface TimingCandidate { timing: ResultImageTiming; fields: Partial<Record<TimingKey, string>>; edited: boolean }
/**
 * The candidate keeps only the image-timing fields. Reopening an already confirmed timing passes a ConfirmedResultTiming,
 * whose extra `source` key used to ride along and fail the strict draft schema, so the form draft was never saved.
 */
export function timingCandidate(input: ResultImageTiming): TimingCandidate {
  const { totalSeconds, listeningSeconds, readingSeconds, parts } = input;
  const timing: ResultImageTiming = { totalSeconds, listeningSeconds, readingSeconds,
    parts: { part1: parts.part1, part2: parts.part2, part3: parts.part3, part4: parts.part4, part5: parts.part5, part6: parts.part6, part7: parts.part7 } };
  return { timing, fields: Object.fromEntries(labels.map(([key]) => { const value = key.startsWith('part') ? timing.parts[key as keyof ResultImageTiming['parts']] : timing[key as 'totalSeconds']; return [key, value === null ? '' : formatElapsed(value)]; })), edited: false };
}

export function ResultTimingReview({ candidate, onChange, onApply, onDiscard }: { candidate: TimingCandidate; onChange: (value: TimingCandidate) => void; onApply: (value: ConfirmedResultTiming) => void; onDiscard: () => void }) {
  const [error, setError] = useState('');
  const apply = () => {
    const next: ResultImageTiming = { totalSeconds: null, listeningSeconds: null, readingSeconds: null,
      parts: { part1: null, part2: null, part3: null, part4: null, part5: null, part6: null, part7: null } };
    for (const [key, label] of labels) {
      const value = parseElapsed(candidate.fields[key] ?? '');
      if (value === 'invalid') { setError(`${label}: nhập phút:giây hoặc giờ:phút:giây, tối đa 24 giờ.`); return; }
      if (key.startsWith('part')) next.parts[key as keyof ResultImageTiming['parts']] = value;
      else next[key as 'totalSeconds'] = value;
    }
    if (!hasResultTiming(next)) { setError('Điền thời gian đã làm, hoặc chọn Bỏ qua thời gian.'); return; }
    if (next.totalSeconds === 0) { setError('Tổng thời gian làm cần lớn hơn 0. Xóa ô này nếu ảnh không có tổng thời gian.'); return; }
    onApply({ ...next, source: 'IMAGE_CONFIRMED' });
  };
  return <section aria-label="Kiểm tra thời gian từ ảnh" className="mt-3 space-y-3 rounded-xl border border-[var(--rd-gold)] bg-[var(--rd-gold-l)] p-3">
    <h3 className="text-sm font-extrabold">Thời gian từ ảnh · cần kiểm tra</h3>
    <p className="text-xs leading-5 text-[#5c675f]">Chỉ xác nhận thời gian đã làm. Không dùng thời gian còn lại hoặc giới hạn bài thi. Để trống phần ảnh không hiển thị.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{labels.filter(([key], index) => index < 3 || candidate.timing.parts[key as keyof ResultImageTiming['parts']] !== null).map(([key, label]) => <label key={key} className="min-w-0 text-xs font-semibold">{label}<input aria-label={`Thời gian từ ảnh: ${label}`} type="text" inputMode="text" placeholder="phút:giây" value={candidate.fields[key] ?? ''}
      onChange={event => { onChange({ ...candidate, edited: true, fields: { ...candidate.fields, [key]: event.target.value } }); setError(''); }}
      className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--rd-line)] bg-white px-2 text-sm tabular-nums text-[var(--rd-ink)]" /></label>)}</div>
    {error && <p role="alert" className="text-xs text-[var(--rd-pink-d)]">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" onClick={apply} className="min-h-11 rounded-lg bg-[var(--rd-ink)] px-3 text-xs font-bold text-white">Áp dụng thời gian từ ảnh</button>
      <button type="button" onClick={onDiscard} className="min-h-11 px-2 text-xs font-bold underline">Bỏ qua thời gian</button></div>
  </section>;
}
