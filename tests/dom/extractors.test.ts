import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractAuthor, extractCurrentMediaURL, queryByPriority } from '../../src/core/extractors';
import { AUTHOR_LINK, POST_IMG } from '../../src/core/selectors';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'dom');

// Saved-page snapshots rewrite the live page's relative anchor hrefs
// (`/igndotcom/`) to absolute (`https://www.instagram.com/igndotcom/`). The
// extension runs against the live relative form, and AUTHOR_LINK anchors on
// `href^="/"`, so normalize back to relative to reproduce the runtime DOM.
function loadDoc(name: string, { relativizeHrefs = false } = {}): Document {
  let html = readFileSync(join(fixturesDir, `${name}.html`), 'utf8');
  if (relativizeHrefs) {
    html = html.replace(/href="https:\/\/www\.instagram\.com\//g, 'href="/');
  }
  const win = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
    },
  });
  win.document.write(html);
  return win.document as unknown as Document;
}

const POST_ALT_PREFIX = /^(Photo by |May be |Photo shared by )/;

describe('queryByPriority honors array order, not document order', () => {
  it('returns the first array match even when a later selector matches earlier in the DOM', () => {
    const win = new Window();
    const doc = win.document as unknown as Document;
    // Document order: the <a> comes before the <span>.
    doc.body.innerHTML =
      '<div id="scope"><a id="broad">first</a><span id="specific">second</span></div>';
    const scope = doc.getElementById('scope')!;
    const selectors = ['span', 'a'] as const; // specific-first, but <a> is earlier in the DOM

    // The comma-join returns the first *document-order* match — the <a>.
    expect(scope.querySelector(selectors.join(','))!.id).toBe('broad');
    // queryByPriority returns the first *array-order* match — the <span>.
    expect(queryByPriority(scope, selectors)!.id).toBe('specific');
  });

  it('returns null when nothing matches', () => {
    const win = new Window();
    const doc = win.document as unknown as Document;
    doc.body.innerHTML = '<div id="scope"><p>x</p></div>';
    expect(queryByPriority(doc.getElementById('scope')!, ['a', 'span'])).toBe(null);
  });
});

// Post owner as shown in each feed snapshot, per <article> in DOM order.
const FEED_AUTHORS: ReadonlyArray<{ name: string; owners: readonly string[] }> = [
  { name: 'Instagram_mainfeed', owners: ['igndotcom', 'colbertlateshow', 'universe.mania'] },
  { name: 'Instagram_singlepostfeed', owners: ['igndotcom'] },
  { name: 'Instagram_videofeed', owners: ['igndotcom'] },
  { name: 'Instagram_multiplepostfeed', owners: ['igndotcom'] },
];

describe('extractAuthor resolves the post owner from the header/owner anchor', () => {
  for (const { name, owners } of FEED_AUTHORS) {
    it(`${name}: each article resolves to its owner username`, () => {
      const doc = loadDoc(name, { relativizeHrefs: true });
      const articles = Array.from(doc.querySelectorAll('article'));
      expect(articles).toHaveLength(owners.length);
      articles.forEach((article, i) => {
        expect(extractAuthor(article as unknown as HTMLElement)).toBe(owners[i]);
      });
    });
  }

  it('AUTHOR_LINK order is specific-first (header owner before generic username link)', () => {
    // Guards the array-order contract queryByPriority relies on: the header
    // anchor selector must precede the broad `a[href$="/"]` fallback.
    expect(AUTHOR_LINK[0]).toContain('header');
    expect(AUTHOR_LINK[1]).not.toContain('header');
  });
});

// Every post-bearing snapshot; channelfeed has no post action bar, so it's out.
const POST_SNAPSHOTS = [
  'Instagram_mainfeed',
  'Instagram_singlepostfeed',
  'Instagram_videofeed',
  'Instagram_multiplepostfeed',
  'Instagram_singlepost',
  'Instagram_multiplepost',
  'Instagram_video',
  'Instagram_multiplepost_2',
] as const;

describe('image extraction prefers alt^="Photo by"-family over broad fallbacks', () => {
  for (const name of POST_SNAPSHOTS) {
    it(`${name}: queryByPriority picks an auto-generated post image, not a caption/avatar image`, () => {
      const doc = loadDoc(name);
      const img = queryByPriority(doc, POST_IMG) as HTMLImageElement | null;
      expect(img).not.toBe(null);
      // A specific selector (one of the three alt prefixes) won over the broad
      // final fallback — that fallback would match author-captioned images and
      // localized avatars in earlier document positions.
      expect(img!.getAttribute('alt') ?? '').toMatch(POST_ALT_PREFIX);
    });
  }

  it('Spanish (?hl=es) snapshot: does not pick a localized profile-picture avatar', () => {
    // The broad fallback excludes avatars only by English alt suffixes, so a
    // Spanish "Foto del perfil de …" avatar slips through and — being earlier
    // in the DOM — is what querySelector(join) returns. queryByPriority must
    // prefer the "Photo by …" post image instead.
    const doc = loadDoc('Instagram_multiplepost_2');
    const joined = doc.querySelector(POST_IMG.join(',')) as HTMLImageElement | null;
    expect(joined!.getAttribute('alt') ?? '').toMatch(/^Foto del perfil/); // demonstrates the bug

    const img = queryByPriority(doc, POST_IMG) as HTMLImageElement | null;
    expect(img!.getAttribute('alt') ?? '').toMatch(POST_ALT_PREFIX);
    expect(img!.getAttribute('alt') ?? '').not.toMatch(/^Foto del perfil/);
  });
});

// Stubs getBoundingClientRect so pickActiveSlide (overlap-based) is deterministic
// in happy-dom, where layout is not computed. `rect` gives {left,right}; the
// active slide is the one whose horizontal span overlaps the viewport most.
function stubRect(el: Element, left: number, right: number): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0 }) as DOMRect;
}

describe('extractCurrentMediaURL resolves the active slide, never silently falling to slide 0', () => {
  function buildCarousel(): { doc: Document; scope: HTMLElement; ul: HTMLUListElement } {
    const win = new Window({ settings: { disableComputedStyleRendering: true } });
    const doc = win.document as unknown as Document;
    // Slide 0: an ordinary "Photo by …" image (matches POST_IMG). Slide 1: an
    // image with alt="" and a cdninstagram src — accepted by CAROUSEL_SLIDE_MEDIA
    // (so it's recognized as a slide) but rejected by POST_IMG (:not([alt=""])).
    doc.body.innerHTML = `
      <div id="scope">
        <ul>
          <li><img alt="Photo by IGN on May 07, 2026." src="https://slide0.cdninstagram.com/slide0.jpg"></li>
          <li><img alt="" src="https://slide1.cdninstagram.com/slide1.jpg"></li>
        </ul>
      </div>`;
    const scope = doc.getElementById('scope') as unknown as HTMLElement;
    const ul = scope.querySelector('ul') as unknown as HTMLUListElement;
    return { doc, scope, ul };
  }

  it('returns the active slide’s own cdninstagram URL when POST_IMG cannot re-find its media', () => {
    const { scope, ul } = buildCarousel();
    const [li0, li1] = Array.from(ul.querySelectorAll('li'));
    // Make slide 1 the visually active slide (fully overlapping the viewport),
    // slide 0 scrolled off to the left (no overlap).
    stubRect(scope, 0, 100); // viewport (ul.parentElement) rect
    stubRect(li0!, -100, 0);
    stubRect(li1!, 0, 100);

    const result = extractCurrentMediaURL(scope);
    expect(result).toEqual({ url: 'https://slide1.cdninstagram.com/slide1.jpg', kind: 'image' });
    // Regression guard: must NOT be slide 0's URL (the container's first image,
    // which scope-level extraction would have silently returned before the fix).
    expect(result!.url).not.toContain('slide0');
  });

  it('single post (no carousel) still resolves via scope-level extraction', () => {
    const win = new Window({ settings: { disableComputedStyleRendering: true } });
    const doc = win.document as unknown as Document;
    // No <ul> carrying media → findActiveCarouselSlide returns null → scope path.
    doc.body.innerHTML = `
      <div id="scope">
        <img alt="Photo by IGN on May 07, 2026." src="https://single.cdninstagram.com/only.jpg">
      </div>`;
    const scope = doc.getElementById('scope') as unknown as HTMLElement;

    expect(extractCurrentMediaURL(scope)).toEqual({
      url: 'https://single.cdninstagram.com/only.jpg',
      kind: 'image',
    });
  });
});
