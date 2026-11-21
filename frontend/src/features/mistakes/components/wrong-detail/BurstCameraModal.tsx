import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Flashlight, FlashlightOff, Images, Trash2, X } from 'lucide-react';
import { generateUUID } from '@/shared/domain/uuid';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { triggerHaptic } from '@/shared/lib/haptics';
import { checkPhotoClarity, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import './burst-camera.css';

interface Shot {
  id: string;
  file: File;
  url: string;
  clarity: ClarityResult | null;
}

interface Props {
  /** Maximum number of photos that can still be added to the caller's tray. */
  maxPhotos: number;
  title?: string;
  onComplete: (files: File[]) => void;
  onClose: () => void;
}

interface ImageCaptureCtor {
  new (track: MediaStreamTrack): { takePhoto: () => Promise<Blob> };
}
interface TrackCapabilitiesWithExtras extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}
interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  focusMode?: string;
}

function getImageCaptureCtor(): ImageCaptureCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  return typeof ctor === 'function' ? ctor : null;
}

/**
 * Full-screen 1-handed mobile burst camera:
 * - Captures multiple consecutive book pages without closing the camera.
 * - Prefers Android ImageCapture.takePhoto() for full sensor resolution, falls back to full-frame canvas JPEG 0.92.
 * - Surfaces an honest low-res / blur tip for devices (such as iOS Safari) where native Camera + Library is sharper.
 * - Always releases MediaStream tracks on close, tab switch, or unmount.
 */
export function BurstCameraModal({ maxPhotos, title = 'Chụp liên tiếp', onComplete, onClose }: Props) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [fallbackReason, setFallbackReason] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasImageCapture, setHasImageCapture] = useState(false);
  const [lowResStream, setLowResStream] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flashFx, setFlashFx] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [shotFeedback, setShotFeedback] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const aliveRef = useRef(true);
  const nativeCamRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch { /* ignore */ }
      });
    }
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* ignore */ }
    }
  }, []);

  const closeClean = useCallback(() => {
    stopStream();
    for (const shot of shotsRef.current) {
      try { URL.revokeObjectURL(shot.url); } catch { /* ignore */ }
    }
    onClose();
  }, [onClose, stopStream]);

  const dialogRef = useModalA11y(true, () => {
    if (previewId) { setPreviewId(null); return; }
    closeClean();
  });

  const startCamera = useCallback(async () => {
    stopStream();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('fallback');
      setFallbackReason('Trình duyệt hoặc kết nối hiện tại chưa hỗ trợ mở camera trực tiếp trong web.');
      return;
    }
    setStatus('loading');
    let stream: MediaStream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840, min: 1280 }, height: { ideal: 2160, min: 720 } },
          audio: false
        });
      } catch {
        // Some older phones reject min: 1280; retry cleanly with simple rear-camera preference.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
      }
    } catch (err) {
      if (!aliveRef.current) return;
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setStatus('fallback');
      setFallbackReason(denied
        ? 'Bạn chưa cấp quyền camera cho trình duyệt. Vẫn có thể dùng Camera máy hoặc Chọn nhiều ảnh từ thư viện.'
        : 'Chưa mở được camera sau trên thiết bị này. Hãy dùng Camera máy hoặc Chọn nhiều ảnh từ thư viện.');
      return;
    }
    if (!aliveRef.current) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0] ?? null;
    trackRef.current = track;
    setHasImageCapture(Boolean(track && getImageCaptureCtor()));

    if (track) {
      try {
        const caps = track.getCapabilities?.() as TrackCapabilitiesWithExtras | undefined;
        setTorchSupported(Boolean(caps?.torch));
        if (caps?.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as ExtendedConstraintSet] }).catch(() => {});
        }
      } catch { /* ignore unsupported capability probes */ }
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay handled by muted+playsInline */ }
      if (aliveRef.current) {
        const w = video.videoWidth || track?.getSettings?.().width || 0;
        setLowResStream(w > 0 && w < 1280 && !getImageCaptureCtor());
      }
    }
    if (aliveRef.current) setStatus('ready');
  }, [stopStream]);

  useEffect(() => {
    aliveRef.current = true;
    void startCamera();
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        stopStream();
        setTorchOn(false);
      } else if (aliveRef.current && status !== 'fallback') {
        void startCamera();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', onVis);
      stopStream();
      for (const shot of shotsRef.current) {
        try { URL.revokeObjectURL(shot.url); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as ExtendedConstraintSet] });
      setTorchOn(next);
    } catch { /* ignore */ }
  };

  const appendFiles = useCallback((picked: File[]) => {
    const images = picked.filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    const room = Math.max(0, maxPhotos - shotsRef.current.length);
    const accepted = images.slice(0, room);
    if (!accepted.length) return;
    const created: Shot[] = accepted.map(file => ({
      id: generateUUID(),
      file,
      url: URL.createObjectURL(file),
      clarity: null
    }));
    setShots(prev => [...prev, ...created]);
    const totalNow = shotsRef.current.length + created.length;
    setShotFeedback(`Đã chụp trang ${totalNow} — lật trang tiếp hoặc bấm Xong`);
    for (const shot of created) {
      void checkPhotoClarity(shot.url).then(result => {
        if (!aliveRef.current) return;
        setShots(prev => prev.map(item => item.id === shot.id ? { ...item, clarity: result } : item));
      });
    }
  }, [maxPhotos]);

  const shoot = async () => {
    if (capturing || status !== 'ready' || shots.length >= maxPhotos) return;
    setCapturing(true);
    triggerHaptic(10);
    setFlashFx(true);
    window.setTimeout(() => { if (aliveRef.current) setFlashFx(false); }, 110);
    try {
      let blob: Blob | null = null;
      const Ctor = getImageCaptureCtor();
      if (Ctor && trackRef.current) {
        try {
          blob = await new Ctor(trackRef.current).takePhoto();
        } catch {
          blob = null;
        }
      }
      if (!blob && videoRef.current && videoRef.current.videoWidth > 0) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        }
      }
      if (blob && aliveRef.current) {
        const ext = blob.type === 'image/png' ? 'png' : 'jpg';
        const file = new File([blob], `page-${shotsRef.current.length + 1}.${ext}`, { type: blob.type || 'image/jpeg' });
        appendFiles([file]);
      }
    } finally {
      if (aliveRef.current) setCapturing(false);
    }
  };

  const removeShot = (id: string) => {
    setShots(prev => {
      const target = prev.find(item => item.id === id);
      if (target) { try { URL.revokeObjectURL(target.url); } catch { /* ignore */ } }
      return prev.filter(item => item.id !== id);
    });
    if (previewId === id) setPreviewId(null);
  };

  const finish = () => {
    if (!shots.length) { closeClean(); return; }
    const resultFiles = shots.map(item => item.file);
    stopStream();
    for (const shot of shots) {
      try { URL.revokeObjectURL(shot.url); } catch { /* ignore */ }
    }
    onComplete(resultFiles);
  };

  const hasBlurryShot = shots.some(shot => shot.clarity?.problem);
  const showSharpnessHint = status === 'ready' && (lowResStream || (!hasImageCapture && hasBlurryShot));
  const previewShot = previewId ? shots.find(item => item.id === previewId) ?? null : null;
  const full = shots.length >= maxPhotos;

  return createPortal(
    <div ref={dialogRef} className="rd bc" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className="bc-top">
        <button type="button" className="bc-ic" aria-label="Đóng camera" onClick={closeClean}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="bc-title">
          <b>{title}</b>
          <small>{shots.length}/{maxPhotos} ảnh · giữ thẳng trang sách, đủ sáng</small>
        </div>
        {torchSupported && status === 'ready' ? (
          <button type="button" className={'bc-ic' + (torchOn ? ' is-on' : '')} aria-label={torchOn ? 'Tắt đèn flash' : 'Bật đèn flash'} aria-pressed={torchOn} onClick={() => void toggleTorch()}>
            {torchOn ? <Flashlight className="h-5 w-5" aria-hidden="true" /> : <FlashlightOff className="h-5 w-5" aria-hidden="true" />}
          </button>
        ) : (
          <button type="button" className="bc-native-pill" onClick={() => nativeCamRef.current?.click()}>Camera máy</button>
        )}
      </div>

      {status === 'fallback' ? (
        <div className="bc-fallback">
          <Camera className="h-12 w-12 text-pink-300" aria-hidden="true" />
          <h3>Không mở được camera trong web</h3>
          <p>{fallbackReason}</p>
          <div className="bc-fb-acts">
            <button type="button" className="bc-fb-btn is-main" onClick={() => galleryRef.current?.click()}>
              <Images className="h-5 w-5" aria-hidden="true" /> Chọn nhiều ảnh từ thư viện
            </button>
            <button type="button" className="bc-fb-btn" onClick={() => nativeCamRef.current?.click()}>
              <Camera className="h-5 w-5" aria-hidden="true" /> Mở Camera máy
            </button>
          </div>
          {shots.length > 0 && (
            <button type="button" className="bc-done-btn" onClick={finish}>Dùng {shots.length} ảnh đã chọn</button>
          )}
        </div>
      ) : (
        <div className="bc-stage">
          <video ref={videoRef} playsInline muted autoPlay className="bc-video" />
          {status === 'loading' && <div className="bc-loading" role="status">Đang mở camera sau…</div>}
          <span className="bc-corner is-tl" aria-hidden="true" />
          <span className="bc-corner is-tr" aria-hidden="true" />
          <span className="bc-corner is-bl" aria-hidden="true" />
          <span className="bc-corner is-br" aria-hidden="true" />
          {flashFx && <div className="bc-flash" aria-hidden="true" />}

          {showSharpnessHint && (
            <div className="bc-hint-bar" role="status">
              <span>Camera web hơi mờ trên máy này — chụp bằng Camera máy hoặc Thư viện sẽ nét hơn.</span>
              <button type="button" onClick={() => nativeCamRef.current?.click()}>Camera máy</button>
              <button type="button" onClick={() => galleryRef.current?.click()}>Thư viện</button>
            </div>
          )}

          {shotFeedback && !showSharpnessHint && (
            <div className="bc-pill-msg" role="status">{shotFeedback}</div>
          )}
        </div>
      )}

      {shots.length > 0 && (
        <ul className="bc-strip" aria-label="Ảnh vừa chụp">
          {shots.map((shot, idx) => (
            <li key={shot.id} className={'bc-th' + (shot.clarity?.problem ? ' is-warn' : '')}>
              <button type="button" className="bc-th-img" aria-label={`Xem lại ảnh ${idx + 1}`} onClick={() => setPreviewId(shot.id)}>
                <img src={shot.url} alt={`Trang ${idx + 1}`} />
              </button>
              <button type="button" className="bc-th-x" aria-label={`Xóa ảnh ${idx + 1}`} onClick={() => removeShot(shot.id)}>×</button>
              <span className={'bc-th-b' + (shot.clarity?.problem ? ' is-warn' : ' is-ok')} aria-hidden="true">
                {shot.clarity?.problem ? '!' : '✓'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {status !== 'fallback' && (
        <div className="bc-ctl">
          <button type="button" className="bc-side" disabled={full} onClick={() => galleryRef.current?.click()}>
            <Images className="h-5 w-5" aria-hidden="true" />
            <span>Thư viện</span>
          </button>
          <button
            type="button"
            className="bc-shutter"
            disabled={status !== 'ready' || capturing || full}
            aria-label={full ? `Đã đủ tối đa ${maxPhotos} ảnh` : 'Chụp một trang'}
            onClick={() => void shoot()}
          >
            <i />
          </button>
          <button type="button" className="bc-done" disabled={!shots.length} onClick={finish}>
            Xong{shots.length > 0 ? ` (${shots.length})` : ''}
          </button>
        </div>
      )}

      {previewShot && (
        <div className="bc-prev" role="dialog" aria-modal="true" aria-label="Xem trước ảnh vừa chụp" onClick={() => setPreviewId(null)}>
          <img src={previewShot.url} alt="Ảnh vừa chụp" onClick={e => e.stopPropagation()} />
          <div className="bc-prev-bar" onClick={e => e.stopPropagation()}>
            <button type="button" className="bc-prev-del" onClick={() => removeShot(previewShot.id)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Xóa chụp lại
            </button>
            <button type="button" className="bc-prev-ok" onClick={() => setPreviewId(null)}>Giữ ảnh này</button>
          </div>
        </div>
      )}

      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Mở camera hệ thống"
        onChange={e => { const picked = [...(e.target.files ?? [])]; e.target.value = ''; appendFiles(picked); }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Chọn nhiều ảnh từ thư viện"
        onChange={e => { const picked = [...(e.target.files ?? [])]; e.target.value = ''; appendFiles(picked); }}
      />
    </div>,
    document.body
  );
}
