import { describe, expect, it, vi } from 'vitest';
import {
  extractClipboardImages,
  RECENT_WINDOW_MS,
  scanDirectoryFiles,
  screenshotFileKey,
  supportsClipboardImageRead,
  supportsDirectoryWatcher,
  type DirectoryHandleLike,
  type FileSystemHandleLike
} from './useScreenshotWatcher';

function makeFakeDir(entries: FileSystemHandleLike[]): DirectoryHandleLike {
  return {
    name: 'Screenshots',
    values: async function* () {
      for (const entry of entries) yield entry;
    }
  };
}

const fileEntry = (file: File): FileSystemHandleLike => ({
  kind: 'file',
  name: file.name,
  getFile: async () => file
});

describe('screenshot watcher helpers', () => {
  it('scans only recent non-empty image files within cutoff, skips seen/locked/old files, sorts newest first, and caps to 10', async () => {
    const now = 1_760_000_000_000;
    const cutoff = now - RECENT_WINDOW_MS;
    const newest = new File(['abc'], 'Screenshot 2.png', { type: 'image/png', lastModified: now - 5_000 });
    const olderRecent = new File(['abc'], 'Screenshot 1.jpg', { type: 'image/jpeg', lastModified: now - 30_000 });
    const alreadySeen = new File(['seen'], 'Screenshot 0.png', { type: 'image/png', lastModified: now - 10_000 });
    const tooOld = new File(['old'], 'Old.png', { type: 'image/png', lastModified: cutoff - 1_000 });
    const emptyFile = new File([], 'Empty.png', { type: 'image/png', lastModified: now - 1_000 });
    const nonImage = new File(['txt'], 'notes.txt', { type: 'text/plain', lastModified: now - 1_000 });
    const lockedEntry: FileSystemHandleLike = {
      kind: 'file',
      name: 'Locked.png',
      getFile: async () => { throw new Error('EBUSY'); }
    };
    const subDir: FileSystemHandleLike = { kind: 'directory', name: 'Subfolder' };

    const seen = new Set([screenshotFileKey(alreadySeen)]);
    const dir = makeFakeDir([
      fileEntry(olderRecent),
      fileEntry(tooOld),
      fileEntry(nonImage),
      fileEntry(emptyFile),
      fileEntry(alreadySeen),
      lockedEntry,
      subDir,
      fileEntry(newest)
    ]);

    const result = await scanDirectoryFiles(dir, cutoff, seen);
    expect(result.map(item => item.file.name)).toEqual(['Screenshot 2.png', 'Screenshot 1.jpg']);
    expect(result[0].key).toBe(screenshotFileKey(newest));

    // Caps to 10 newest images when folder has >10 recent shots.
    const many = Array.from({ length: 14 }, (_, idx) =>
      fileEntry(new File(['x'], `shot-${idx}.png`, { type: 'image/png', lastModified: now - (14 - idx) * 1000 }))
    );
    const capped = await scanDirectoryFiles(makeFakeDir(many), cutoff, new Set());
    expect(capped).toHaveLength(10);
    expect(capped[0].file.name).toBe('shot-13.png');
    expect(capped[9].file.name).toBe('shot-4.png');

    // Old filenames well past cutoff are reported via onOldName and skipped on subsequent silent scans without calling getFile().
    const ancient = new File(['old'], 'Ancient-2025.png', { type: 'image/png', lastModified: cutoff - 10 * 60_000 });
    const getAncient = vi.fn().mockResolvedValue(ancient);
    const oldNames = new Set<string>();
    await scanDirectoryFiles(
      makeFakeDir([{ kind: 'file', name: ancient.name, getFile: getAncient }]),
      cutoff,
      new Set(),
      () => true,
      { skipNames: oldNames, onOldName: name => oldNames.add(name) }
    );
    expect(getAncient).toHaveBeenCalledTimes(1);
    expect(oldNames.has(ancient.name)).toBe(true);

    await scanDirectoryFiles(
      makeFakeDir([{ kind: 'file', name: ancient.name, getFile: getAncient }]),
      cutoff,
      new Set(),
      () => true,
      { skipNames: oldNames }
    );
    expect(getAncient).toHaveBeenCalledTimes(1);
  });

  it('extracts image blobs from clipboard items and skips text-only items', async () => {
    const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
    const jpgBlob = new Blob(['jpg-bytes'], { type: 'image/jpeg' });
    const items = [
      { types: ['text/plain'], getType: vi.fn() },
      { types: ['text/html', 'image/png'], getType: vi.fn().mockResolvedValue(pngBlob) },
      { types: ['image/jpeg'], getType: vi.fn().mockResolvedValue(jpgBlob) }
    ];

    const files = await extractClipboardImages(items, 12345);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('clipboard-12345-1.png');
    expect(files[0].type).toBe('image/png');
    expect(files[1].name).toBe('clipboard-12345-2.jpg');
    expect(files[1].type).toBe('image/jpeg');
  });

  it('returns false safely for feature detection in non-browser environments', () => {
    expect(supportsDirectoryWatcher()).toBe(false);
    expect(supportsClipboardImageRead()).toBe(false);
  });
});
