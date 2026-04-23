import browser from 'webextension-polyfill';
import type { DownloadRequest } from '../core/messages';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

export async function handleDownload(req: DownloadRequest): Promise<void> {
  const ext = guessExtension(req.mediaURL);
  const indexSuffix = req.index !== undefined ? `_${req.index}` : '';
  const filename = sanitize(
    `${req.accountName}_${req.postShortcode ?? Date.now()}${indexSuffix}${ext}`,
  );

  try {
    await browser.downloads.download({ url: req.mediaURL, filename });
  } catch (err) {
    if (IS_FIREFOX) {
      await (browser.downloads.download as (options: object) => Promise<number>)({
        url: req.mediaURL,
        filename,
        headers: [{ name: 'Referer', value: 'https://www.instagram.com/' }],
      });
      return;
    }
    throw err;
  }
}

function guessExtension(url: string): string {
  const clean = url.split('?')[0] ?? '';
  const m = clean.match(/\.(jpg|jpeg|png|mp4|webp|heic)$/i);
  return m ? `.${m[1]!.toLowerCase()}` : '';
}

function sanitize(name: string): string {
  return name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.-]+/, '')
    .slice(0, 200);
}
