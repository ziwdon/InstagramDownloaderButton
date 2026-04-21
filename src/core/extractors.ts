import { AUTHOR_LINK, CAROUSEL_ACTIVE, PERMALINK, POST_IMG, POST_VIDEO } from './selectors';

export function extractAuthor(article: HTMLElement): string {
  const a = article.querySelector(AUTHOR_LINK.join(',')) as HTMLAnchorElement | null;
  if (!a) return 'unknown';
  return a.getAttribute('href')?.replace(/^\/|\/$/g, '') ?? 'unknown';
}

export function extractShortcode(article: HTMLElement): string | null {
  const a = article.querySelector(PERMALINK) as HTMLAnchorElement | null;
  const m = a?.getAttribute('href')?.match(/\/(?:p|reel)\/([^/]+)\//);
  return m?.[1] ?? null;
}

export function extractCurrentMediaURL(
  article: HTMLElement,
): { url: string; kind: 'image' | 'video' } | null {
  const activeSlide = article.querySelector(CAROUSEL_ACTIVE) as HTMLElement | null;
  const scope = activeSlide ?? article;

  const video = scope.querySelector(POST_VIDEO) as HTMLVideoElement | null;
  if (video) return { url: video.currentSrc, kind: 'video' };

  const img = scope.querySelector(POST_IMG.join(',')) as HTMLImageElement | null;
  if (img) return { url: pickBestSrc(img), kind: 'image' };

  return null;
}

function pickBestSrc(img: HTMLImageElement): string {
  if (!img.srcset) return img.src;
  const entries = img.srcset
    .split(',')
    .map((s) => s.trim().split(/\s+/))
    .map(([url, w]) => ({ url: url ?? '', w: parseInt(w ?? '0', 10) || 0 }))
    .sort((a, b) => b.w - a.w);
  return entries[0]?.url ?? img.src;
}
