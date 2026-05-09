<p align="center">
  <img src="public/icons/icon-128.png" alt="Instagram Downloader Button icon" width="96" height="96" />
</p>

# Instagram Downloader Button

A browser extension that adds a one-click download button to individual Instagram posts.

Supports Chrome and Firefox via Manifest V3.

The button appears next to the bookmark/save icon on feed posts, post modals, and reels. Clicking it downloads the image or video directly to your device.

## Features

- Works on feed, modal, post permalink, and reel permalink pages
- Supports both image and video posts
- Carousel-aware: downloads the currently visible slide
- MV3-compatible architecture for Chrome and Firefox

## Installation

### Firefox

Download the latest signed `.xpi` from the [Releases page](https://github.com/ziwdon/InstagramDownloaderButton/releases/latest) and open it in Firefox (or drag it onto `about:addons`).
The extension updates automatically when new versions are released.

### Chrome

The extension is not published on the Chrome Web Store and must be loaded manually.

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

1. Go to [instagram.com](https://www.instagram.com) and open any post (feed, modal, or reel)
3. Click the extension download button that appears to the right of the bookmark post icon
4. The current image/video is downloaded to your default Downloads folder

## Releasing and/or updating to a new version

Releases are automatic. When a commit is pushed to `master` with a bumped version in `package.json`, the GitHub Actions workflow creates the tag, builds the Firefox extension, signs it as unlisted via `web-ext sign`, creates a GitHub Release with the signed XPI, and deploys `updates.json` to GitHub Pages for automatic updates.

### One-time repository setup

If you want to clone or fork this repository and create an automated release workflow, follow the steps below.

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
