import { RELAY_JSON_SCRIPTS } from './selectors';
import { logger } from './logger';

interface VideoVersion {
  url: string;
  type: number;
}

interface ImageCandidate {
  url: string;
  width?: number;
}

interface RelayMediaItem {
  code?: string;
  pk?: string;
  video_versions?: VideoVersion[];
  image_versions2?: { candidates?: ImageCandidate[] };
  carousel_media?: RelayMediaItem[];
}

interface RelayWebInfo {
  items?: RelayMediaItem[];
}

export interface RelaySlide {
  videoURL: string | null;
  imageURL: string | null;
  imageURLs: string[];
  pk: string | null;
}

function findValue(obj: unknown, key: string, depth = 0): unknown {
  if (depth > 20 || obj === null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findValue(item, key, depth + 1);
      if (found !== undefined) return found;
    }
  } else {
    const record = obj as Record<string, unknown>;
    if (key in record) return record[key];
    for (const val of Object.values(record)) {
      const found = findValue(val, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function urlAssetId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const runs = path.match(/\d{10,}/g) ?? [];
    if (runs.length === 0) return null;
    return runs.reduce((a, b) => (b.length > a.length ? b : a));
  } catch {
    return null;
  }
}

export function relaySlideMatchesURL(slide: RelaySlide, domURL: string | null): boolean {
  if (!domURL) return false;
  const target = urlAssetId(domURL);
  if (!target) return false;
  for (const url of slide.imageURLs) {
    if (urlAssetId(url) === target) return true;
  }
  return false;
}

function pickBestImageURL(candidates: ImageCandidate[] | undefined): string | null {
  if (!candidates?.length) return null;
  const sorted = [...candidates].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? null;
}

function pickBestURL(versions: VideoVersion[]): string | null {
  const best = versions.find((v) => v.type === 101) ?? versions[0];
  const url = best?.url;
  return url && !url.startsWith('blob:') ? url : null;
}

function parseAllRelayJSON(): unknown[] {
  const scripts = document.querySelectorAll(RELAY_JSON_SCRIPTS);
  const out: unknown[] = [];
  for (const script of scripts) {
    try {
      out.push(JSON.parse(script.textContent ?? ''));
    } catch {
      // skip non-JSON or unrelated scripts
    }
  }
  return out;
}

// Permalink (post / reel / video) pages embed the post's media under
// `xdt_api__v1__media__shortcode__web_info.items[*]`.
function findItemFromShortcodeWebInfo(
  blobs: unknown[],
  shortcode: string | null,
): RelayMediaItem | null {
  for (const data of blobs) {
    const webInfo = findValue(data, 'xdt_api__v1__media__shortcode__web_info');
    if (webInfo === null || typeof webInfo !== 'object' || !('items' in webInfo)) continue;
    const items = (webInfo as RelayWebInfo).items;
    if (!items) continue;
    for (const item of items) {
      if (shortcode !== null && item.code !== undefined && item.code !== shortcode) continue;
      return item;
    }
  }
  return null;
}

// Feed pages (home, profile, channel) embed posts under
// `xdt_api__v1__feed__timeline__connection.edges[*].node.media`. Match by code
// since a single connection holds many posts.
function findItemFromFeedTimeline(
  blobs: unknown[],
  shortcode: string | null,
): RelayMediaItem | null {
  if (shortcode === null) return null;
  for (const data of blobs) {
    const conn = findValue(data, 'xdt_api__v1__feed__timeline__connection');
    if (!conn || typeof conn !== 'object') continue;
    const edges = (conn as Record<string, unknown>)['edges'];
    if (!Array.isArray(edges)) continue;
    for (const edge of edges) {
      if (!edge || typeof edge !== 'object') continue;
      const node = (edge as Record<string, unknown>)['node'];
      if (!node || typeof node !== 'object') continue;
      const media = (node as Record<string, unknown>)['media'];
      if (!media || typeof media !== 'object') continue;
      const m = media as RelayMediaItem;
      if (m.code === shortcode) return m;
    }
  }
  return null;
}

function findRelayItem(shortcode: string | null): RelayMediaItem | null {
  const blobs = parseAllRelayJSON();
  return (
    findItemFromShortcodeWebInfo(blobs, shortcode) ?? findItemFromFeedTimeline(blobs, shortcode)
  );
}

/**
 * Synchronous: returns per-slide relay data for a post (single or carousel).
 * Each entry maps to one media slide in order.
 * `videoURL` is null for image slides; `imageURL` is null for video slides.
 */
export function extractAllSlidesFromRelay(shortcode: string | null): RelaySlide[] {
  const item = findRelayItem(shortcode);
  if (!item) return [];

  const toSlide = (m: RelayMediaItem): RelaySlide => {
    const candidates = m.image_versions2?.candidates ?? [];
    return {
      videoURL: m.video_versions?.length ? pickBestURL(m.video_versions) : null,
      imageURL: pickBestImageURL(candidates),
      imageURLs: candidates.map((c) => c.url).filter((u): u is string => Boolean(u)),
      pk: m.pk ?? null,
    };
  };

  if (item.carousel_media?.length) {
    logger.log('relay carousel hit for shortcode', shortcode);
    return item.carousel_media.map(toSlide);
  }

  const single = toSlide(item);
  if (single.videoURL) logger.log('relay cache hit for shortcode', shortcode);
  return [single];
}

const API_FETCH_TIMEOUT_MS = 10_000;

/**
 * Async fallback: fetches media info from the Instagram API using the
 * session cookie. Bounded by a 10s AbortController timeout so a hung request
 * doesn't leave the caller waiting indefinitely — a timeout resolves to
 * `null` just like any other failure, so the existing fallback chain/toast
 * in PostDownloader.onClick() handles it without needing to distinguish an
 * abort from a network error.
 */
export async function fetchVideoURLFromAPI(mediaId: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      credentials: 'include',
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data: unknown = await resp.json();
    if (!data || typeof data !== 'object') return null;
    const items = (data as Record<string, unknown>)['items'];
    if (!Array.isArray(items) || items.length === 0) return null;
    const item = items[0] as RelayMediaItem | undefined;
    const versions = item?.video_versions;
    if (!versions?.length) return null;
    logger.log('API fallback hit for mediaId', mediaId);
    return pickBestURL(versions);
  } catch {
    // Covers both a genuine fetch/network failure and the AbortError thrown
    // when the timeout fires — either way, null lets the caller fall back.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
