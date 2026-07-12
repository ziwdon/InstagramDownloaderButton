import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractAllSlidesFromRelay,
  relaySlideMatchesURL,
  fetchVideoURLFromAPI,
  type RelaySlide,
} from '../../src/core/relay';
import singlepost from '../fixtures/relay/Instagram_singlepost.web_info.json';
import videoInfo from '../fixtures/relay/Instagram_video.web_info.json';
import carousel from '../fixtures/relay/Instagram_multiplepost.web_info.json';
import esCarousel from '../fixtures/relay/Instagram_multiplepost_2.web_info.json';
import feed from '../fixtures/relay/feed_timeline.json';

interface FixtureMedia {
  code: string;
  pk: string;
  video_versions?: { url: string; type: number }[];
  image_versions2?: { candidates: { url: string; width: number }[] };
  carousel_media?: FixtureMedia[];
}

function webInfoItem(fixture: unknown): FixtureMedia {
  const f = fixture as { xdt_api__v1__media__shortcode__web_info: { items: FixtureMedia[] } };
  return f.xdt_api__v1__media__shortcode__web_info.items[0]!;
}

// Mirror how Instagram embeds the Relay prefetch payload: a JSON <script> blob
// carrying the data-sjs attribute. relay.ts reads these via RELAY_JSON_SCRIPTS.
function injectRelayBlob(payload: unknown): void {
  const s = document.createElement('script');
  s.setAttribute('type', 'application/json');
  s.setAttribute('data-sjs', '');
  s.textContent = JSON.stringify(payload);
  document.body.appendChild(s);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractAllSlidesFromRelay — permalink web_info path', () => {
  it('returns one image slide for a single-image post, no video URL', () => {
    injectRelayBlob(singlepost);
    const slides = extractAllSlidesFromRelay('DWpUzi1DeyI');
    expect(slides).toHaveLength(1);
    const slide = slides[0]!;
    expect(slide.videoURL).toBe(null);
    expect(slide.pk).toBe('3866713258095144072');
    // Best image is the widest candidate.
    const item = webInfoItem(singlepost);
    const widest = [...item.image_versions2!.candidates].sort((a, b) => b.width - a.width)[0]!;
    expect(slide.imageURL).toBe(widest.url);
    expect(slide.imageURLs).toHaveLength(item.image_versions2!.candidates.length);
  });

  it('resolves a video slide and prefers the type-101 version', () => {
    injectRelayBlob(videoInfo);
    const slides = extractAllSlidesFromRelay('DYDIEQsAJM9');
    expect(slides).toHaveLength(1);
    const item = webInfoItem(videoInfo);
    const v101 = item.video_versions!.find((v) => v.type === 101)!;
    expect(slides[0]!.videoURL).toBe(v101.url);
  });

  it('returns one slide per carousel entry (7-slide post)', () => {
    injectRelayBlob(carousel);
    const slides = extractAllSlidesFromRelay('DYDATO-icDf');
    expect(slides).toHaveLength(7);
    expect(slides.every((s) => s.imageURL !== null || s.videoURL !== null)).toBe(true);
  });

  it('handles the Spanish-locale carousel identically (20 slides)', () => {
    injectRelayBlob(esCarousel);
    const slides = extractAllSlidesFromRelay('DWyCSlHCgoB');
    expect(slides).toHaveLength(20);
  });

  it('returns [] when the shortcode does not match any item', () => {
    injectRelayBlob(singlepost);
    expect(extractAllSlidesFromRelay('doesNotExist')).toEqual([]);
  });

  it('returns [] when no relay blob is present in the document', () => {
    expect(extractAllSlidesFromRelay('DWpUzi1DeyI')).toEqual([]);
  });
});

describe('extractAllSlidesFromRelay — feed timeline path', () => {
  it('finds a post by code inside the feed connection edges', () => {
    injectRelayBlob(feed);
    const slides = extractAllSlidesFromRelay('DYFRW_DDicn');
    expect(slides).toHaveLength(1);
    expect(slides[0]!.pk).toBe('3892593799247832871');
  });

  it('does not match a feed post when the code differs', () => {
    injectRelayBlob(feed);
    expect(extractAllSlidesFromRelay('someOtherCode')).toEqual([]);
  });
});

describe('relaySlideMatchesURL', () => {
  const slide: RelaySlide = {
    videoURL: null,
    imageURL: 'https://cdn/v/t51/12345678901_n.jpg',
    imageURLs: ['https://cdn/v/t51/12345678901_n.jpg'],
    pk: '1',
  };

  it('matches when the DOM URL shares the long numeric asset id', () => {
    expect(relaySlideMatchesURL(slide, 'https://cdn/v/other/12345678901_n.jpg?x=1')).toBe(true);
  });

  it('does not match an unrelated asset id', () => {
    expect(relaySlideMatchesURL(slide, 'https://cdn/v/t51/99999999999_n.jpg')).toBe(false);
  });

  it('returns false for a null DOM URL', () => {
    expect(relaySlideMatchesURL(slide, null)).toBe(false);
  });
});

describe('fetchVideoURLFromAPI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the type-101 video URL from the API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              video_versions: [
                { url: 'https://cdn/lo.mp4', type: 102 },
                { url: 'https://cdn/hi.mp4', type: 101 },
              ],
            },
          ],
        }),
      }),
    );
    await expect(fetchVideoURLFromAPI('123')).resolves.toBe('https://cdn/hi.mp4');
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(fetchVideoURLFromAPI('123')).resolves.toBe(null);
  });

  it('returns null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(fetchVideoURLFromAPI('123')).resolves.toBe(null);
  });
});
