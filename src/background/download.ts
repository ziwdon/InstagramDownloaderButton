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
// call site in `handleDownload` below, right after `download()` resolves. It
// is removed in three places: the two terminal branches in
// `registerDownloadTracking()`'s listener (`state.current === 'complete'`
// and `state.current === 'interrupted'`), plus the early-terminal-event
// reconciliation in `handleDownload` itself (see `earlyTerminalEvents` below)
// for the case where the terminal event actually arrived — and was recorded
// — before this map even had the entry to remove. Per the
// `downloads.onChanged` contract every download eventually reaches one of
// those two terminal states (a download that is merely paused or
// in_progress is neither), so every inserted id is eventually removed via
// one of these three paths — the map cannot grow unbounded while the
// service worker instance stays alive.
const trackedDownloadIds = new Map<number, string>();

// Terminal `downloads.onChanged` events for an id that is not (yet) in
// `trackedDownloadIds`. This closes a real race: `id` is only known, and
// only inserted into `trackedDownloadIds`, in the JS continuation after the
// `download()` promise resolves — but nothing in the WebExtensions API
// guarantees that continuation runs before the browser's own download
// machinery delivers an `onChanged` event for that same id (a download can
// reach 'interrupted' near-instantly, e.g. an immediate CDN rejection).
// Without this buffer, an event that wins that race would be silently
// dropped (id not yet tracked) and the subsequent `.set()` would insert an
// entry whose one-and-only terminal transition already fired and will never
// fire again — permanently orphaning it.
//
// Deliberately bounded rather than a general event log: `onChanged` fires
// for *every* download in the browser, not just ours, so unrelated
// downloads (a user manually saving a file elsewhere) land here too whenever
// they finish before we happen to have an entry for their id — which for
// this extension's own downloads is reconciled and removed within the same
// microtask/millisecond window `download()` resolves in, well before the cap
// below could plausibly be reached by unrelated traffic. If the cap is hit,
// the oldest entry is evicted; the only cost of eviction is losing the
// (best-effort, debug-only) "interrupted" log line for that one race — no
// leak results either way, since eviction removes the entry rather than
// leaving it around.
const earlyTerminalEvents = new Map<
  number,
  { state: 'interrupted' | 'complete'; error: string | undefined }
>();
const MAX_EARLY_TERMINAL_EVENTS = 50;

function recordEarlyTerminalEvent(
  id: number,
  state: 'interrupted' | 'complete',
  error: string | undefined,
): void {
  if (!earlyTerminalEvents.has(id) && earlyTerminalEvents.size >= MAX_EARLY_TERMINAL_EVENTS) {
    const oldestId = earlyTerminalEvents.keys().next().value;
    if (oldestId !== undefined) earlyTerminalEvents.delete(oldestId);
  }
  earlyTerminalEvents.set(id, { state, error });
}

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

  // Reconcile against an onChanged event that may have already arrived for
  // this id before the line above ran (see earlyTerminalEvents doc comment).
  const early = earlyTerminalEvents.get(id);
  if (early) {
    earlyTerminalEvents.delete(id);
    if (early.state === 'interrupted') {
      logger.error(
        'Download interrupted',
        filename,
        'reason:',
        early.error,
        '(onChanged event arrived before tracking began)',
      );
    }
    trackedDownloadIds.delete(id);
  }
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
    const state = delta.state?.current;

    if (!trackedDownloadIds.has(delta.id)) {
      // Not tracked (yet). Record terminal states in the bounded buffer so a
      // `.set()` call that hasn't run yet can still reconcile against this
      // event instead of it being silently dropped (see earlyTerminalEvents
      // doc comment for why this event can legitimately arrive first).
      if (state === 'interrupted' || state === 'complete') {
        recordEarlyTerminalEvent(delta.id, state, delta.error?.current);
      }
      return;
    }

    if (state === 'interrupted') {
      logger.error(
        'Download interrupted',
        trackedDownloadIds.get(delta.id),
        'reason:',
        delta.error?.current,
      );
      trackedDownloadIds.delete(delta.id);
    } else if (state === 'complete') {
      trackedDownloadIds.delete(delta.id);
    }
  });
}
