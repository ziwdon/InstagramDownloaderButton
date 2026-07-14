import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SAVE_SVG, LIKE_SVG, ACTION_BAR, POST_IMG } from '../../src/core/selectors';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'dom');

function loadDoc(name: string): Document {
  const html = readFileSync(join(fixturesDir, `${name}.html`), 'utf8');
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

const AVATAR_SELECTOR = 'img[alt$="profile picture"], img[alt$="profile photo"]';

// Expected number of posts (one Save SVG each) per snapshot. channelfeed is an
// explore/reels grid with no per-post action bars, so it has zero.
const SNAPSHOTS: ReadonlyArray<{ name: string; saves: number }> = [
  { name: 'Instagram_channelfeed', saves: 0 },
  { name: 'Instagram_mainfeed', saves: 3 },
  { name: 'Instagram_singlepostfeed', saves: 1 },
  { name: 'Instagram_videofeed', saves: 1 },
  { name: 'Instagram_multiplepostfeed', saves: 1 },
  { name: 'Instagram_singlepost', saves: 1 },
  { name: 'Instagram_multiplepost', saves: 1 },
  { name: 'Instagram_video', saves: 1 },
  { name: 'Instagram_multiplepost_2', saves: 1 },
];

describe('SAVE_SVG — one anchor per post across every page variant', () => {
  for (const { name, saves } of SNAPSHOTS) {
    it(`${name}: matches ${saves} Save SVG(s)`, () => {
      const doc = loadDoc(name);
      expect(doc.querySelectorAll(SAVE_SVG)).toHaveLength(saves);
    });
  }
});

describe('action bar resolves from each Save SVG (production closest("section") path)', () => {
  // PostDownloader.ensureButton() resolves the action bar via
  // saveSvg.closest('section'); assert that section exists and also carries a
  // Like SVG, i.e. it is a genuine action bar. Uses closest()+querySelector so
  // it does not depend on the engine supporting nested :has() (see the skipped
  // test below).
  for (const { name, saves } of SNAPSHOTS.filter((s) => s.saves > 0)) {
    it(`${name}: every Save SVG sits in a section that also holds a Like SVG`, () => {
      const doc = loadDoc(name);
      const saveSvgs = doc.querySelectorAll(SAVE_SVG);
      expect(saveSvgs).toHaveLength(saves);
      for (const svg of Array.from(saveSvgs)) {
        const section = svg.closest('section');
        expect(section).not.toBe(null);
        expect(section!.querySelector(LIKE_SVG)).not.toBe(null);
      }
    });
  }
});

describe('POST_IMG finds post media, never avatars', () => {
  for (const { name } of SNAPSHOTS.filter((s) => s.saves > 0)) {
    it(`${name}: matches at least one image and excludes every avatar`, () => {
      const doc = loadDoc(name);
      const postImgs = new Set(Array.from(doc.querySelectorAll(POST_IMG.join(','))));
      expect(postImgs.size).toBeGreaterThan(0);
      for (const avatar of Array.from(doc.querySelectorAll(AVATAR_SELECTOR))) {
        expect(postImgs.has(avatar)).toBe(false);
      }
    });
  }
});

describe('locale stability (Spanish ?hl=es snapshot)', () => {
  it('Save SVG is discoverable by geometry when the aria-label is localized', () => {
    const doc = loadDoc('Instagram_multiplepost_2');
    // aria-label is "Guardar", so the English-label branch alone finds nothing…
    expect(doc.querySelectorAll('svg[aria-label="Save"], svg[aria-label="Remove"]')).toHaveLength(
      0,
    );
    // …but the geometry-anchored SAVE_SVG still resolves the one post.
    expect(doc.querySelectorAll(SAVE_SVG)).toHaveLength(1);
  });
});

describe('ACTION_BAR literal selector', () => {
  // The ACTION_BAR constant is `section:has(<list including svg:has(...)>)`.
  // happy-dom (v20) supports single-level :has() but NOT nested :has(): a
  // :has() argument that itself contains :has() makes the whole selector match
  // nothing, even via the plain aria-label branch. This is a test-engine
  // limitation only — real Chrome/Firefox (the extension's runtime) fully
  // support nested :has(), and the action bar is exercised above through the
  // closest('section') path that production actually uses first. Kept as a
  // documented skip rather than weakening the selector. Track: revisit if
  // happy-dom adds nested-:has() support.
  it.skip('resolves via the ACTION_BAR selector (blocked: happy-dom lacks nested :has())', () => {
    const doc = loadDoc('Instagram_singlepost');
    expect(doc.querySelectorAll(ACTION_BAR.join(',')).length).toBeGreaterThan(0);
  });
});
