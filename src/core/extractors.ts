import { AUTHOR_LINK, CAROUSEL_SLIDE_MEDIA, PERMALINK, POST_IMG, POST_VIDEO } from './selectors';

export function extractAuthor(scope: HTMLElement): string {
  const a = scope.querySelector(AUTHOR_LINK.join(',')) as HTMLAnchorElement | null;
  if (!a) return 'unknown';
  return a.getAttribute('href')?.replace(/^\/|\/$/g, '') ?? 'unknown';
}

export function extractShortcode(scope: HTMLElement): string | null {
  const a = scope.querySelector(PERMALINK) as HTMLAnchorElement | null;
  const m = a?.getAttribute('href')?.match(/\/(?:p|reel)\/([^/]+)\//);
  return m?.[1] ?? null;
}

export function extractCurrentMediaURL(
  scope: HTMLElement,
): { url: string; kind: 'image' | 'video' } | null {
  const active = findActiveCarouselSlide(scope);
  if (active) {
    const result = extractFromScope(active);
    if (result) return result;
  }
  return extractFromScope(scope);
}

/**
 * Returns the index of the visually active slide and the post carousel <ul>,
 * or null when the post is not a carousel. Used by the relay/API path to map
 * a DOM slide back to its carousel position.
 */
export function findActiveSlide(scope: HTMLElement): { index: number; total: number } | null {
  const ul = findPostCarouselUL(scope);
  if (!ul) return null;
  const slides = mediaCarriers(ul);
  if (slides.length === 0) return null;
  const active = pickActiveSlide(ul, slides);
  const index = slides.indexOf(active);
  return { index: index >= 0 ? index : 0, total: slides.length };
}

function extractFromScope(s: HTMLElement): { url: string; kind: 'image' | 'video' } | null {
  const video = s.querySelector(POST_VIDEO) as HTMLVideoElement | null;
  if (video) return { url: video.currentSrc, kind: 'video' };

  const img = s.querySelector(POST_IMG.join(',')) as HTMLImageElement | null;
  if (img) return { url: pickBestSrc(img), kind: 'image' };

  return null;
}

export function findActiveCarouselSlide(scope: HTMLElement): HTMLElement | null {
  const ul = findPostCarouselUL(scope);
  if (!ul) return null;
  const slides = mediaCarriers(ul);
  if (slides.length === 0) return null;
  return pickActiveSlide(ul, slides);
}

export function getActiveSlideMatchURL(scope: HTMLElement): string | null {
  const active = findActiveCarouselSlide(scope) ?? scope;
  const video = active.querySelector<HTMLVideoElement>('video');
  if (video?.poster) return video.poster;
  const img = active.querySelector<HTMLImageElement>(
    'img[alt^="Photo by "], img[alt^="May be "], img[alt^="Photo shared by "], img[src*="fbcdn"], img[src*="cdninstagram"]',
  );
  return img?.src ?? null;
}

// The post's carousel <ul> is the first one in DOM order whose direct <li>
// children carry post media. This skips suggestion rails, comments, etc.,
// which are also <ul>-based but contain other content.
function findPostCarouselUL(scope: HTMLElement): HTMLUListElement | null {
  for (const ul of scope.querySelectorAll<HTMLUListElement>('ul')) {
    if (mediaCarriers(ul).length > 0) return ul;
  }
  return null;
}

function mediaCarriers(ul: HTMLUListElement): HTMLLIElement[] {
  const result: HTMLLIElement[] = [];
  for (const li of ul.querySelectorAll<HTMLLIElement>(':scope > li')) {
    if (li.querySelector(CAROUSEL_SLIDE_MEDIA)) result.push(li);
  }
  return result;
}

function getCarouselViewportRect(ul: HTMLUListElement): DOMRect {
  let el: HTMLElement | null = ul.parentElement;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const overflowX = cs.overflowX;
    if (overflowX === 'hidden' || overflowX === 'clip' || overflowX === 'auto') {
      return el.getBoundingClientRect();
    }
    el = el.parentElement;
  }
  return (ul.parentElement ?? ul).getBoundingClientRect();
}

// The visually active slide is the one with the largest horizontal overlap
// with the carousel viewport. Works for both the legacy tabindex-based
// carousel and the newer one where every real slide has tabindex="-1" and
// position is driven by transform translateX().
function pickActiveSlide(ul: HTMLUListElement, slides: HTMLLIElement[]): HTMLLIElement {
  if (slides.length === 1) return slides[0]!;
  const viewport = getCarouselViewportRect(ul);
  let best: { li: HTMLLIElement; overlap: number } | null = null;
  for (const li of slides) {
    const r = li.getBoundingClientRect();
    const overlap = Math.max(
      0,
      Math.min(r.right, viewport.right) - Math.max(r.left, viewport.left),
    );
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) best = { li, overlap };
  }
  return best?.li ?? slides[0]!;
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
