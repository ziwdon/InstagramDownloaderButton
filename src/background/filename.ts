import type { DownloadRequest } from '../core/messages';

/**
 * Builds the on-disk filename for a download request. Pure (no browser APIs) so
 * it can be unit-tested. Format: `<account>_<shortcode|timestamp>[_<index>]<ext>`,
 * sanitized to a filesystem-safe subset and capped at 200 chars.
 */
export function buildFilename(req: DownloadRequest, now: () => number = Date.now): string {
  const ext = guessExtension(req.mediaURL);
  const indexSuffix = req.index !== undefined ? `_${req.index}` : '';
  return sanitize(`${req.accountName}_${req.postShortcode ?? now()}${indexSuffix}${ext}`);
}

export function guessExtension(url: string): string {
  const clean = url.split('?')[0] ?? '';
  const m = clean.match(/\.(jpg|jpeg|png|mp4|webp|heic)$/i);
  return m ? `.${m[1]!.toLowerCase()}` : '';
}

export function sanitize(name: string): string {
  return name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.-]+/, '')
    .slice(0, 200);
}
