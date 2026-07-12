# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A browser extension that adds a one-click download button to individual Instagram posts. Supports Chrome and Firefox via Manifest V3. Built with `wxt` (Vite-based), TypeScript 5 strict, ESLint + Prettier. `master` is the main branch.

Features in scope: per-post download button (images and videos). Out of scope (removed): `Ctrl+Shift+D` hotkey, bulk downloader, story downloader, account-image downloader, options UI.

## Build commands

```bash
npm install
npx wxt prepare          # generates .wxt/tsconfig.json — required before typecheck/build on fresh checkout

npm run dev              # wxt dev server (Chrome)
npm run dev:firefox      # wxt dev server (Firefox)
npm run build            # build Chrome MV3 + Firefox MV3 → .output/
npm run zip              # build + store-ready zips
npm run typecheck        # tsc --noEmit
npm run test             # vitest run (unit + DOM-selector suite)
npm run test:watch       # vitest (watch mode)
npm run lint             # eslint + prettier check
npm run lint:fix         # eslint --fix + prettier --write
npm run amo-lint         # addons-linter on .output/firefox-mv3-zip/*.zip
```

Build outputs: `.output/chrome-mv3/` and `.output/firefox-mv3/` (unpacked), `.output/*-zip/` (store-ready). No `dist/` or `zip/` directories.

### Testing

A `vitest` suite covers the extension's pure logic and DOM selectors; live-Instagram
manual smoke testing is still needed for end-to-end download behavior (network,
`browser.downloads`, Instagram's live DOM). Config: `vitest.config.ts` (standalone;
`happy-dom` environment). Tests live in `tests/` (see `tests/README.md`). Three tiers:

1. **Pure logic** (`tests/unit/`): `shortcodeToMediaId()`, `buildFilename()`
   (`src/background/filename.ts` — extracted from `download.ts` so it is testable
   without the `webextension-polyfill` import, which throws outside an extension),
   `classify()` (URL routing), and the `relay.ts` traversal fed with trimmed fixture
   JSON.
2. **DOM selectors** (`tests/dom/`): loads per-variant HTML fixtures and asserts
   `SAVE_SVG` count per post, action-bar resolution (via the `closest('section')` path
   production uses), `POST_IMG` finding post media but never avatars, and locale
   stability on the Spanish snapshot.
3. CI runs `npm test` between typecheck and build (`ci.yml`).

**Fixtures** (`tests/fixtures/`): `references/*.html` is gitignored and multi-MB, so it
is NOT loaded directly. `scripts/extract-fixtures.mjs` (run manually against a local
`references/` dir) derives small committed fixtures: `fixtures/dom/*.html` (snapshots
with `<script>/<style>/<link>` stripped — irrelevant to selector queries, ~5-10x
smaller) and `fixtures/relay/*.json` (trimmed Relay payloads). Regenerate with
`node scripts/extract-fixtures.mjs /path/to/references`.

**`:has()` caveat:** `happy-dom` (v20) supports single-level `:has()` but NOT nested
`:has()`, so the `ACTION_BAR` constant (`section:has(svg:has(...))`) cannot be tested
as a literal selector — that assertion is a documented `it.skip`. `SAVE_SVG`/`LIKE_SVG`
(single-level `:has()`) test fine, and action-bar resolution is covered via
`closest('section')`, which is production's primary path anyway.

## Releasing

Releases are automatic. To cut a release:
1. Bump `version` in both `package.json` and `wxt.config.ts`.
2. Commit and merge to `master`.

The `publish.yml` workflow detects the version bump (compares `package.json` against the latest `v*` tag), creates the tag, builds the Firefox extension, signs it via `web-ext sign`, creates a GitHub Release, and deploys `updates.json` to GitHub Pages. No manual tagging needed.

**One-time repo setup (for forks):** Add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` as repository secrets (from addons.mozilla.org → API key page). Enable GitHub Pages with source set to "GitHub Actions" and allow the `master` branch in the `github-pages` environment's deployment rules.

## CI

Every push and PR runs lint → typecheck → test → build → zip. Build artifacts (`.output/**/*.zip`) are uploaded as a GitHub Actions artifact named `extension-zips`. See `ci.yml`.

## Architecture

### Execution contexts

The extension has three execution contexts:

1. **`entrypoints/main-world.content.ts`** — runs in the page's MAIN world at `document_start`. Patches `history.pushState`/`replaceState` and dispatches a synthetic `locationchange` event on `window`. This is the only way to intercept Instagram's SPA navigation without being blocked by Instagram's CSP (inline `<script>` injection is blocked in MV3).

2. **`entrypoints/content.ts`** — the ISOLATED-world content script. Boots `AddonManager`, which wires `UrlRouter` to `PostDownloader`.

3. **`entrypoints/background.ts`** — the MV3 service worker. Listens for `DownloadRequest` messages and calls `browser.downloads.download()`. Downloads must go through here because the downloads API is unavailable in content scripts.

### Runtime flow

1. MAIN-world script fires `locationchange` on every SPA navigation.
2. `UrlRouter` classifies `location.href` into a `Route` (`home | post | reel | story | other`) and calls `AddonManager.onRoute`.
3. On `home/post/reel`, `PostDownloader.init()` is called: runs an immediate scan, then sets up a debounced `MutationObserver` on `document.body`.
4. Each scan iterates **Save SVGs** (one per post — reliable on every page variant). For each, `findPostContainer()` returns `closest('article')` for feed/modal posts, or walks up from the action bar to the smallest ancestor containing a non-action-bar, non-profile image/video — necessary because permalink (post / reel / video) pages no longer wrap posts in `<article>`. `ensureButton()` then inserts the download button next to Save in the action bar.
5. On click, the extension downloads only the **currently visible slide** (image or video). `extractCurrentMediaURL()` finds the post carousel `<ul>` (the first one whose direct `<li>` children carry post media) and picks the slide with the largest horizontal overlap with the carousel viewport (via `getBoundingClientRect`). For single posts (no carousel), it falls back to scope-level extraction. Images prefer the highest-resolution `srcset` entry; videos return `currentSrc` to be replaced by a relay/API URL.
6. For video posts, `PostDownloader.onClick()` first tries `extractAllSlidesFromRelay()` (reads the Relay prefetch JSON embedded in page `<script>` tags) and indexes into it via `findActiveSlide()`, then falls back to `fetchVideoURLFromAPI()` (hits `/api/v1/media/{id}/info/` with session cookies). On failure it shows a toast and aborts.
7. Background `handleDownload()` calls `browser.downloads.download({ url, filename })`. On Firefox, retries with an explicit `Referer` header if the first attempt fails.

### Source layout

```
entrypoints/
  background.ts           # service worker entry
  content.ts              # isolated-world content script entry
  main-world.content.ts   # MAIN-world history patcher

src/
  core/
    messages.ts           # shared message types: DownloadRequest, AlertPush, ExtensionMessage
    selectors.ts          # all Instagram DOM selectors — most fragile file
    extractors.ts         # pulls mediaURL / author / shortcode from a post container; locates active carousel slide
    relay.ts              # video URL extraction: relay cache reader + API fallback
    shortcode.ts          # shortcodeToMediaId() — base-64 decode of shortcode → numeric media ID
    logger.ts             # dev-only console wrapper (no-op in production)
  content/
    AddonManager.ts       # wires UrlRouter → PostDownloader
    UrlRouter.ts          # classifies location.href, fires onChange on route transitions
    PostDownloader.ts     # injects buttons, handles download click (images + videos)
    ui/
      Alert.ts            # DOM-constructed toast notifications (top-right)
      DownloadButton.ts   # renders the <button> with inline SVG
  background/
    download.ts           # fetch-free download via browser.downloads API
  styles/
    main.scss             # .igdl-btn button styles
    alert.scss            # .igdl-alert toast styles

public/icons/             # extension icons (referenced in wxt.config.ts manifest)
references/               # saved HTML snapshots of live Instagram pages (feed, modal, single post, video) — use for offline selector validation
                          # also contains .har captures (video_download_error.har, video_download_success.har) for debugging video URL resolution
```

### Cross-checking issues and fixes against page variants

Instagram serves materially different DOM and Relay payloads for each page type. Before declaring an issue understood or a fix complete, walk it against **every** snapshot in `references/`:

- `Instagram_mainfeed.html` — home feed (`/`)
- `Instagram_channelfeed.html` — channel/explore feed
- `Instagram_singlepostfeed.html` — single image inline in feed
- `Instagram_videofeed.html` — single video inline in feed
- `Instagram_multiplepostfeed.html` — carousel inline in feed
- `Instagram_singlepost.html` — image **permalink** (`/<user>/p/<shortcode>/`)
- `Instagram_multiplepost.html` — carousel **permalink** (`/<user>/p/<shortcode>/`)
- `Instagram_video.html` — reel/video **permalink** (`/<user>/reel/<shortcode>/`)
- `Instagram_multiplepost_2.html` — carousel permalink served with `?hl=es` (Spanish locale; aria-label/title text is translated)

For every reported defect: confirm whether the same root cause exists on each variant. A bug filed as "single post" often also affects carousel and reel permalinks (same URL family); a "feed" bug usually applies to channel feed too. For every proposed fix: confirm it doesn't regress any variant — including the modal/lightbox path (`/p/<shortcode>/` without a username segment) which is exercised when clicking a post from the home feed.

Permalink URL forms in the wild include `/<user>/p/<shortcode>/`, `/<user>/reel/<shortcode>/`, `/p/<shortcode>/` (modal), `/reel/<shortcode>/` (modal), and `/reels/<shortcode>/` (alias). Path-segment-aware classification is required; leading-prefix matching misses the username-prefixed forms.

Relay payload coverage is **SSR-only**: feed pages embed `xdt_api__v1__feed__timeline__connection` and permalinks embed `xdt_api__v1__media__shortcode__web_info`, but posts fetched after initial render (infinite scroll, tab switches) are **not** appended to the `script[data-sjs]` blobs. Any video resolution path that depends solely on relay data will be flaky for scrolled-in posts; provide a shortcode→media-id derivation fallback so `/api/v1/media/{id}/info/` can still be reached.

### Selectors (`src/core/selectors.ts`)

All Instagram DOM queries live here. **Instagram rotates its atomic CSS class names** — never hard-code classes like `.M9sTE`. All selectors use semantic anchors (ARIA labels, roles, structural patterns). Each exported constant is a string or `readonly string[]` (joined with `,` at call sites).

**Locale stability:** Instagram localizes `aria-label` and `<title>` text on every action-bar SVG when the URL carries `?hl=<locale>` ("Save" → "Guardar" in Spanish, etc.), but the SVG `polygon`/`path` geometry is identical across all locales. `SAVE_SVG`, `LIKE_SVG`, and `SHARE_SVG` therefore each OR a geometry-based selector (`svg:has(polygon[points="..."])` / `svg:has(path[d^="..."])`) with the English aria-label selector. Either anchor is sufficient — both must break for the action bar to become undiscoverable. Image extraction is unaffected by `?hl=` because Instagram's auto-generated post `alt` text (`"Photo by …"`, `"May be …"`) stays English regardless of the locale parameter.

Key selectors:
- `SAVE_SVG` — `svg[aria-label="Save"|"Remove"]` OR the unfilled-bookmark polygon — primary anchor for both button insertion and post-container discovery (one per post)
- `LIKE_SVG`, `SHARE_SVG` — same aria-label-OR-geometry pattern; used by `findActionsWrapper` in `PostDownloader.ts` to identify the actions wrapper child of the action-bar section
- `ACTION_BAR` — section containing Like/Save SVGs — the action-bar parent for inserting the button
- `POST_IMG` — images by alt-text prefix (`"Photo by "`, `"May be "`, `"Photo shared by "`), `_aagu` wrapper, or `fbcdn` src; final fallback excludes profile/avatar/highlight thumbs by alt suffix
- `POST_VIDEO` — `video` — detects video posts; triggers relay/API resolution path
- `CAROUSEL_SLIDE_MEDIA` — the per-`<li>` selector that distinguishes a real post slide from layout placeholders (used in `extractors.ts` to find the post's carousel `<ul>` among many other ULs in the page)
- `RELAY_JSON_SCRIPTS` — `script[type="application/json"][data-sjs]` — Relay prefetch blobs embedded in the page

There is no `POST_ARTICLE` constant: feed pages use `<article>` boundaries (resolved at runtime via `closest('article')`), and permalink pages have no `<article>` at all — `findPostContainer()` in `PostDownloader.ts` reconstructs the post wrapper by walking up from the Save SVG.

If a selector breaks: update `src/core/selectors.ts`, verify against HTML in `references/`, and prefer structural/ARIA selectors over class names.

### Message types (`src/core/messages.ts`)

All cross-context communication is typed via `ExtensionMessage = DownloadRequest | AlertPush | LocationChange`. The background only handles `kind === 'download'`; the `AlertPush` and `LocationChange` types are reserved for potential future relay use.

### Video extraction (`src/core/relay.ts`)

Video CDN URLs are not in `srcset` — the `<video>` element only exposes an HLS blob or a short-lived URL that often fails to download. The real MP4 URL comes from the Instagram Relay GraphQL cache embedded in the page as `<script type="application/json" data-sjs>` tags.

Resolution order in `PostDownloader.onClick()`:
1. `extractAllSlidesFromRelay(shortcode)` — scans those `<script>` tags for `xdt_api__v1__media__shortcode__web_info`, finds the matching `code`, returns one entry per slide with `video_versions` (prefers `type === 101`), `image_versions2`, and `pk`. `pickActiveRelaySlide()` picks the entry that matches `findActiveSlide()`'s carousel index.
2. If the relay slide has no `videoURL` but has a `pk`, `fetchVideoURLFromAPI(pk)` hits `https://www.instagram.com/api/v1/media/{id}/info/` with `credentials: 'include'`.
3. If both fail, the DOM `<video>.currentSrc` is used as a last resort (filtered out if it's a `blob:` URL, which can't cross the content-script → service-worker boundary). Otherwise a toast is shown and the download is aborted.

The API fetch runs in the content script (not the background), so session cookies are available automatically.

**Two relay extraction paths:** `findRelayItem()` (internal) tries both keys in order:
1. `xdt_api__v1__media__shortcode__web_info` — permalink pages (post / reel / video).
2. `xdt_api__v1__feed__timeline__connection` — feed pages (home, profile, channel). Walks `edges[*].node.media` and matches by `code === shortcode`.

### Background constraints (MV3 service worker)

- No `XMLHttpRequest`, no `URL.createObjectURL`, no `window.*`
- No blob intermediaries — CDN URLs are passed directly to `browser.downloads.download()`
- Firefox-only: retry download with `headers: [{ name: 'Referer', value: 'https://www.instagram.com/' }]` if first attempt fails
- Use `import.meta.env.BROWSER` (injected by `wxt`) to branch browser-specific behavior

### TypeScript

- Strict mode: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`
- `moduleResolution: Bundler` (TS 5), target `ES2022`
- `tsconfig.json` extends `.wxt/tsconfig.json` (generated by `wxt`)
- `@types/webextension-polyfill` for types; `import browser from 'webextension-polyfill'` for the runtime
- `import.meta.env.BROWSER` and `import.meta.env.MODE` are available everywhere (wxt injects them)
