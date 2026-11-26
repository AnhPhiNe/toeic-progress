import { getConcordanceByToeic } from '@/shared/domain/etsScoring';
import { socMoodSvg } from '@/shared/ui/soc/socSvg';

export interface ShareCardData {
  total: number;
  listening?: number;
  reading?: number;
  testName?: string;
  subtitle?: string;
  gear?: readonly string[];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadSvgImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function renderScoreCardBlob(data: ShareCardData): Promise<Blob | null> {
  const total = Math.max(0, Math.min(990, Math.round(data.total)));
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, '#fff4da');
  bg.addColorStop(0.55, '#fffaf1');
  bg.addColorStop(1, '#ffe8f0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);

  // Outer card surface
  roundedRect(ctx, 72, 76, 936, 1198, 56);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#f3e3be';
  ctx.stroke();

  // Brand pill
  roundedRect(ctx, 370, 136, 340, 54, 27);
  ctx.fillStyle = '#eaf8ec';
  ctx.fill();
  ctx.font = '900 28px Nunito, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#24894f';
  ctx.fillText('toeic progress', 540, 173);

  // Mascot Sóc
  const socSvg = socMoodSvg('proud', data.gear ?? []);
  const socImg = await loadSvgImage(socSvg);
  if (socImg) {
    ctx.drawImage(socImg, 405, 226, 270, 290);
  }

  // Optional test name & subtitle
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2f3a33';
  ctx.font = '900 40px Nunito, system-ui, sans-serif';
  if (data.testName) {
    ctx.fillText(data.testName.slice(0, 34), 540, 565);
  }
  if (data.subtitle) {
    ctx.font = '800 28px Nunito, system-ui, sans-serif';
    ctx.fillStyle = '#738077';
    ctx.fillText(data.subtitle.slice(0, 48), 540, data.testName ? 612 : 575);
  }

  // Big Score
  ctx.fillStyle = '#1f2922';
  ctx.font = '900 172px Nunito, system-ui, sans-serif';
  ctx.fillText(String(total), 540, 795);
  ctx.font = '800 34px Nunito, system-ui, sans-serif';
  ctx.fillStyle = '#7b877f';
  ctx.fillText('/ 990 ĐIỂM TOEIC', 540, 845);

  // Listening + Reading split pills
  if (data.listening !== undefined && data.reading !== undefined) {
    roundedRect(ctx, 196, 892, 326, 94, 26);
    ctx.fillStyle = '#f3efff';
    ctx.fill();
    ctx.font = '800 24px Nunito, system-ui, sans-serif';
    ctx.fillStyle = '#6c4fd6';
    ctx.fillText('NGHE', 359, 926);
    ctx.font = '900 40px Nunito, system-ui, sans-serif';
    ctx.fillText(String(data.listening), 359, 968);

    roundedRect(ctx, 558, 892, 326, 94, 26);
    ctx.fillStyle = '#e3f7f4';
    ctx.fill();
    ctx.font = '800 24px Nunito, system-ui, sans-serif';
    ctx.fillStyle = '#0d8a7c';
    ctx.fillText('ĐỌC', 721, 926);
    ctx.font = '900 40px Nunito, system-ui, sans-serif';
    ctx.fillText(String(data.reading), 721, 968);
  }

  // Equivalences row
  const lScore = data.listening ?? Math.min(495, Math.round(total / 2 / 5) * 5);
  const rScore = data.reading ?? Math.max(0, Math.min(495, total - lScore));
  const tier = getConcordanceByToeic(lScore, rScore);
  const badges = [
    tier?.cefr ? `CEFR ${tier.cefr}` : null,
    tier?.ielts ? `IELTS ${tier.ielts}` : null,
    tier?.vstep ? `VSTEP ${tier.vstep}` : null,
  ].filter((v): v is string => Boolean(v));

  if (badges.length) {
    const startX = 540 - ((badges.length - 1) * 230) / 2;
    badges.forEach((badge, i) => {
      const cx = startX + i * 230;
      roundedRect(ctx, cx - 102, 1044, 204, 62, 20);
      ctx.fillStyle = '#fff6df';
      ctx.fill();
      ctx.font = '900 26px Nunito, system-ui, sans-serif';
      ctx.fillStyle = '#996500';
      ctx.fillText(badge, cx, 1084);
    });
  }

  // Footer
  ctx.font = '800 24px Nunito, system-ui, sans-serif';
  ctx.fillStyle = '#8b958e';
  ctx.fillText('toeicprogress · Theo dõi luyện thi TOEIC cùng Sóc', 540, 1210);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function shareOrDownloadScoreCard(data: ShareCardData): Promise<'shared' | 'downloaded' | 'unavailable'> {
  const blob = await renderScoreCardBlob(data);
  if (!blob) return 'unavailable';
  const fileName = `toeic-progress-${Math.round(data.total)}.png`;
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null;

  if (file && typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `TOEIC ${data.total}/990 · TOEIC Progress` });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'downloaded';
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
