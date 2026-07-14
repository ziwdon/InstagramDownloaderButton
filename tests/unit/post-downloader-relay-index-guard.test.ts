import { describe, it, expect, beforeEach, vi } from 'vitest';

// Task 1.3 (F3): pickActiveRelaySlide (PostDownloader.ts, shared by the image
// relay-fallback branch and the video resolution branch) must not trust the
// DOM's positional carousel index when the DOM slide count and the relay
// slide count diverge — e.g. Instagram windowing a carousel for a deep link
// (`?img_index=N`) so only a subset of slides are rendered. Exercised here
// through the image branch (the only one live today — video downloads are
// behind the VIDEO_DOWNLOADS_ENABLED kill-switch) since both branches funnel
// through the same pickActiveRelaySlide function.
const sendMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: (...args: unknown[]) => sendMessage(...args) } },
}));

const alertWarn = vi.fn();
vi.mock('../../src/content/ui/Alert', () => ({
  Alert: { warn: (...args: unknown[]) => alertWarn(...args), error: vi.fn(), info: vi.fn() },
}));

const { PostDownloader } = await import('../../src/content/PostDownloader');

// Mirrors relay.test.ts / post-downloader-image-relay-fallback.test.ts:
// Instagram embeds the Relay prefetch payload as a JSON <script data-sjs> tag.
function injectRelayBlob(payload: unknown): void {
  const s = document.createElement('script');
  s.setAttribute('type', 'application/json');
  s.setAttribute('data-sjs', '');
  s.textContent = JSON.stringify(payload);
  document.body.appendChild(s);
}

// Mirrors tests/dom/extractors.test.ts's stubRect helper: happy-dom's
// getBoundingClientRect() has no real layout engine, so carousel
// active-slide selection (overlap-with-viewport) needs an explicit stub.
function stubRect(el: Element, left: number, right: number): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0 }) as DOMRect;
}

// A 2-slide carousel post container. Each slide's <img> src is a blob: URL
// containing no digits at all, so relaySlideMatchesURL's numeric-asset-id
// match can never succeed for it (regardless of how a `blob:` URL's
// .pathname happens to be parsed) — this deterministically forces
// pickActiveRelaySlide past the URL-match branch and into the
// position-vs-guard logic under test. Slide 0 is stubbed as the visually
// active slide (full overlap with the viewport); slide 1 is scrolled off.
function buildTwoSlideCarousel(shortcode: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = `
    <a href="/someuser/p/${shortcode}/">permalink</a>
    <ul>
      <li><img alt="Photo by Someone on Jan 1, 2026." src="blob:http://localhost/slide-a"></li>
      <li><img alt="Photo by Someone on Jan 1, 2026." src="blob:http://localhost/slide-b"></li>
    </ul>
  `;
  document.body.appendChild(container);
  const ul = container.querySelector('ul')!;
  const [li0, li1] = Array.from(ul.querySelectorAll('li'));
  stubRect(container, 0, 100); // carousel viewport
  stubRect(li0!, 0, 100); // fully overlaps viewport -> active
  stubRect(li1!, 200, 300); // no overlap -> inactive
  return container;
}

// Relay web_info payload with `slideCount` carousel_media entries, each a
// distinctly-identifiable image slide.
function relayWebInfo(shortcode: string, slideCount: number): unknown {
  const carousel_media = Array.from({ length: slideCount }, (_, i) => ({
    code: null,
    pk: `pk-${i}`,
    image_versions2: {
      candidates: [{ url: `https://relay.cdninstagram.com/slide-${i}.jpg`, width: 1080 }],
    },
  }));
  return {
    xdt_api__v1__media__shortcode__web_info: {
      items: [
        {
          code: shortcode,
          pk: 'root-pk',
          image_versions2: { candidates: [] },
          carousel_media,
        },
      ],
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sendMessage.mockClear();
  alertWarn.mockClear();
});

describe('pickActiveRelaySlide — DOM/relay slide-count guard (F3)', () => {
  it('matching counts (2 DOM slides, 2 relay slides): positional index is used, unchanged', async () => {
    const shortcode = 'MATCH2SLD';
    const container = buildTwoSlideCarousel(shortcode);
    injectRelayBlob(relayWebInfo(shortcode, 2));

    await new PostDownloader().onClick(container);

    expect(alertWarn).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const req = sendMessage.mock.calls[0]![0];
    // DOM active slide is index 0 -> relay slide 0.
    expect(req.mediaURL).toBe('https://relay.cdninstagram.com/slide-0.jpg');
  });

  it('mismatched counts (2 DOM slides, 3 relay slides): never trusts the positional index', async () => {
    const shortcode = 'MISMATCH3';
    const container = buildTwoSlideCarousel(shortcode);
    // Same DOM as above (active index 0), but the relay payload has 3 slides
    // — e.g. Instagram windowed the carousel around a deep-linked slide.
    // Without the guard, DOM index 0 would positionally resolve to relay
    // slide 0 exactly as in the matching-count test above; that resolution is
    // no longer trustworthy once the counts diverge.
    injectRelayBlob(relayWebInfo(shortcode, 3));

    await new PostDownloader().onClick(container);

    // The guard must refuse the positional guess entirely rather than
    // falling back to a biased guess (e.g. "first slide with a video, else
    // slide 0") — proving relay slide 0, what a purely positional lookup
    // would have returned, was never used to send a download.
    expect(sendMessage).not.toHaveBeenCalled();
    expect(alertWarn).toHaveBeenCalledWith('Could not locate media in this post');
  });
});
