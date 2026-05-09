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
export function extractAllSlidesFromRelay(
  shortcode: string | null,
): Array<{ videoURL: string | null; imageURL: string | null; pk: string | null }> {
  const item = findRelayItem(shortcode);
  if (!item) return [];

  if (item.carousel_media?.length) {
    logger.log('relay carousel hit for shortcode', shortcode);
    return item.carousel_media.map((slide) => ({
      videoURL: slide.video_versions?.length ? pickBestURL(slide.video_versions) : null,
      imageURL: pickBestImageURL(slide.image_versions2?.candidates),
      pk: slide.pk ?? null,
    }));
  }

  const videoURL = item.video_versions?.length ? pickBestURL(item.video_versions) : null;
  if (videoURL) logger.log('relay cache hit for shortcode', shortcode);
  return [
    {
      videoURL,
      imageURL: pickBestImageURL(item.image_versions2?.candidates),
      pk: item.pk ?? null,
    },
  ];
}

/** Async fallback: fetches media info from the Instagram API using the session cookie. */
export async function fetchVideoURLFromAPI(mediaId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      credentials: 'include',
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
    return null;
  }
}
