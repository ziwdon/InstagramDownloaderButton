# Tests

`vitest` suite for the extension's pure logic and DOM selectors. Run with
`npm test` (single run) or `npm run test:watch`. Config lives in
`vitest.config.ts` at the repo root (standalone from `wxt.config.ts`;
`happy-dom` environment).

## Layout

- `tests/unit/` — pure-logic tests, no live browser needed:
  - `shortcode.test.ts` — `shortcodeToMediaId()` base-64 math + real
    shortcode→media-id round trips.
  - `filename.test.ts` — `buildFilename()`/`guessExtension()`/`sanitize()`
    from `src/background/filename.ts`.
  - `url-router.test.ts` — `classify()` route detection across the permalink
    URL family.
  - `relay.test.ts` — `relay.ts` traversal, driven by injecting fixture JSON
    into a `data-sjs` `<script>` blob (the same shape Instagram embeds).
- `tests/dom/` — DOM selector smoke tests over per-variant HTML fixtures.
- `tests/fixtures/` — committed test data (see below).

## Fixtures

The live-page snapshots in `references/` are **gitignored and multi-MB**, so
they are never loaded by the tests directly. `scripts/extract-fixtures.mjs`
derives small, committed fixtures from a local `references/` directory:

```bash
node scripts/extract-fixtures.mjs /abs/path/to/references
```

- `fixtures/dom/*.html` — each snapshot with `<script>/<style>/<link>/
  <noscript>` removed. Those tags hold the byte bulk (Relay JSON blobs, inline
  CSS) and are irrelevant to CSS-selector queries, so stripping them preserves
  DOM fidelity for selector tests while shrinking files ~5-10x.
- `fixtures/relay/*.json` — trimmed Relay media payloads (only the fields
  `relay.ts` reads: `code`, `pk`, `video_versions`, top-3 `image_versions2`
  candidates, `carousel_media`). One shared `feed_timeline.json` covers the
  feed path; per-permalink `*.web_info.json` cover the shortcode path.

## `:has()` limitation

`happy-dom` (v20) supports single-level `:has()` but not **nested** `:has()`.
`SAVE_SVG`/`LIKE_SVG` (single-level) test fine, but the `ACTION_BAR` constant
(`section:has(svg:has(...))`) matches nothing in happy-dom even via its plain
aria-label branch. That literal-selector assertion is a documented `it.skip`;
action-bar resolution is instead verified through the `closest('section')`
path that `PostDownloader` actually uses first. Real Chrome/Firefox support
nested `:has()`, so the selector itself is fine in production.
