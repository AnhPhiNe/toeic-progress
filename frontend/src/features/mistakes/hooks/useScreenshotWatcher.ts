import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * PC Fast-Capture watcher:
 * 1) Universal 1-click Clipboard image paste (`navigator.clipboard.read()`, called ONLY on explicit click).
 * 2) Optional opt-in File System Access API folder watcher (`showDirectoryPicker({ mode: 'read' })`) persisted in
 *    IndexedDB so Chrome/Edge users taking 5–10 Win+Shift+S screenshots on Study4/PDF get a Zalo-style thumbnail bar
 *    with per-photo privacy checkboxes when returning to this tab.
 */

export type WatcherStatus = 'unsupported' | 'unlinked' | 'needs-permission' | 'watching';

export interface ScreenshotCandidate {
  key: string;
  name: string;
  file: File;
  url: string;
  lastModified: number;
}

interface PermissionDescriptor { mode?: 'read' | 'readwrite' }
export interface DirectoryHandleLike {
  name: string;
  queryPermission?: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandleLike>;
}
export interface FileSystemHandleLike {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
}
interface FileSystemObserverLike {
  observe: (handle: DirectoryHandleLike, options?: { recursive?: boolean }) => Promise<void>;
  disconnect: () => void;
}
interface WindowWithPicker extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<DirectoryHandleLike>;
  FileSystemObserver?: new (callback: (records: unknown[]) => void) => FileSystemObserverLike;
}

const DB_NAME = 'toeic_screenshot_dir_v1';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'screenshots';
const MAX_CANDIDATES = 10;
/** Only surface screenshots taken within the last 3 minutes (never flood old personal screenshots). */
export const RECENT_WINDOW_MS = 3 * 60_000;
/** Files verified older than cutoff minus this margin are cached by name during silent auto-scans to avoid I/O. */
const OLD_CACHE_MARGIN_MS = 5 * 60_000;
/** Light foreground poll interval while the capture modal is open and visible (handles split-screen / Win+PrtSc). */
const VISIBLE_POLL_MS = 1500;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif|avif|heic|heif)$/i;

export const screenshotFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/** Pure directory scanner: filters recent image files within cutoff, skips seen keys & known-old names, sorts newest first, caps to MAX_CANDIDATES. */
export async function scanDirectoryFiles(
  handle: DirectoryHandleLike,
  cutoff: number,
  seen: ReadonlySet<string>,
  shouldContinue: () => boolean = () => true,
  options?: { skipNames?: ReadonlySet<string>; onOldName?: (name: string) => void }
): Promise<Array<{ key: string; file: File }>> {
  if (!handle.values) return [];
  const skipNames = options?.skipNames;
  const onOldName = options?.onOldName;
  const oldThreshold = cutoff - OLD_CACHE_MARGIN_MS;
  const found: Array<{ key: string; file: File }> = [];
  for await (const entry of handle.values()) {
    if (!shouldContinue()) return [];
    if (entry.kind !== 'file' || !entry.getFile || !IMAGE_EXT.test(entry.name)) continue;
    if (skipNames?.has(entry.name)) continue;
    try {
      const file = await entry.getFile();
      if (!file.size) continue;
      if (file.lastModified < cutoff) {
        if (file.lastModified < oldThreshold) onOldName?.(entry.name);
        continue;
      }
      const key = screenshotFileKey(file);
      if (seen.has(key)) continue;
      found.push({ key, file });
    } catch { /* skip unreadable transient lock while OS is still flushing PNG */ }
  }
  found.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return found.slice(0, MAX_CANDIDATES);
}

/** Pure clipboard image extractor used on explicit button click. */
export async function extractClipboardImages(
  items: Iterable<{ types: readonly string[]; getType: (type: string) => Promise<Blob> }>,
  now = Date.now()
): Promise<File[]> {
  const extracted: File[] = [];
  let index = 0;
  for (const item of items) {
    const imageType = item.types.find(type => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const ext = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    extracted.push(new File([blob], `clipboard-${now}-${++index}.${ext}`, { type: imageType }));
  }
  return extracted;
}

export function supportsDirectoryWatcher(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithPicker).showDirectoryPicker === 'function';
}

export function supportsClipboardImageRead(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.clipboard) && typeof navigator.clipboard.read === 'function';
}

function openHandleDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadSavedHandle(): Promise<DirectoryHandleLike | null> {
  const db = await openHandleDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => { db.close(); resolve((req.result as DirectoryHandleLike | undefined) ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function saveHandle(handle: DirectoryHandleLike): Promise<void> {
  const db = await openHandleDb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function clearSavedHandle(): Promise<void> {
  const db = await openHandleDb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch {
      db.close();
      resolve();
    }
  });
}

/** Shared across mounts in the same browser session so already-added or dismissed shots never reappear. */
const seenKeys = new Set<string>();

export function __resetScreenshotWatcherSeenForTests() {
  seenKeys.clear();
}

export function useScreenshotWatcher(enabled: boolean) {
  const supported = supportsDirectoryWatcher();
  const [status, setStatus] = useState<WatcherStatus>(() => (supported ? 'unlinked' : 'unsupported'));
  const [dirName, setDirName] = useState('');
  const [candidates, setCandidates] = useState<ScreenshotCandidate[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const handleRef = useRef<DirectoryHandleLike | null>(null);
  const candidatesRef = useRef<ScreenshotCandidate[]>([]);
  candidatesRef.current = candidates;
  const aliveRef = useRef(true);
  const scanningRef = useRef(false);
  const pendingScanRef = useRef(false);
  const oldNamesRef = useRef(new Set<string>());
  // Session floor: only inspect screenshots taken shortly before or during this capture session.
  const floorRef = useRef(Date.now() - RECENT_WINDOW_MS);

  const revokeAll = useCallback((list: readonly ScreenshotCandidate[]) => {
    for (const item of list) {
      try { URL.revokeObjectURL(item.url); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      revokeAll(candidatesRef.current);
    };
  }, [revokeAll]);

  const scanHandle = useCallback(async (handle: DirectoryHandleLike, quiet = true) => {
    if (!handle.values) return;
    if (scanningRef.current) {
      pendingScanRef.current = true;
      return;
    }
    scanningRef.current = true;
    if (!quiet) {
      oldNamesRef.current.clear();
      setBusy(true);
    }
    try {
      const cutoff = Math.max(floorRef.current, Date.now() - RECENT_WINDOW_MS);
      const top = await scanDirectoryFiles(
        handle,
        cutoff,
        seenKeys,
        () => aliveRef.current,
        quiet ? { skipNames: oldNamesRef.current, onOldName: name => oldNamesRef.current.add(name) } : { onOldName: name => oldNamesRef.current.add(name) }
      );
      if (!aliveRef.current) return;
      const prevKeys = candidatesRef.current.map(item => item.key).join('|');
      const nextKeys = top.map(item => item.key).join('|');
      if (prevKeys !== nextKeys) {
        const existingByKey = new Map(candidatesRef.current.map(item => [item.key, item]));
        const next: ScreenshotCandidate[] = top.map(({ key, file }) => {
          const kept = existingByKey.get(key);
          if (kept) {
            existingByKey.delete(key);
            return kept;
          }
          return { key, name: file.name, file, url: URL.createObjectURL(file), lastModified: file.lastModified };
        });
        // Release object URLs for entries no longer in candidates.
        revokeAll([...existingByKey.values()]);
        setCandidates(next);
      }
      if (!quiet) {
        setNotice(top.length ? '' : 'Chưa thấy ảnh chụp mới trong 3 phút gần đây.');
      } else if (top.length) {
        setNotice('');
      }
    } catch {
      if (aliveRef.current && !quiet) setNotice('Không đọc được thư mục ảnh chụp. Hãy chọn lại thư mục.');
    } finally {
      scanningRef.current = false;
      if (aliveRef.current && !quiet) setBusy(false);
      if (aliveRef.current && pendingScanRef.current && handleRef.current) {
        pendingScanRef.current = false;
        void scanHandle(handleRef.current, true);
      }
    }
  }, [revokeAll]);

  // Restore persisted folder handle on mount when enabled.
  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;
    void loadSavedHandle().then(async saved => {
      if (cancelled || !saved) return;
      handleRef.current = saved;
      oldNamesRef.current.clear();
      setDirName(saved.name || 'Screenshots');
      const perm = await saved.queryPermission?.({ mode: 'read' }).catch(() => 'prompt' as PermissionState);
      if (cancelled) return;
      if (perm === 'granted') {
        setStatus('watching');
        void scanHandle(saved, true);
      } else {
        setStatus('needs-permission');
      }
    });
    return () => { cancelled = true; };
  }, [enabled, supported, scanHandle]);

  // Fast detection while modal is open:
  // 1) Native FileSystemObserver (Chrome/Edge 133+) for near-instant OS events.
  // 2) Staggered focus/visibility rescans (0ms, 600ms, 1600ms) to catch Windows Snipping Tool / OneDrive disk flush lag.
  // 3) Lightweight visible-only foreground poll (1.5s, skipping cached old filenames) for split-screen & Win+PrintScreen.
  useEffect(() => {
    if (!enabled || status !== 'watching') return;
    const timers = new Set<number>();
    const scheduleRescan = (delayMs: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (aliveRef.current && handleRef.current && document.visibilityState === 'visible') {
          void scanHandle(handleRef.current, true);
        }
      }, delayMs);
      timers.add(id);
    };
    const triggerBurstScan = () => {
      if (!handleRef.current) return;
      void scanHandle(handleRef.current, true);
      scheduleRescan(600);
      scheduleRescan(1600);
    };
    const onFocus = () => triggerBurstScan();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerBurstScan();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    let observer: FileSystemObserverLike | null = null;
    const ObserverCtor = (window as WindowWithPicker).FileSystemObserver;
    if (ObserverCtor && handleRef.current) {
      try {
        observer = new ObserverCtor(() => { scheduleRescan(250); });
        void observer.observe(handleRef.current).catch(() => { observer?.disconnect(); observer = null; });
      } catch {
        observer = null;
      }
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && handleRef.current) {
        void scanHandle(handleRef.current, true);
      }
    }, VISIBLE_POLL_MS);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(pollId);
      timers.forEach(id => window.clearTimeout(id));
      timers.clear();
      try { observer?.disconnect(); } catch { /* ignore */ }
    };
  }, [enabled, status, scanHandle]);

  const linkDirectory = useCallback(async () => {
    const picker = (window as WindowWithPicker).showDirectoryPicker;
    if (!picker) return;
    setNotice('');
    try {
      const handle = await picker({ id: 'toeic-screenshots', mode: 'read', startIn: 'pictures' });
      handleRef.current = handle;
      oldNamesRef.current.clear();
      setDirName(handle.name || 'Screenshots');
      setStatus('watching');
      await saveHandle(handle);
      await scanHandle(handle, false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setNotice('Chưa nối được thư mục ảnh chụp. Bạn vẫn có thể bấm Ctrl+V hoặc Dán ảnh vừa chụp.');
    }
  }, [scanHandle]);

  const reauthorize = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) { await linkDirectory(); return; }
    setNotice('');
    try {
      const perm = await handle.requestPermission?.({ mode: 'read' });
      if (perm === 'granted') {
        setStatus('watching');
        await scanHandle(handle, false);
      } else {
        setNotice('Trình duyệt chưa được cấp quyền đọc thư mục.');
      }
    } catch {
      await linkDirectory();
    }
  }, [linkDirectory, scanHandle]);

  const unlinkDirectory = useCallback(async () => {
    handleRef.current = null;
    revokeAll(candidatesRef.current);
    setCandidates([]);
    setDirName('');
    setNotice('');
    setStatus(supported ? 'unlinked' : 'unsupported');
    await clearSavedHandle();
  }, [revokeAll, supported]);

  const scanNow = useCallback(async () => {
    if (!handleRef.current) return;
    await scanHandle(handleRef.current, false);
  }, [scanHandle]);

  const consumeKeys = useCallback((keys: readonly string[]) => {
    const drop = new Set(keys);
    keys.forEach(key => seenKeys.add(key));
    setCandidates(prev => {
      revokeAll(prev.filter(item => drop.has(item.key)));
      return prev.filter(item => !drop.has(item.key));
    });
  }, [revokeAll]);

  const readClipboardImages = useCallback(async (): Promise<File[]> => {
    setNotice('');
    if (!supportsClipboardImageRead()) {
      setNotice('Trình duyệt không hỗ trợ nút dán nhanh — hãy bấm Ctrl+V trực tiếp.');
      return [];
    }
    try {
      const items = await navigator.clipboard.read();
      const extracted = await extractClipboardImages(items);
      if (!extracted.length) {
        setNotice('Chưa thấy ảnh trong bộ nhớ tạm. Hãy chụp màn hình (Win+Shift+S / Cmd+Shift+4) rồi bấm lại.');
      }
      return extracted;
    } catch {
      setNotice('Chưa đọc được bộ nhớ tạm — bạn có thể bấm Ctrl+V trực tiếp.');
      return [];
    }
  }, []);

  return {
    status,
    dirName,
    candidates,
    notice,
    busy,
    clipboardSupported: supportsClipboardImageRead(),
    linkDirectory,
    reauthorize,
    unlinkDirectory,
    scanNow,
    consumeKeys,
    readClipboardImages,
    clearNotice: () => setNotice('')
  };
}
