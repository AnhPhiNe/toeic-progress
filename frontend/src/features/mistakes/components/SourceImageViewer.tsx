import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { sourceImageUrls } from '@/features/mistakes/services/sourceImages';

/** Signed links live only in memory; the synced card stores owner-scoped image hashes. */
export function SourceImageViewer({ ids, part }: { ids?: string[]; part: number | null }) {
  const owner = getActiveAccountId();
  const key = ids?.join(',') ?? '';
  const [loaded, setLoaded] = useState<{ owner: string | null; key: string; images: Array<{ id: string; url: string }> } | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoaded(null); setError(''); setIndex(0);
    void sourceImageUrls(key.split(',')).then(images => { if (!cancelled) setLoaded({ owner, key, images }); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chưa mở được ảnh nguồn.'); });
    return () => { cancelled = true; };
  }, [key, owner, attempt]);
  if (!key) return null;
  const images = loaded?.owner === owner && loaded.key === key ? loaded.images : [];
  const active = images[index];
  return <details className="text-sm text-slate-600 dark:text-slate-300">
    <summary className="cursor-pointer py-1 font-semibold">Ảnh nguồn ({ids!.length})</summary>
    {error ? <div role="status" className="mt-2 space-y-2"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-10 font-bold text-blue-600 dark:text-blue-400">Tải lại ảnh</button></div>
      : !active ? <p role="status" className="py-3">Đang tải ảnh nguồn…</p> : <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">{images.length > 1 && images.map((image, position) => <button key={image.id} type="button" aria-pressed={index === position} onClick={() => setIndex(position)}
            className={`min-h-10 rounded-lg border px-3 font-semibold ${index === position ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' : 'border-slate-300 dark:border-slate-700'}`}>Ảnh {position + 1}</button>)}</div>
          <a href={active.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">Mở ảnh lớn<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        </div>
        <img src={active.url} alt={`Ảnh nguồn Part ${part ?? 7} ${index + 1}`} onError={() => setError('Liên kết ảnh đã hết hạn hoặc ảnh chưa tải được. Bấm tải lại ảnh để tiếp tục.')}
          className="max-h-[480px] w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
      </div>}
  </details>;
}
