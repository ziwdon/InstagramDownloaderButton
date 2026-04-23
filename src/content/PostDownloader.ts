import browser from 'webextension-polyfill';
import { ACTION_BAR, POST_ARTICLE, SAVE_SVG } from '../core/selectors';
import { extractAllMediaURLs, extractAuthor, extractShortcode } from '../core/extractors';
import { extractAllSlidesFromRelay, fetchVideoURLFromAPI } from '../core/relay';
import type { DownloadRequest } from '../core/messages';
import { Alert } from './ui/Alert';
import { createDownloadButton } from './ui/DownloadButton';

const BTN_CLASS = 'igdl-btn';

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

  private scan(): void {
    const articles = document.querySelectorAll<HTMLElement>(POST_ARTICLE.join(','));
    for (const article of articles) this.ensureButton(article);
  }

  private ensureButton(article: HTMLElement): void {
    const saveSvg = article.querySelector<SVGElement>(SAVE_SVG);
    if (!saveSvg) return;

    // Find the action bar section and get its direct child (the buttons row)
    const section = article.querySelector<HTMLElement>(ACTION_BAR.join(','));
    if (!section) return;
    const row = section.firstElementChild as HTMLElement | null;
    if (!row || row.querySelector(`.${BTN_CLASS}`)) return;

    // Walk up from the Save SVG to find its ancestor that is a direct child of row
    let saveWrapper: Element | null = saveSvg;
    while (saveWrapper && saveWrapper.parentElement !== row) {
      saveWrapper = saveWrapper.parentElement;
    }
    if (!saveWrapper) return;

    const btn = createDownloadButton(() => void this.onClick(article));
    btn.classList.add(BTN_CLASS);
    row.insertBefore(btn, saveWrapper.nextSibling);
  }

  async onClick(article: HTMLElement): Promise<void> {
    const allMedia = extractAllMediaURLs(article);
    if (allMedia.length === 0) {
      Alert.warn('Could not locate media in this post');
      return;
    }

    const shortcode = extractShortcode(article);
    const accountName = extractAuthor(article);

    // Relay data keyed by slide index (covers single and carousel posts).
    const relaySlides = extractAllSlidesFromRelay(shortcode);
    // Use relay count as authoritative total — it includes virtualized off-screen slides.
    const totalSlides = Math.max(allMedia.length, relaySlides.length);
    const isMulti = totalSlides > 1;

    // Resolve the final download URL for each slide.
    const resolvedURLs: Array<string | null> = [];
    const isVideoSlot: boolean[] = [];

    for (let i = 0; i < totalSlides; i++) {
      const media = allMedia[i]; // undefined for off-screen (virtualized) slides
      const relaySlide = relaySlides[i];

      if (media) {
        if (media.kind === 'image') {
          isVideoSlot.push(false);
          resolvedURLs.push(media.url);
          continue;
        }
        // Video slide: prefer relay, fall back to API.
        // Filter blob URLs — they are scope-locked to the content script and
        // cannot be passed to the background service worker.
        isVideoSlot.push(true);
        let videoURL: string | null = relaySlide?.videoURL ?? null;
        if (!videoURL) {
          const pk = relaySlide?.pk ?? null;
          if (pk) videoURL = await fetchVideoURLFromAPI(pk);
        }
        const domUrl = media.url && !media.url.startsWith('blob:') ? media.url : null;
        resolvedURLs.push(videoURL ?? domUrl);
      } else {
        // Off-screen slide: DOM has no content — recover exclusively from relay.
        if (!relaySlide) {
          isVideoSlot.push(false);
          resolvedURLs.push(null);
          continue;
        }
        if (relaySlide.videoURL) {
          isVideoSlot.push(true);
          resolvedURLs.push(relaySlide.videoURL);
        } else if (relaySlide.pk) {
          // pk present but no relay videoURL — try API (could be video or image).
          const videoURL = await fetchVideoURLFromAPI(relaySlide.pk);
          if (videoURL) {
            isVideoSlot.push(true);
            resolvedURLs.push(videoURL);
          } else {
            isVideoSlot.push(false);
            resolvedURLs.push(relaySlide.imageURL);
          }
        } else {
          isVideoSlot.push(false);
          resolvedURLs.push(relaySlide.imageURL);
        }
      }
    }

    // Bail early if every video slot failed to resolve.
    const videoIndices = isVideoSlot.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (videoIndices.length > 0 && videoIndices.every((i) => !resolvedURLs[i])) {
      Alert.warn('Could not resolve video URL — please try again or report at GitHub');
      return;
    }

    // Dispatch one download request per resolved slide.
    let skipped = 0;
    for (let i = 0; i < resolvedURLs.length; i++) {
      const url = resolvedURLs[i];
      if (!url) {
        skipped++;
        continue;
      }
      const req: DownloadRequest = {
        kind: 'download',
        mediaURL: url,
        accountName,
        ...(shortcode !== null && { postShortcode: shortcode }),
        ...(isMulti && { index: i + 1 }),
      };
      try {
        await browser.runtime.sendMessage(req);
      } catch (e) {
        Alert.error(`Download failed: ${String(e)}`);
      }
    }
    if (skipped > 0) {
      Alert.warn(
        `${skipped} slide${skipped > 1 ? 's' : ''} could not be resolved and were skipped`,
      );
    }
  }
}
