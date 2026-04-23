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

function parseRelayWebInfo(): RelayWebInfo | null {
  const scripts = document.querySelectorAll(RELAY_JSON_SCRIPTS);
  for (const script of scripts) {
    try {
      const data: unknown = JSON.parse(script.textContent ?? '');
      const webInfo = findValue(data, 'xdt_api__v1__media__shortcode__web_info');
      if (webInfo !== null && typeof webInfo === 'object' && 'items' in webInfo) {
        return webInfo as RelayWebInfo;
      }
    } catch {
      // skip non-JSON or unrelated scripts
    }
  }
  return null;
}

function findRelayItem(shortcode: string | null): RelayMediaItem | null {
  const webInfo = parseRelayWebInfo();
  if (!webInfo?.items) return null;
  for (const item of webInfo.items) {
    if (shortcode !== null && item.code !== undefined && item.code !== shortcode) continue;
    return item;
  }
  return null;
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
