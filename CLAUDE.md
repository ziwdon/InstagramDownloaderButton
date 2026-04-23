# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A browser extension that adds a one-click download button to individual Instagram posts. Supports Chrome and Firefox via Manifest V3. Built with `wxt` (Vite-based), TypeScript 5 strict, ESLint + Prettier. The `migration/mv3` branch is the active development branch; `master` is the upstream baseline.

Features in scope: per-post download button (images and videos). Out of scope (removed): `Ctrl+Shift+D` hotkey, bulk downloader, story downloader, account-image downloader, options UI.

## Build commands

```bash
npm install

npm run dev              # wxt dev server (Chrome)
npm run dev:firefox      # wxt dev server (Firefox)
npm run build            # build Chrome MV3 + Firefox MV3 → .output/
npm run zip              # build + store-ready zips
npm run typecheck        # tsc --noEmit
npm run lint             # eslint + prettier check
npm run lint:fix         # eslint --fix + prettier --write
npm run amo-lint         # addons-linter on .output/firefox-mv3-zip/*.zip
```

Build outputs: `.output/chrome-mv3/` and `.output/firefox-mv3/` (unpacked), `.output/*-zip/` (store-ready). No `dist/` or `zip/` directories.

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
4. Each scan finds every `<article>` and calls `ensureButton()`, which anchors the download `<button>` next to the Save/Bookmark button in the action bar.
5. On click, `extractCurrentMediaURL()` reads the active carousel slide (or the whole article for single posts). For images it picks the highest-resolution `srcset` entry; for videos it returns the `<video>` element's `currentSrc` with `kind: 'video'`.
6. For video posts, `PostDownloader.onClick()` first tries `extractVideoURLFromRelay()` (reads the Relay prefetch JSON already embedded in page `<script>` tags), then falls back to `fetchVideoURLFromAPI()` (hits `/api/v1/media/{id}/info/` with session cookies). On failure, shows a toast and aborts.
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
    extractors.ts         # pulls mediaURL / author / shortcode from an <article>
    relay.ts              # video URL extraction: relay cache reader + API fallback
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
references/               # HTML dumps of live Instagram pages — use to validate selectors
```

### Selectors (`src/core/selectors.ts`)

All Instagram DOM queries live here. **Instagram rotates its atomic CSS class names** — never hard-code classes like `.M9sTE`. All selectors use semantic anchors (ARIA labels, roles, structural patterns). Each exported constant is a string or `readonly string[]` (joined with `,` at call sites).

Key selectors:
- `POST_ARTICLE` — the `<article>` boundary (modal, permalink, feed variants)
- `SAVE_SVG` — `svg[aria-label="Save"], svg[aria-label="Remove"]` — anchor for button insertion
- `CAROUSEL_ACTIVE` — `ul > li:not([tabindex="-1"])` — current carousel slide
- `POST_IMG` — images by alt-text prefix (`"Photo by "`, `"May be "`) or `fbcdn` src fallback
- `POST_VIDEO` — `video` — detects video posts; triggers relay/API resolution path
- `RELAY_JSON_SCRIPTS` — `script[type="application/json"][data-sjs]` — Relay prefetch blobs embedded in the page

If a selector breaks: update `src/core/selectors.ts`, verify against HTML in `references/`, and prefer structural/ARIA selectors over class names.

### Message types (`src/core/messages.ts`)

All cross-context communication is typed via `ExtensionMessage = DownloadRequest | AlertPush | LocationChange`. The background only handles `kind === 'download'`; the `AlertPush` and `LocationChange` types are reserved for potential future relay use.

### Video extraction (`src/core/relay.ts`)

Video CDN URLs are not in `srcset` — the `<video>` element only exposes an HLS blob or a short-lived URL that often fails to download. The real MP4 URL comes from the Instagram Relay GraphQL cache embedded in the page as `<script type="application/json" data-sjs>` tags.

Resolution order in `PostDownloader.onClick()`:
1. `extractVideoURLFromRelay(shortcode)` — scans those `<script>` tags for `xdt_api__v1__media__shortcode__web_info`, finds the matching `code`, picks the best `video_versions` entry (prefers `type === 101`).
2. If that misses, `extractMediaIdFromRelay(shortcode)` gets the numeric `pk`, then `fetchVideoURLFromAPI(mediaId)` hits `https://www.instagram.com/api/v1/media/{id}/info/` with `credentials: 'include'`.
3. If both fail, a toast is shown and the download is aborted.

The API fetch runs in the content script (not the background), so session cookies are available automatically.

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
