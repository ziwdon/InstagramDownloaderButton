import type { DownloadRequest } from '../core/messages';

/** Max length of the sanitized base name (account + shortcode/timestamp +
 * index), before the extension is appended. Kept well under typical filesystem
 * limits (200) to guarantee the extension always survives intact. */
const BASE_NAME_CAP = 180;

/**
 * Builds the on-disk filename for a download request. Pure (no browser APIs) so
 * it can be unit-tested. Format: `<account>_<shortcode|timestamp>[_<index>]<ext>`.
 * The base (everything but the extension) is sanitized and length-capped
 * FIRST, then the extension is appended — so a long base can never truncate
 * the extension off. Falls back to a default extension by media kind
 * (`.mp4` / `.jpg`) when the URL yields no recognized extension (e.g. signed
 * CDN video URLs).
 */
export function buildFilename(req: DownloadRequest, now: () => number = Date.now): string {
  const ext = guessExtension(req.mediaURL) || defaultExtension(req.mediaKind);
  const indexSuffix = req.index !== undefined ? `_${req.index}` : '';
  const base = sanitize(
    `${req.accountName}_${req.postShortcode ?? now()}${indexSuffix}`,
    BASE_NAME_CAP,
  );
  return `${base}${ext}`;
}

export function guessExtension(url: string): string {
  const clean = url.split('?')[0] ?? '';
  const m = clean.match(/\.(jpg|jpeg|png|mp4|webp|heic)$/i);
  return m ? `.${m[1]!.toLowerCase()}` : '';
}

function defaultExtension(mediaKind: 'image' | 'video'): string {
  return mediaKind === 'video' ? '.mp4' : '.jpg';
}

export function sanitize(name: string, maxLength = 200): string {
  return name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.-]+/, '')
    .slice(0, maxLength);
}
