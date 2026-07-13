export type DownloadRequest = {
  kind: 'download';
  mediaURL: string;
  accountName: string;
  /** Which kind of media was resolved — used to pick a default file extension
   * when the URL itself doesn't reveal one (e.g. signed CDN video URLs). */
  mediaKind: 'image' | 'video';
  postShortcode?: string;
  /** 1-based slide index; present only when a post has multiple slides. */
  index?: number;
};

export type ExtensionMessage = DownloadRequest;

/** Runtime type guard for `DownloadRequest` — validates messages crossing the
 * content-script → background boundary before they're trusted. */
export function isDownloadRequest(msg: unknown): msg is DownloadRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m.kind !== 'download') return false;
  if (typeof m.mediaURL !== 'string' || typeof m.accountName !== 'string') return false;
  if (m.mediaKind !== 'image' && m.mediaKind !== 'video') return false;
  if (m.postShortcode !== undefined && typeof m.postShortcode !== 'string') return false;
  if (m.index !== undefined && typeof m.index !== 'number') return false;
  return true;
}
