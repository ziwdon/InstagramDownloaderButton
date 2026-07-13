import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractAuthor, queryByPriority } from '../../src/core/extractors';
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
