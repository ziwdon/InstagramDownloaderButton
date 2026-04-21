import browser from 'webextension-polyfill';
import { ACTION_BAR, POST_ARTICLE, SAVE_SVG } from '../core/selectors';
import { extractAuthor, extractCurrentMediaURL, extractShortcode } from '../core/extractors';
import {
  extractMediaIdFromRelay,
  extractVideoURLFromRelay,
  fetchVideoURLFromAPI,
} from '../core/relay';
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
    const media = extractCurrentMediaURL(article);
    if (!media) {
      Alert.warn('Could not locate media in this post');
      return;
    }

    const shortcode = extractShortcode(article);
    let downloadURL = media.url;

    if (media.kind === 'video') {
      let videoURL = extractVideoURLFromRelay(shortcode);
      if (!videoURL) {
        const mediaId = extractMediaIdFromRelay(shortcode);
        if (mediaId) videoURL = await fetchVideoURLFromAPI(mediaId);
      }
      if (!videoURL) {
        Alert.warn('Could not resolve video URL — please try again or report at GitHub');
        return;
      }
      downloadURL = videoURL;
    }

    const req: DownloadRequest = {
      kind: 'download',
      mediaURL: downloadURL,
      accountName: extractAuthor(article),
      ...(shortcode !== null && { postShortcode: shortcode }),
    };
    try {
      await browser.runtime.sendMessage(req);
    } catch (e) {
      Alert.error(`Download failed: ${String(e)}`);
    }
  }
}
