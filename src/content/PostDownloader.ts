import browser from 'webextension-polyfill';
import { ACTION_BAR, SAVE_SVG } from '../core/selectors';
import {
  extractAuthor,
  extractCurrentMediaURL,
  extractShortcode,
  findActiveSlide,
} from '../core/extractors';
import { extractAllSlidesFromRelay, fetchVideoURLFromAPI } from '../core/relay';
import type { DownloadRequest } from '../core/messages';
import { Alert } from './ui/Alert';
import { createDownloadButton } from './ui/DownloadButton';

const BTN_CLASS = 'igdl-btn';

const NON_POST_IMG_ALT_SUFFIXES = [
  'profile picture',
  'profile photo',
  'highlight story picture',
  'highlight cover image',
] as const;

export class PostDownloader {
  private observer: MutationObserver | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  init(): void {
    this.scan();
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scanDebounced());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  remove(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    document.querySelectorAll<HTMLElement>(`.${BTN_CLASS}`).forEach((b) => b.remove());
  }

  private scanDebounced(): void {
    if (this.scanTimer !== null) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scan(), 120);
  }

  // Anchor on Save SVGs — there is exactly one per post and it works on every
  // page variant (feed, modal, permalink). Permalink pages no longer use
  // <article> wrappers, so deriving the post container from the Save SVG is the
  // only reliable approach across all routes.
  private scan(): void {
    const saveSvgs = document.querySelectorAll<SVGElement>(SAVE_SVG);
    for (const svg of saveSvgs) {
      const container = findPostContainer(svg);
      if (container) this.ensureButton(container, svg);
    }
  }

  private ensureButton(container: HTMLElement, saveSvg: SVGElement): void {
    const section =
      saveSvg.closest<HTMLElement>('section') ??
      container.querySelector<HTMLElement>(ACTION_BAR.join(','));
    if (!section) return;
    if (section.querySelector(`.${BTN_CLASS}`)) return;

    // Walk up from the Save SVG to find its ancestor that is a direct child of
    // the section. Save's position varies: in feed posts it sits inside a
    // right-aligned wrapper div (section's second child); on permalink/reel
    // pages it's a sibling <span> alongside Like/Comment/Share. Either way the
    // wrapper we want is the one whose parent is the section itself.
    let saveOuter: Element | null = saveSvg;
    while (saveOuter && saveOuter.parentElement !== section) {
      saveOuter = saveOuter.parentElement;
    }
    if (!saveOuter) return;

    const btn = createDownloadButton(() => void this.onClick(container));
    btn.classList.add(BTN_CLASS);
    section.insertBefore(btn, saveOuter);
  }

  async onClick(container: HTMLElement): Promise<void> {
    const media = extractCurrentMediaURL(container);
    if (!media) {
      Alert.warn('Could not locate media in this post');
      return;
    }

    const shortcode = extractShortcode(container);
    const accountName = extractAuthor(container);

    let downloadURL: string | null = null;

    if (media.kind === 'image') {
      downloadURL = nonBlobOrNull(media.url);
    } else {
      // Video: prefer relay/API URL — the DOM <video> often has an HLS blob or
      // a short-lived URL that fails to download.
      const relaySlides = extractAllSlidesFromRelay(shortcode);
      const slide = pickActiveRelaySlide(container, relaySlides);
      let videoURL = slide?.videoURL ?? null;
      if (!videoURL && slide?.pk) {
        videoURL = await fetchVideoURLFromAPI(slide.pk);
      }
      downloadURL = videoURL ?? nonBlobOrNull(media.url);
    }

    if (!downloadURL) {
      Alert.warn(
        media.kind === 'video'
          ? 'Could not resolve video URL — please try again or report at GitHub'
          : 'Could not locate media in this post',
      );
      return;
    }

    const req: DownloadRequest = {
      kind: 'download',
      mediaURL: downloadURL,
      accountName,
      ...(shortcode !== null && { postShortcode: shortcode }),
    };
    try {
      await browser.runtime.sendMessage(req);
    } catch (e) {
      Alert.error(`Download failed: ${String(e)}`);
    }
  }
}

// Find the post container for a given Save SVG. On feed/modal pages this is
// the enclosing <article>. Permalink (post / reel / video) pages no longer
// wrap posts in <article>; instead we walk up from the action bar until we
// find the smallest ancestor that contains a non-action-bar, non-profile
// image or video — that ancestor is the post wrapper, narrower than <main>
// (which also contains the related-posts section).
function findPostContainer(saveSvg: SVGElement): HTMLElement | null {
  const article = saveSvg.closest<HTMLElement>('article');
  if (article) return article;

  const actionBar = saveSvg.closest<HTMLElement>('section');
  const main = saveSvg.closest<HTMLElement>('main[role="main"]');
  if (!actionBar) return main;

  let cur: HTMLElement | null = actionBar.parentElement;
  while (cur && cur !== document.body) {
    if (containsPostMedia(cur, actionBar)) return cur;
    cur = cur.parentElement;
  }
  return main;
}

function containsPostMedia(scope: HTMLElement, actionBar: HTMLElement): boolean {
  if (scope.querySelector('video')) return true;
  const imgs = scope.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    if (actionBar.contains(img)) continue;
    const alt = img.getAttribute('alt') ?? '';
    if (alt === '') continue;
    if (NON_POST_IMG_ALT_SUFFIXES.some((s) => alt.endsWith(s))) continue;
    return true;
  }
  return false;
}

function pickActiveRelaySlide<T extends { videoURL: string | null; pk: string | null }>(
  scope: HTMLElement,
  slides: T[],
): T | null {
  if (slides.length === 0) return null;
  if (slides.length === 1) return slides[0] ?? null;

  const active = findActiveSlide(scope);
  if (active && active.index < slides.length) {
    const slide = slides[active.index];
    if (slide) return slide;
  }
  // Fallback for mixed image+video carousels: pick the first slide that has a
  // resolvable video URL.
  return slides.find((s) => s.videoURL !== null) ?? slides[0] ?? null;
}

function nonBlobOrNull(url: string): string | null {
  return url && !url.startsWith('blob:') ? url : null;
}
