import { AUTHOR_LINK, CAROUSEL_SLIDE_MEDIA, PERMALINK, POST_IMG, POST_VIDEO } from './selectors';

/**
 * Query `scope` for each selector in `selectors` in array order, returning the
 * first element that matches. Unlike `scope.querySelector(selectors.join(','))`
 * — which returns the first match in *document* order regardless of which
 * selector produced it — this honors the priority encoded by the array's order,
 * so a more-specific selector listed first wins over a broader fallback even
 * when the fallback's match appears earlier in the DOM.
 *
 * Only use this for selector arrays whose order encodes real precedence. For
 * arrays where any match is equally acceptable (e.g. the aria-label-OR-geometry
 * anchors in selectors.ts), a comma-join is correct and cheaper.
 */
export function queryByPriority(scope: ParentNode, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    const el = scope.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function extractAuthor(scope: HTMLElement): string {
  const a = queryByPriority(scope, AUTHOR_LINK) as HTMLAnchorElement | null;
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
    // Primary: the same POST_VIDEO/POST_IMG criteria used everywhere else.
    const result = extractFromScope(active);
    if (result) return result;

    // Fallback: the slide was recognized as a carousel slide by matching
    // CAROUSEL_SLIDE_MEDIA, but POST_IMG/POST_VIDEO failed to re-find its media
    // (e.g. an <img alt="" src="…cdninstagram…"> — accepted by
    // CAROUSEL_SLIDE_MEDIA but excluded by POST_IMG's :not([alt=""]) fallback).
    // Re-query the slide with the exact criteria it already matched; since the
    // slide matched to be recognized as a slide, this cannot miss.
    const slideResult = extractSlideMedia(active);
    if (slideResult) return slideResult;

    // A carousel was positively detected but no media could be resolved in the
    // active slide (defensive — the CAROUSEL_SLIDE_MEDIA lookup above cannot
    // miss for a real slide). Return null so the caller shows a "could not
    // locate media" toast, rather than falling through to scope-level
    // extraction — which would silently return slide 0's media (the wrong file).
    return null;
  }
  // No carousel: scope-level extraction is the primary (and only) path.
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

  const img = queryByPriority(s, POST_IMG) as HTMLImageElement | null;
  if (img) return { url: pickBestSrc(img), kind: 'image' };

  return null;
}

/**
 * Slide-scoped media lookup using the exact CAROUSEL_SLIDE_MEDIA criteria the
 * slide already matched to be recognized as a carousel slide. Used only as a
 * last resort inside an identified active slide, when POST_VIDEO/POST_IMG
 * (extractFromScope) came up empty — covers media that CAROUSEL_SLIDE_MEDIA
 * accepts but POST_IMG rejects (e.g. alt="" cdninstagram images). Video is
 * checked first so a video slide never resolves to its poster image.
 */
function extractSlideMedia(slide: HTMLElement): { url: string; kind: 'image' | 'video' } | null {
  const video = slide.querySelector(POST_VIDEO) as HTMLVideoElement | null;
  if (video) return { url: video.currentSrc, kind: 'video' };

  const media = slide.querySelector(CAROUSEL_SLIDE_MEDIA);
  if (media && media.tagName === 'IMG') {
    return { url: pickBestSrc(media as HTMLImageElement), kind: 'image' };
  }

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
