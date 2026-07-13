import browser from 'webextension-polyfill';
import type { DownloadRequest } from '../core/messages';
import { buildFilename } from './filename';
import { isDownloadableURL } from './url-validation';
import { logger } from '../core/logger';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

// Instagram CDN URLs 403 without a same-origin Referer on some hosts; Firefox
// MV3 (unlike Chrome) supports sending extra headers via downloads.download,
// so we can attach it up front instead of reacting to a failure after the
// fact (see registerDownloadTracking() below for why "after the fact" never
// worked here).
const REFERER_HEADERS = [{ name: 'Referer', value: 'https://www.instagram.com/' }];

// Download ids initiated by this extension, tracked from the moment
// `downloads.download()` resolves (i.e. the download is queued) until the
// download reaches a terminal state. Keyed by id, valued by filename purely
// to make the interrupted-download log line more useful.
//
// Lifecycle / leak analysis: an id is inserted exactly once, from the single
// call site in `handleDownload` below, right after `download()` resolves.
// It is removed in exactly two places in `registerDownloadTracking()`'s
// listener: when `state.current === 'complete'` and when
// `state.current === 'interrupted'`. Per the `downloads.onChanged` contract
// every download eventually reaches one of those two terminal states (a
// download that is merely paused or in_progress is neither), so every
// inserted id is eventually removed — the map cannot grow unbounded while
// the service worker instance stays alive.
const trackedDownloadIds = new Map<number, string>();

export async function handleDownload(req: DownloadRequest): Promise<void> {
  if (!isDownloadableURL(req.mediaURL)) {
    logger.error('Refusing to download unsupported URL scheme', req.mediaURL);
    throw new Error(`Unsupported download URL scheme: ${req.mediaURL}`);
  }

  const filename = buildFilename(req);

  let id: number;
  try {
    // `download()` resolves once the download is *queued*, not once it
    // completes — this promise settling successfully says nothing about
    // whether the file ever finishes downloading. Genuine failures at this
    // point (e.g. an invalid URL/filename rejected synchronously) surface
    // here; anything that goes wrong later (network error, CDN 403) instead
    // arrives via `downloads.onChanged`, handled by registerDownloadTracking().
    id = await browser.downloads.download(
      IS_FIREFOX
        ? { url: req.mediaURL, filename, headers: REFERER_HEADERS }
        : { url: req.mediaURL, filename },
    );
  } catch (err) {
    logger.error('Failed to queue download', req.mediaURL, err);
    throw err;
  }

  trackedDownloadIds.set(id, filename);
}

/** Registers the `downloads.onChanged` listener that watches ids this
 * extension initiated and logs interrupted downloads (e.g. the Referer-less
 * CDN 403 this module used to (ineffectively) retry around). Must be called
 * synchronously from the background entrypoint's top-level function so the
 * listener is re-attached every time the MV3 service worker starts —
 * including after it's been suspended and woken back up, which drops
 * `trackedDownloadIds`'s in-memory contents (see module doc comment). */
export function registerDownloadTracking(): void {
  browser.downloads.onChanged.addListener((delta) => {
    if (!trackedDownloadIds.has(delta.id)) return;

    if (delta.state?.current === 'interrupted') {
      logger.error(
        'Download interrupted',
        trackedDownloadIds.get(delta.id),
        'reason:',
        delta.error?.current,
      );
      trackedDownloadIds.delete(delta.id);
    } else if (delta.state?.current === 'complete') {
      trackedDownloadIds.delete(delta.id);
    }
  });
}
