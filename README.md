<p align="center">
  <img src="public/icons/icon-128.png" alt="Instagram Downloader Button icon" width="96" height="96" />
</p>

# Instagram Downloader Button

One-click Instagram post downloader for Chrome and Firefox (Manifest V3).

The extension injects a download button next to Instagram's Save control and downloads the currently visible media (image or video) from that post.

## Highlights

- Works on feed, modal, post permalink, and reel permalink pages
- Supports both image and video posts
- Carousel-aware: downloads the currently visible slide
- Video URL resolution with relay cache + authenticated API fallback
- MV3-compatible architecture for Chrome and Firefox

## What it does not include

- Bulk downloader
- Story downloader
- Keyboard shortcuts / options UI

## Installation

### Firefox (signed package)

Download the latest `.xpi` from [Releases](https://github.com/ziwdon/InstagramDownloaderButton/releases/latest), then open it in Firefox (or drag it onto `about:addons`).

Automatic updates are provided via `updates.json` published from this repository.

### Chrome (unpacked)

This project is currently distributed for Chrome as an unpacked extension.

1. Build the extension:
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select `.output/chrome-mv3/`

## Usage

1. Open any Instagram post page (feed card, modal, `/p/...`, or `/reel/...`)
2. Click the extension download button next to Save
3. The current image/video is downloaded to your default Downloads folder

Filename format:

```text
{account}_{shortcode-or-timestamp}[_{index}].{ext}
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Local setup

```bash
npm install
npx wxt prepare
```

### Useful commands

```bash
npm run dev           # Chrome dev mode (HMR)
npm run dev:firefox   # Firefox dev mode
npm run build         # Build Chrome + Firefox outputs
npm run zip           # Build store-ready zip artifacts
npm run lint          # ESLint + Prettier check
npm run lint:fix      # Auto-fix lint/format issues
npm run typecheck     # TypeScript strict check
npm run amo-lint      # Validate Firefox zip(s) with addons-linter
```

Build outputs:

- `.output/chrome-mv3/`
- `.output/firefox-mv3/`
- `.output/*-zip/`

## How it works

| Context | Responsibility |
| --- | --- |
| `entrypoints/main-world.content.ts` | Patches SPA navigation (`pushState` / `replaceState`) and emits `locationchange` |
| `entrypoints/content.ts` | Boots `AddonManager` and route-driven feature activation |
| `entrypoints/background.ts` | Receives download messages and calls `browser.downloads.download()` |

At runtime:

1. Route changes are detected on Instagram SPA navigation.
2. The content script scans for Save icons and injects one download button per post container.
3. On click, media is extracted from the active slide (or single post scope).
4. For video posts, relay JSON is used first; then API fallback (`/api/v1/media/{id}/info/`) is attempted.
5. The background service worker performs the actual download.

## CI

On every push and pull request, GitHub Actions runs:

1. `npm ci`
2. `npx wxt prepare`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`
6. `npm run zip`

Zip artifacts are uploaded as `extension-zips`.

## Release process

Releases are automated from `master`.

To publish a new version:

1. Bump `version` in both `package.json` and `wxt.config.ts`
2. Merge/push to `master`

`publish.yml` then:

- detects whether the version is newer than the latest `v*` tag
- creates and pushes the corresponding `vX.Y.Z` tag (if needed)
- builds + signs the Firefox MV3 package
- creates a GitHub Release with the signed `.xpi`
- deploys `updates.json` to GitHub Pages

Required repository secrets:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

## Manual verification

There is no automated test suite yet. Validate changes manually on:

- home feed
- channel/explore feed
- single image post
- carousel post
- reel/video post
- modal post opened from feed

Reference snapshots for selector checks are stored in `references/`.

## License

LGPL-3.0

## Credits

- Original extension by [HuiiBuh](https://github.com/HuiiBuh/InstagramDownloader)
- Download icon from [ShareIcon](https://www.shareicon.net/instagram-social-media-icons-880117) by [Aarthi Padmanabhan](https://www.shareicon.net/author/aarthi-padmanabhan)
