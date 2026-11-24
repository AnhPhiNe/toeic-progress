import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ClipboardPaste, FolderSearch, ImageIcon, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useScreenshotWatcher } from '@/features/mistakes/hooks/useScreenshotWatcher';
import './screenshot-bar.css';

interface Props {
  enabled: boolean;
  disabled?: boolean;
  /** Label appended to the add button, e.g. "vào khay" or "kết quả". */
  addVerb?: string;
  /** Remaining slots in the caller's tray; extra selected shots stay on the bar instead of being discarded. */
  maxAdd?: number;
  onAddFiles: (files: File[]) => void;
  /** capture-calm: always-visible quick buttons (Dán · Tự nhận ảnh mới · Chọn ảnh) under the active zone. */
  quick?: boolean;
  onPick?: () => void;
  /** Ghi điểm: one "Cách khác" menu holds these items plus paste and the folder watcher. */
  menuItems?: Array<{ key: string; label: string; pressed?: boolean; disabled?: boolean; onClick: () => void }>;
  /** Horizontal alignment of the "Cách khác" dropdown relative to its trigger button. */
  menuAlign?: 'left' | 'right';
}

/**
 * PC Fast-Capture bar:
 * - Universal 1-click "Dán ảnh vừa chụp" (Clipboard API, zero folder permission required).
 * - Optional Chrome/Edge "Tự nhận nhiều ảnh chụp" (Zalo-style thumbnail strip with privacy checkboxes).
 */
export function ScreenshotSuggestBar({ enabled, disabled = false, addVerb = 'vào khay', maxAdd, onAddFiles, quick = false, onPick, menuItems, menuAlign = 'left' }: Props) {
  const watcher = useScreenshotWatcher(enabled);
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Track manually unchecked items so newly discovered screenshots start checked without re-checking user-unticked ones.
  const [uncheckedKeys, setUncheckedKeys] = useState<Set<string>>(() => new Set());
  const [pasting, setPasting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const menuId = useId();
  const menuBox = useRef<HTMLDivElement>(null);
  const menuPop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const place = () => {
      const rect = menuBox.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const width = Math.min(284, vw - 24);
      const spaceBelow = vh - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const rawLeft = menuAlign === 'right' ? rect.right - width : rect.left;
      const left = Math.max(12, Math.min(rawLeft, vw - width - 12));
      setMenuStyle(openUp
        ? { left, bottom: vh - rect.top + 6, width, maxHeight: Math.min(340, Math.max(160, spaceAbove - 6)) }
        : { left, top: rect.bottom + 6, width, maxHeight: Math.min(340, Math.max(160, spaceBelow - 6)) });
    };
    place();
    window.addEventListener('resize', place);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuPop.current?.contains(event.target)) return;
      place();
    };
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menuOpen, menuAlign]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuBox.current?.contains(target) && !menuPop.current?.contains(target)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menuOpen]);

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
  const limit = maxAdd === undefined ? selected.length : Math.max(0, maxAdd);
  const toAdd = selected.slice(0, limit);
  const overflowCount = Math.max(0, selected.length - toAdd.length);

  const addSelected = () => {
    if (!toAdd.length || disabled) return;
    onAddFiles(toAdd.map(item => item.file));
    // Only mark actually-added photos as seen; overflow photos stay on the bar for the next batch.
    watcher.consumeKeys(toAdd.map(item => item.key));
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

  const menuMode = Boolean(menuItems);
  const folderLabel = watcher.status === 'watching' ? 'Tắt theo dõi thư mục' : watcher.status === 'needs-permission' ? `Bật lại theo dõi (${watcher.dirName || 'Screenshots'})` : 'Tự nhận nhiều ảnh chụp';
  const folderRun = () => {
    if (watcher.status === 'watching') void watcher.unlinkDirectory();
    else if (watcher.status === 'needs-permission') void watcher.reauthorize();
    else setExplainerOpen(true);
  };
  const menuRow = menuItems && (
    <div className="ssb-row">
      <div className="ssb-more" ref={menuBox}>
        <button type="button" className={'ssb-more-b' + (menuOpen ? ' is-open' : '')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(value => !value)}>
          Cách khác <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {menuOpen && createPortal(
          <div ref={menuPop} id={menuId} data-modal-owner={menuId} className="rd ssb-menu" style={menuStyle} role="menu" aria-label="Cách khác">
            {menuItems.map(item => (
              <button key={item.key} type="button" role={item.pressed !== undefined ? 'menuitemcheckbox' : 'menuitem'} disabled={item.disabled} aria-checked={item.pressed === undefined ? undefined : item.pressed}
                className={'ssb-mi' + (item.pressed ? ' is-on' : '')} onClick={() => { setMenuOpen(false); item.onClick(); }}>
                <span>{item.label}</span>{item.pressed !== undefined && <span className="ssb-mi-sw" aria-hidden="true" />}
              </button>
            ))}
            <button type="button" role="menuitem" className="ssb-mi" disabled={disabled || pasting} onClick={() => { setMenuOpen(false); void pasteClipboard(); }}><span>Dán ảnh vừa chụp</span></button>
            {watcher.status !== 'unsupported' && (
              <button type="button" role="menuitem" className="ssb-mi" disabled={disabled} onClick={() => { setMenuOpen(false); folderRun(); }}><span>{folderLabel}</span></button>
            )}
          </div>,
          document.body
        )}
      </div>
      {watcher.status === 'watching' && <span className="ssb-watch" role="status"><span className="ssb-dot" aria-hidden="true" /><span>Đang theo dõi thư mục</span></span>}
    </div>
  );
  return (
    <div className={'ssb' + (quick ? ' is-quick' : '') + (menuMode ? ' is-menu' : '')}>
      {menuMode ? menuRow : <div className="ssb-row">
        {(watcher.clipboardSupported || quick) && (
          <button type="button" className="ssb-btn is-clip" disabled={disabled || pasting} onClick={() => void pasteClipboard()}>
            <ClipboardPaste className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{pasting ? 'Đang dán…' : 'Dán ảnh vừa chụp'}</span>
            {quick && !pasting && <><span aria-hidden="true">·</span><kbd>Ctrl+V</kbd></>}
          </button>
        )}

        {watcher.status === 'unlinked' && (
          <button type="button" className="ssb-btn" disabled={disabled} aria-expanded={explainerOpen}
            onClick={() => setExplainerOpen(value => !value)}>
            <FolderSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{quick ? 'Tự nhận ảnh mới' : 'Tự nhận nhiều ảnh chụp'}</span>
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
            {quick ? <span>Đang theo dõi thư mục</span> : <span>Đang theo dõi: <b>{watcher.dirName}</b></span>}
            <button type="button" className="ssb-lnk" disabled={disabled || watcher.busy} onClick={() => void watcher.scanNow()} title="Quét ảnh chụp mới ngay">
              <RefreshCw className={'h-3 w-3' + (watcher.busy ? ' animate-spin' : '')} aria-hidden="true" />
              <span>Quét</span>
            </button>
            <button type="button" className="ssb-lnk" disabled={disabled} onClick={() => void watcher.linkDirectory()}>Đổi</button>
            <button type="button" className="ssb-lnk is-muted" disabled={disabled} onClick={() => void watcher.unlinkDirectory()}>Tắt</button>
          </div>
        )}

        {quick && onPick && (
          <button type="button" className="ssb-btn" disabled={disabled} onClick={onPick}>
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Chọn ảnh</span>
          </button>
        )}
      </div>}

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
            <button type="button" className="ssb-go" disabled={!toAdd.length || disabled} onClick={addSelected}>
              {limit === 0
                ? 'Khay đã đầy · gửi mẻ này trước'
                : overflowCount > 0
                  ? `+ Thêm ${toAdd.length}/${selected.length} ảnh ${addVerb} (còn ${overflowCount} ảnh chờ)`
                  : `+ Thêm ${toAdd.length} ảnh ${addVerb}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
