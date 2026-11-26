import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { ShareCardData } from '@/shared/lib/shareCard';

interface Props {
  data: ShareCardData;
  className?: string;
  label?: string;
}

export function ShareCardButton({ data, className = '', label = 'Chia sẻ ảnh điểm' }: Props) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');

  const handleClick = async () => {
    if (state === 'busy') return;
    setState('busy');
    try {
      const { shareOrDownloadScoreCard } = await import('@/shared/lib/shareCard');
      await shareOrDownloadScoreCard(data);
      setState('done');
      window.setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('idle');
    }
  };

  return (
    <button type="button" onClick={() => void handleClick()} disabled={state === 'busy'} className={className}>
      <Share2 size={16} aria-hidden="true" />
      <span>{state === 'busy' ? 'Đang tạo ảnh…' : state === 'done' ? 'Đã tạo ảnh ✓' : label}</span>
    </button>
  );
}
