# InstagramDownloaderButton

A browser extension that adds a one-click download button to individual Instagram posts. Supports Chrome and Firefox via Manifest V3.

The button appears next to the bookmark/save icon on feed posts, post modals, and reels. Clicking it downloads the image or video directly to your device. Carousel posts download all slides in one click.

## Features

- Download images and videos from feed posts, modals, and reels
- Carousel support — downloads every slide in one click
- Highest-resolution image selection from `srcset`
- Video URL resolved from the Relay prefetch cache embedded in the page, with an API fallback
- Toast notifications on error

## Installation

The extension is not published on the Chrome Web Store or Firefox Add-ons. You must build it from source and load it manually.

### 1. Build

```bash
npm install
npm run build
```

This produces two unpacked extensions:

- **Chrome:** `.output/chrome-mv3/`
- **Firefox:** `.output/firefox-mv3/`

### 2. Install on Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` directory
5. The extension is now active — navigate to instagram.com

To keep the extension across sessions, leave developer mode on. Chrome may show a warning on startup; dismiss it.

### 3. Install on Firefox

Firefox supports two methods. **Temporary installation** is easier but the extension is removed when the browser closes. **Persistent installation** survives restarts.

#### Temporary (no restart required)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Navigate to `.output/firefox-mv3/` and select `manifest.json`
4. The extension loads immediately and stays active until Firefox is closed

#### Persistent (survives restarts)

Firefox requires extensions to be signed by Mozilla unless you use Firefox Developer Edition or Firefox Nightly with signature enforcement disabled.

1. Run `npm run zip` to produce `.output/firefox-mv3-zip/*.zip`
2. Open `about:config`, set `xpinstall.signatures.required` to `false` (only available in Developer Edition / Nightly)
3. Open `about:addons` → gear icon → **Install Add-on From File...**
4. Select the `.zip` file

Alternatively, use the temporary method above and re-load after each restart.

## Usage

1. Go to [instagram.com](https://www.instagram.com) and open any post (feed, modal, or reel)
2. A download button appears to the right of the bookmark icon in the action bar
3. Click it — images download immediately; videos are resolved and queued automatically
4. For carousel posts, all slides are downloaded at once

Files are saved to your browser's default download directory, named by account and post shortcode.

## Development

```bash
npm install

npm run dev           # wxt dev server — Chrome, with HMR
npm run dev:firefox   # wxt dev server — Firefox

npm run typecheck     # tsc --noEmit
npm run lint          # eslint + prettier check
npm run lint:fix      # eslint --fix + prettier --write
```

### Source layout

```
entrypoints/
  background.ts           # MV3 service worker — handles browser.downloads API
  content.ts              # isolated-world content script — boots AddonManager
  main-world.content.ts   # MAIN-world script — patches history for SPA navigation

src/
  core/
    messages.ts           # shared cross-context message types
    selectors.ts          # all Instagram DOM selectors
    extractors.ts         # pulls media URL / author / shortcode from <article>
    relay.ts              # video URL extraction: Relay cache reader + API fallback
    logger.ts             # dev-only console wrapper
  content/
    AddonManager.ts       # wires UrlRouter → PostDownloader
    UrlRouter.ts          # classifies location.href, fires onChange on navigation
    PostDownloader.ts     # injects buttons, handles download click
    ui/
      Alert.ts            # toast notifications
      DownloadButton.ts   # renders the download <button>
  background/
    download.ts           # download handler (no fetch, no blobs)
  styles/
    main.scss             # button styles
    alert.scss            # toast styles
```

### Selectors

All Instagram DOM queries live in `src/core/selectors.ts`. Instagram rotates its atomic CSS class names — all selectors use semantic anchors (ARIA labels, roles, structural patterns) instead of class names. If a selector breaks after an Instagram update, fix it there and verify against HTML in `references/`.

## Credits

- Original extension by [HuiiBuh](https://github.com/HuiiBuh/InstagramDownloader)
- Download icon from [ShareIcon](https://www.shareicon.net/instagram-social-media-icons-880117) by [Aarthi Padmanabhan](https://www.shareicon.net/author/aarthi-padmanabhan)
