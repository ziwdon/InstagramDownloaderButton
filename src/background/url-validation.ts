const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

/**
 * Rejects non-http(s) schemes (`data:`, `javascript:`, `file:`, malformed
 * strings, ...) before a media URL ever reaches `browser.downloads.download()`.
 * Pure (no browser APIs) so it can be unit-tested from Node-based vitest
 * without pulling in `webextension-polyfill`.
 */
export function isDownloadableURL(mediaURL: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(mediaURL).protocol);
  } catch {
    return false;
  }
}
