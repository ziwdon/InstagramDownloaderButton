import { describe, it, expect, beforeEach, vi } from 'vitest';
import singlepost from '../fixtures/relay/Instagram_singlepost.web_info.json';
import feed from '../fixtures/relay/feed_timeline.json';

// PostDownloader.onClick's image branch (Task 1.4): when the DOM-derived URL
// is null (blob:/placeholder/expired), fall back to the same relay
// resolution the video branch already uses. Mock webextension-polyfill so we
// can assert on what onClick actually sends, and mock Alert since happy-dom
// doesn't implement Element.animate() (used by Alert's show/dismiss) —
// unrelated to the behavior under test.
const sendMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: (...args: unknown[]) => sendMessage(...args) } },
}));

const alertWarn = vi.fn();
vi.mock('../../src/content/ui/Alert', () => ({
  Alert: { warn: (...args: unknown[]) => alertWarn(...args), error: vi.fn(), info: vi.fn() },
}));

// Imported after the mocks above so PostDownloader picks up the mocked
// modules rather than the real browser.runtime / Alert.
const { PostDownloader } = await import('../../src/content/PostDownloader');

interface FixtureMedia {
  code: string;
  image_versions2?: { candidates: { url: string; width: number }[] };
}

function widestURL(fixture: unknown, path: 'web_info' | 'feed'): string {
  if (path === 'web_info') {
    const f = fixture as { xdt_api__v1__media__shortcode__web_info: { items: FixtureMedia[] } };
    const item = f.xdt_api__v1__media__shortcode__web_info.items[0]!;
    return [...item.image_versions2!.candidates].sort((a, b) => b.width - a.width)[0]!.url;
  }
  const f = fixture as {
    xdt_api__v1__feed__timeline__connection: { edges: { node: { media: FixtureMedia } }[] };
  };
  const media = f.xdt_api__v1__feed__timeline__connection.edges[0]!.node.media;
  return [...media.image_versions2!.candidates].sort((a, b) => b.width - a.width)[0]!.url;
}

// Mirrors relay.test.ts's injectRelayBlob: Instagram embeds the Relay
// prefetch payload as a JSON <script data-sjs> tag.
function injectRelayBlob(payload: unknown): void {
  const s = document.createElement('script');
  s.setAttribute('type', 'application/json');
  s.setAttribute('data-sjs', '');
  s.textContent = JSON.stringify(payload);
  document.body.appendChild(s);
}

// Builds a minimal non-carousel post container: a permalink anchor (for
// extractShortcode) and a single "Photo by …" image whose src is a blob: URL
// — extractCurrentMediaURL resolves it as kind 'image', and nonBlobOrNull
// rejects the blob: URL, forcing the DOM path to null exactly as it would for
// an expired/placeholder src in production.
function buildContainerWithBlobImage(shortcode: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <a href="/someuser/p/${shortcode}/">permalink</a>
    <img alt="Photo by Someone on Jan 1, 2026." src="blob:http://localhost/deadbeef">
  `;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = '';
  sendMessage.mockClear();
  alertWarn.mockClear();
});

describe('PostDownloader.onClick — image branch relay fallback', () => {
  it('resolves via the permalink web_info relay shape when the DOM URL is blob:', async () => {
    const shortcode = 'DWpUzi1DeyI';
    injectRelayBlob(singlepost);
    const container = buildContainerWithBlobImage(shortcode);

    await new PostDownloader().onClick(container);

    expect(alertWarn).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const req = sendMessage.mock.calls[0]![0];
    expect(req.mediaKind).toBe('image');
    expect(req.mediaURL).toBe(widestURL(singlepost, 'web_info'));
    // Widest (1440) candidate, not one of the narrower (1080) ones also
    // present in the fixture.
    const narrower =
      singlepost.xdt_api__v1__media__shortcode__web_info.items[0]!.image_versions2!.candidates.find(
        (c) => c.width === 1080,
      )!.url;
    expect(req.mediaURL).not.toBe(narrower);
  });

  it('resolves via the feed timeline relay shape when the DOM URL is blob:', async () => {
    const shortcode = 'DYFRW_DDicn';
    injectRelayBlob(feed);
    const container = buildContainerWithBlobImage(shortcode);

    await new PostDownloader().onClick(container);

    expect(alertWarn).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const req = sendMessage.mock.calls[0]![0];
    expect(req.mediaKind).toBe('image');
    expect(req.mediaURL).toBe(widestURL(feed, 'feed'));
  });

  it('leaves the DOM path untouched when it already yields a usable (non-blob) URL', async () => {
    const shortcode = 'DWpUzi1DeyI';
    // Inject a relay blob whose image URL differs from the DOM's, so a wrong
    // implementation that always preferred relay would be caught.
    injectRelayBlob(singlepost);

    const div = document.createElement('div');
    div.innerHTML = `
      <a href="/someuser/p/${shortcode}/">permalink</a>
      <img alt="Photo by Someone on Jan 1, 2026." src="https://dom.cdninstagram.com/dom-src.jpg">
    `;
    document.body.appendChild(div);

    await new PostDownloader().onClick(div);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const req = sendMessage.mock.calls[0]![0];
    expect(req.mediaURL).toBe('https://dom.cdninstagram.com/dom-src.jpg');
    expect(req.mediaURL).not.toBe(widestURL(singlepost, 'web_info'));
  });

  it('falls through to the existing "could not locate media" toast when relay has no match either', async () => {
    const container = buildContainerWithBlobImage('noMatchingShortcode');
    // No relay blob injected at all — extractAllSlidesFromRelay returns [].

    await new PostDownloader().onClick(container);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(alertWarn).toHaveBeenCalledWith('Could not locate media in this post');
  });
});
