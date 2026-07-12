import browser from 'webextension-polyfill';
import { ACTION_BAR, LIKE_SVG, SAVE_SVG, SHARE_SVG } from '../core/selectors';
import {
  extractAuthor,
  extractCurrentMediaURL,
  extractShortcode,
  findActiveSlide,
  getActiveSlideMatchURL,
} from '../core/extractors';
import {
  extractAllSlidesFromRelay,
  fetchVideoURLFromAPI,
  relaySlideMatchesURL,
  type RelaySlide,
} from '../core/relay';
import { shortcodeToMediaId } from '../core/shortcode';
import { VIDEO_DOWNLOADS_ENABLED } from '../core/config';
import { classify } from './UrlRouter';
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
    // the section — the "save cell".
    let saveOuter: Element | null = saveSvg;
    while (saveOuter && saveOuter.parentElement !== section) {
      saveOuter = saveOuter.parentElement;
    }
    if (!saveOuter) return;

    const btn = createDownloadButton(() => void this.onClick(container));
    btn.classList.add(BTN_CLASS);

    // The action-bar section is a 2-column CSS grid (`grid-template-columns:
    // 1fr 1fr`) on every current Instagram layout: column 1 holds the actions
    // wrapper (Like/Comment/Share), column 2 holds Save. Inserting a third
    // direct child auto-places it in column 2 row 1 and bumps Save to row 2.
    // To stay on one line we append into the actions wrapper instead, keeping
    // the grid at two children. If no such wrapper exists (legacy flat
    // layouts), fall back to placing the button before Save in the section.
    const actionsWrapper = findActionsWrapper(section, saveOuter);
    if (actionsWrapper) {
      actionsWrapper.appendChild(btn);
    } else {
      section.insertBefore(btn, saveOuter);
    }
  }

  async onClick(container: HTMLElement): Promise<void> {
    const media = extractCurrentMediaURL(container);
    if (!media) {
      Alert.warn('Could not locate media in this post');
      return;
    }

    const shortcode = extractShortcode(container) ?? extractShortcodeFromURL();
    const accountName = extractAuthor(container);

    let downloadURL: string | null = null;

    if (media.kind === 'image') {
      downloadURL = nonBlobOrNull(media.url);
    } else if (!VIDEO_DOWNLOADS_ENABLED) {
      Alert.warn('Video downloads are currently disabled');
      return;
    } else {
      // Video: prefer relay/API URL — the DOM <video> often has an HLS blob or
      // a short-lived URL that fails to download.
      const relaySlides = extractAllSlidesFromRelay(shortcode);
      const slide = pickActiveRelaySlide(container, relaySlides);
      let videoURL = slide?.videoURL ?? null;

      if (!videoURL && slide?.pk) {
        videoURL = await fetchVideoURLFromAPI(slide.pk);
      }

      if (!videoURL && shortcode !== null) {
        const derivedId = shortcodeToMediaId(shortcode);
        if (derivedId !== null) {
          videoURL = await fetchVideoURLFromAPI(derivedId);
        }
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

// The "actions wrapper" is the direct section child that holds the row of
// Like/Comment/Share icons (i.e., everything in the action bar except Save).
// We identify it by requiring BOTH a Like/Unlike SVG AND a Share SVG inside
// the same child — that distinguishes a single grouped wrapper from legacy
// flat layouts where each action is its own direct section child.
function findActionsWrapper(section: HTMLElement, saveOuter: Element): HTMLElement | null {
  for (const child of Array.from(section.children)) {
    if (child === saveOuter) continue;
    const hasLike = child.querySelector(LIKE_SVG);
    const hasShare = child.querySelector(SHARE_SVG);
    if (hasLike && hasShare) return child as HTMLElement;
  }
  return null;
}

function pickActiveRelaySlide(scope: HTMLElement, slides: RelaySlide[]): RelaySlide | null {
  if (slides.length === 0) return null;
  if (slides.length === 1) return slides[0] ?? null;

  const matchURL = getActiveSlideMatchURL(scope);
  if (matchURL) {
    const matched = slides.find((slide) => relaySlideMatchesURL(slide, matchURL));
    if (matched) return matched;
  }

  const active = findActiveSlide(scope);
  if (active && active.index < slides.length) {
    const slide = slides[active.index];
    if (slide) return slide;
  }

  return slides.find((s) => s.videoURL !== null) ?? slides[0] ?? null;
}

function nonBlobOrNull(url: string): string | null {
  return url && !url.startsWith('blob:') ? url : null;
}

// Fallback for when extractShortcode() finds no permalink anchor in the
// container (e.g. layout variance). On single-post routes the shortcode is
// already present in the URL itself. Mirrors the segment logic in
// UrlRouter.classify() so this only resolves on post/reel routes — never on
// home, where the URL's shortcode (if any) wouldn't identify which feed post
// was actually clicked.
function extractShortcodeFromURL(): string | null {
  const route = classify(location.href);
  if (route !== 'post' && route !== 'reel') return null;

  const segments = location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'p' || segments[0] === 'reel' || segments[0] === 'reels') {
    return segments[1] ?? null;
  }
  if (segments.length >= 2 && (segments[1] === 'p' || segments[1] === 'reel')) {
    return segments[2] ?? null;
  }
  return null;
}
