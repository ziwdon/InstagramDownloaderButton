import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DownloadRequest } from '../../src/core/messages';

// Task 2.1 code review fix: `browser.downloads.onChanged` can fire for a
// download id before `handleDownload`'s own continuation gets to insert that
// id into its tracking Map (the `download()` promise resolving and the
// browser delivering an `onChanged` event for the same id are two
// independently-scheduled things — nothing orders one before the other).
// Mock `webextension-polyfill` so the test controls exactly when each side
// of that race "arrives": the mock `download()` call returns a promise we
// resolve by hand, and `onChanged.addListener` captures the callback so the
// test can invoke it directly, in whichever order a given case wants to
// exercise.
let onChangedListener: ((delta: unknown) => void) | undefined;
const downloadMock = vi.fn();

vi.mock('webextension-polyfill', () => ({
  default: {
    downloads: {
      download: (...args: unknown[]) => downloadMock(...args),
      onChanged: {
        addListener: (cb: (delta: unknown) => void) => {
          onChangedListener = cb;
        },
      },
    },
  },
}));

const { handleDownload, registerDownloadTracking } = await import('../../src/background/download');

function baseRequest(): DownloadRequest {
  return {
    kind: 'download',
    mediaURL: 'https://scontent.cdninstagram.com/a.jpg',
    accountName: 'someacct',
    mediaKind: 'image',
    postShortcode: 'ABC123',
  };
}

describe('download.ts — onChanged/tracking race (Task 2.1 review fix)', () => {
  beforeEach(() => {
    downloadMock.mockReset();
    onChangedListener = undefined;
    vi.restoreAllMocks();
    // Fresh listener each test, mirroring how the real background entrypoint
    // re-registers on every service-worker start.
    registerDownloadTracking();
  });

  it('logs the interrupted reason even when onChanged fires before download() resolves', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    let resolveDownload: (id: number) => void = () => undefined;
    downloadMock.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveDownload = resolve;
      }),
    );

    const handlePromise = handleDownload(baseRequest());

    // The onChanged event for this download's id arrives (browser-side)
    // before handleDownload's `.set()` line has had a chance to run — this
    // is the exact ordering the review flagged as unhandled.
    expect(onChangedListener).toBeDefined();
    onChangedListener!({
      id: 42,
      state: { current: 'interrupted' },
      error: { current: 'NETWORK_FAILED' },
    });

    // Only now does download() resolve with that same id, and
    // handleDownload's continuation runs.
    resolveDownload(42);
    await handlePromise;

    expect(errorSpy).toHaveBeenCalledWith(
      '[igdl]',
      'Download interrupted',
      expect.stringContaining('someacct'),
      'reason:',
      'NETWORK_FAILED',
      '(onChanged event arrived before tracking began)',
    );
  });

  it('does not leak or double-log when a late onChanged event repeats for an already-reconciled id', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    let resolveDownload: (id: number) => void = () => undefined;
    downloadMock.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveDownload = resolve;
      }),
    );

    const handlePromise = handleDownload(baseRequest());
    onChangedListener!({
      id: 7,
      state: { current: 'interrupted' },
      error: { current: 'FILE_FAILED' },
    });
    resolveDownload(7);
    await handlePromise;

    errorSpy.mockClear();

    // A stray repeat/late 'complete' event for the same id (e.g. a duplicate
    // browser-side delivery) must not throw and must not re-log — the id was
    // already reconciled and removed from every internal map.
    expect(() => onChangedListener!({ id: 7, state: { current: 'complete' } })).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still logs interrupted downloads on the normal (non-racy) ordering', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    downloadMock.mockResolvedValue(99);

    await handleDownload(baseRequest());
    onChangedListener!({
      id: 99,
      state: { current: 'interrupted' },
      error: { current: 'NETWORK_TIMEOUT' },
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[igdl]',
      'Download interrupted',
      expect.stringContaining('someacct'),
      'reason:',
      'NETWORK_TIMEOUT',
    );
  });
});
