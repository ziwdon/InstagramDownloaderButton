/**
 * One-off fixture extractor (NOT run in CI). Run manually with:
 *   node scripts/extract-fixtures.mjs /abs/path/to/references
 *
 * The live-page snapshots in `references/` are gitignored and multi-MB. This
 * script derives two kinds of small, committed test fixtures from them:
 *
 *  - tests/fixtures/dom/*.html  — each snapshot with <script>/<style>/<link>/
 *    <noscript> stripped. Those tags hold the bulk of the bytes (the Relay
 *    `data-sjs` JSON blobs, inline CSS) and are irrelevant to CSS-selector
 *    queries, so removing them preserves 100% DOM fidelity for selector tests
 *    while cutting size by ~5-10x.
 *
 *  - tests/fixtures/relay/*.json — the trimmed Relay media payload for the
 *    permalink/feed snapshots, keeping only the fields relay.ts reads
 *    (code, pk, video_versions, image_versions2.candidates, carousel_media).
 */
import { Window } from 'happy-dom';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const refsDir = process.argv[2];
if (!refsDir) {
  console.error('usage: node scripts/extract-fixtures.mjs <references-dir>');
  process.exit(1);
}

const here = new URL('.', import.meta.url).pathname;
const domOut = join(here, '..', 'tests', 'fixtures', 'dom');
const relayOut = join(here, '..', 'tests', 'fixtures', 'relay');
mkdirSync(domOut, { recursive: true });
mkdirSync(relayOut, { recursive: true });

const SAVE_SVG =
  'svg[aria-label="Save"], svg[aria-label="Remove"], svg:has(polygon[points="20 21 12 13.44 4 21 4 3 20 3 20 21"])';

function trimMedia(m) {
  if (!m || typeof m !== 'object') return undefined;
  const out = {};
  if (m.code !== undefined) out.code = m.code;
  if (m.pk !== undefined) out.pk = String(m.pk);
  if (Array.isArray(m.video_versions)) {
    out.video_versions = m.video_versions.map((v) => ({ url: v.url, type: v.type }));
  }
  if (m.image_versions2?.candidates) {
    // Keep only the top 3 candidates by width — pickBestImageURL() just needs
    // the widest, and this keeps fixtures small.
    const top = [...m.image_versions2.candidates]
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
      .slice(0, 3)
      .map((c) => ({ url: c.url, width: c.width }));
    out.image_versions2 = { candidates: top };
  }
  if (Array.isArray(m.carousel_media)) {
    out.carousel_media = m.carousel_media.map(trimMedia);
  }
  return out;
}

function deepFind(obj, key, depth = 0) {
  if (depth > 30 || obj === null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const f = deepFind(it, key, depth + 1);
      if (f !== undefined) return f;
    }
    return undefined;
  }
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const f = deepFind(v, key, depth + 1);
    if (f !== undefined) return f;
  }
  return undefined;
}

let feedFixtureWritten = false;
const files = readdirSync(refsDir)
  .filter((f) => f.endsWith('.html'))
  .sort();
for (const file of files) {
  const name = basename(file, '.html');
  const html = readFileSync(join(refsDir, file), 'utf8');
  const win = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
    },
  });
  const doc = win.document;
  doc.write(html);

  // ---- relay extraction (before stripping scripts) ----
  const scripts = doc.querySelectorAll('script[type="application/json"][data-sjs]');
  let webInfoItems = null;
  let feedFirstMedia = null;
  for (const s of scripts) {
    let data;
    try {
      data = JSON.parse(s.textContent ?? '');
    } catch {
      continue;
    }
    if (!webInfoItems) {
      const wi = deepFind(data, 'xdt_api__v1__media__shortcode__web_info');
      if (wi?.items?.length) webInfoItems = wi.items;
    }
    if (!feedFirstMedia) {
      const conn = deepFind(data, 'xdt_api__v1__feed__timeline__connection');
      const edges = conn?.edges;
      if (Array.isArray(edges)) {
        for (const e of edges) {
          const media = e?.node?.media;
          if (media?.code) {
            feedFirstMedia = media;
            break;
          }
        }
      }
    }
  }
  if (webInfoItems) {
    const trimmed = {
      xdt_api__v1__media__shortcode__web_info: { items: webInfoItems.map(trimMedia) },
    };
    writeFileSync(join(relayOut, `${name}.web_info.json`), JSON.stringify(trimmed, null, 2) + '\n');
    console.log(`relay web_info: ${name} (${webInfoItems.length} item(s))`);
  }
  if (feedFirstMedia && !feedFixtureWritten) {
    // All feed snapshots captured the same top post, so one feed-path fixture
    // is enough to exercise findItemFromFeedTimeline().
    const trimmed = {
      xdt_api__v1__feed__timeline__connection: {
        edges: [{ node: { media: trimMedia(feedFirstMedia) } }],
      },
    };
    writeFileSync(join(relayOut, `feed_timeline.json`), JSON.stringify(trimmed, null, 2) + '\n');
    console.log(`relay feed: feed_timeline.json (from ${name}, code=${feedFirstMedia.code})`);
    feedFixtureWritten = true;
  }

  // ---- DOM fixture: strip heavy, selector-irrelevant tags ----
  const before = doc.querySelectorAll(SAVE_SVG).length;
  for (const el of doc.querySelectorAll('script, style, link, noscript')) el.remove();
  const after = doc.querySelectorAll(SAVE_SVG).length;
  const outHtml = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
  writeFileSync(join(domOut, `${name}.html`), outHtml);
  console.log(
    `dom: ${name}  SAVE_SVG before=${before} after=${after}  size=${(outHtml.length / 1024).toFixed(0)}KB`,
  );
  win.close?.();
}
