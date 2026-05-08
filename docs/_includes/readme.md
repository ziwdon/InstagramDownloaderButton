# Instagram Downloader Button

A browser extension that adds a one-click download button to individual Instagram posts. Supports Chrome and Firefox via Manifest V3.

The button appears next to the bookmark/save icon on feed posts, post modals, and reels. Clicking it downloads the image or video directly to your device.

## Features

- Download images and videos from feed posts, modals, and reels
- Carousel support — downloads every slide in one click
- Automatic video resolution with API fallback
- Toast notifications on error

## Installation

### Firefox

Download the latest signed `.xpi` from the [Releases page](https://github.com/ziwdon/InstagramDownloaderButton/releases/latest) and open it in Firefox (or drag it onto `about:addons`). The extension updates automatically when new versions are released.

### Chrome

The extension is not published on the Chrome Web Store and must be loaded manually.

1. Clone the repo and build:
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select `.output/chrome-mv3/`

Chrome may show a startup warning about developer mode extensions — dismiss it.

## Usage

1. Go to [instagram.com](https://www.instagram.com) and open any post (feed, modal, or reel)
2. A download button appears to the right of the bookmark icon in the action bar
3. Click it — images download immediately; videos resolve automatically
4. Carousel posts download all slides at once

Files are saved to your default download directory, named by account and post shortcode.

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

## Releasing a new version

Releases are automatic. When a commit is pushed to `master` with a bumped version in `package.json`, the GitHub Actions workflow creates the tag, builds the Firefox extension, signs it as unlisted via `web-ext sign`, creates a GitHub Release with the signed XPI, and deploys `updates.json` to GitHub Pages for automatic updates.

### One-time setup

#### AMO API credentials

Go to **https://addons.mozilla.org/en-US/developers/addon/api/key/** and generate API credentials. Add them as repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `AMO_JWT_ISSUER` | JWT issuer (starts with `user:...`) |
| `AMO_JWT_SECRET` | JWT secret |

#### GitHub Pages

Go to **Settings → Pages** and set **Source** to **GitHub Actions**. A `github-pages` environment is usually created automatically — check under **Settings → Environments**. In the environment's deployment rules, add the `master` branch so that pushes to `master` are allowed to deploy.

### Publishing

1. Bump `version` in both `wxt.config.ts` and `package.json`.
2. Commit and push (or open a PR and merge to `master`). The release is created automatically.
3. The workflow detects the version bump, creates the tag, and runs: build → sign → GitHub Release → deploy `updates.json`.
4. Installed extensions update silently via `updates.json`.

## Credits

- Original extension by [HuiiBuh](https://github.com/HuiiBuh/InstagramDownloader)
- Download icon from [ShareIcon](https://www.shareicon.net/instagram-social-media-icons-880117) by [Aarthi Padmanabhan](https://www.shareicon.net/author/aarthi-padmanabhan)
