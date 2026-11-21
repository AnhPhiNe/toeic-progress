import { useEffect, useState } from 'react';
import { ClipboardPaste, FolderSearch, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useScreenshotWatcher } from '@/features/mistakes/hooks/useScreenshotWatcher';
import './screenshot-bar.css';

interface Props {
  enabled: boolean;
  disabled?: boolean;
  /** Label appended to the add button, e.g. "vào khay" or "kết quả". */
  addVerb?: string;
  onAddFiles: (files: File[]) => void;
}

/**
 * PC Fast-Capture bar:
 * - Universal 1-click "Dán ảnh vừa chụp" (Clipboard API, zero folder permission required).
 * - Optional Chrome/Edge "Tự nhận nhiều ảnh chụp" (Zalo-style thumbnail strip with privacy checkboxes).
 */
export function ScreenshotSuggestBar({ enabled, disabled = false, addVerb = 'vào khay', onAddFiles }: Props) {
  const watcher = useScreenshotWatcher(enabled);
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Track manually unchecked items so newly discovered screenshots start checked without re-checking user-unticked ones.
  const [uncheckedKeys, setUncheckedKeys] = useState<Set<string>>(() => new Set());
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    const active = new Set(watcher.candidates.map(item => item.key));
    setUncheckedKeys(prev => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (active.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [watcher.candidates]);

  if (!enabled) return null;

  const toggleKey = (key: string) => {
    setUncheckedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selected = watcher.candidates.filter(item => !uncheckedKeys.has(item.key));

  const addSelected = () => {
    if (!selected.length || disabled) return;
    onAddFiles(selected.map(item => item.file));
    watcher.consumeKeys(selected.map(item => item.key));
  };

  const dismissAll = () => {
    watcher.consumeKeys(watcher.candidates.map(item => item.key));
  };

  const pasteClipboard = async () => {
    if (disabled || pasting) return;
    setPasting(true);
    try {
      const files = await watcher.readClipboardImages();
      if (files.length) onAddFiles(files);
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className="ssb">
      <div className="ssb-row">
        {watcher.clipboardSupported && (
          <button type="button" className="ssb-btn is-clip" disabled={disabled || pasting} onClick={() => void pasteClipboard()}>
            <ClipboardPaste className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{pasting ? 'Đang dán…' : 'Dán ảnh vừa chụp'}</span>
          </button>
        )}

        {watcher.status === 'unlinked' && (
          <button type="button" className="ssb-btn" disabled={disabled} aria-expanded={explainerOpen}
            onClick={() => setExplainerOpen(value => !value)}>
            <FolderSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Tự nhận nhiều ảnh chụp</span>
          </button>
        )}

        {watcher.status === 'needs-permission' && (
          <button type="button" className="ssb-btn is-reauth" disabled={disabled} onClick={() => void watcher.reauthorize()}>
            <FolderSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Bật lại theo dõi ({watcher.dirName || 'Screenshots'})</span>
          </button>
        )}

        {watcher.status === 'watching' && (
          <div className="ssb-watch" role="status">
            <span className="ssb-dot" aria-hidden="true" />
            <span>Đang theo dõi: <b>{watcher.dirName}</b></span>
            <button type="button" className="ssb-lnk" disabled={disabled || watcher.busy} onClick={() => void watcher.scanNow()} title="Quét ảnh chụp mới ngay">
              <RefreshCw className={'h-3 w-3' + (watcher.busy ? ' animate-spin' : '')} aria-hidden="true" />
              <span>Quét</span>
            </button>
            <button type="button" className="ssb-lnk" disabled={disabled} onClick={() => void watcher.linkDirectory()}>Đổi</button>
            <button type="button" className="ssb-lnk is-muted" disabled={disabled} onClick={() => void watcher.unlinkDirectory()}>Tắt</button>
          </div>
        )}
      </div>

      {watcher.status === 'unlinked' && explainerOpen && (
        <div className="ssb-info" role="region" aria-label="Hướng dẫn nối thư mục ảnh chụp">
          <div className="ssb-info-t">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <p>
              Chọn thư mục ảnh chụp (Windows: <b>Pictures/Screenshots</b> hoặc <b>OneDrive/Pictures/Screenshots</b>; macOS: <b>Desktop</b>).
              Web chỉ đọc cục bộ trên máy và luôn hiện ảnh để bạn tick chọn — không tự gửi ảnh nào.
            </p>
          </div>
          <div className="ssb-info-acts">
            <button type="button" className="ssb-go" disabled={disabled} onClick={() => { setExplainerOpen(false); void watcher.linkDirectory(); }}>
              Chọn thư mục Screenshots
            </button>
            <button type="button" className="ssb-lnk is-muted" onClick={() => setExplainerOpen(false)}>Để sau</button>
          </div>
        </div>
      )}

      {watcher.notice && (
        <p className="ssb-notice" role="status">
          <span>{watcher.notice}</span>
          <button type="button" aria-label="Đóng ghi chú" onClick={watcher.clearNotice}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </p>
      )}

      {watcher.candidates.length > 0 && (
        <div className="ssb-tray" role="region" aria-label="Ảnh vừa chụp được phát hiện">
          <div className="ssb-tray-head">
            <span><b>Tìm thấy {watcher.candidates.length} ảnh vừa chụp</b> · bỏ tick nếu dính ảnh cá nhân</span>
            <button type="button" className="ssb-lnk is-muted" onClick={dismissAll}>Bỏ qua</button>
          </div>
          <ul className="ssb-thumbs">
            {watcher.candidates.map(item => {
              const checked = !uncheckedKeys.has(item.key);
              return (
                <li key={item.key} className={'ssb-th' + (checked ? ' is-on' : '')}>
                  <button type="button" role="checkbox" aria-checked={checked} aria-label={`${checked ? 'Bỏ chọn' : 'Chọn'} ${item.name}`}
                    onClick={() => toggleKey(item.key)}>
                    <img src={item.url} alt={item.name} />
                    <span className="ssb-ck" aria-hidden="true">{checked ? '✓' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ssb-tray-foot">
            <button type="button" className="ssb-go" disabled={!selected.length || disabled} onClick={addSelected}>
              + Thêm {selected.length} ảnh {addVerb}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
