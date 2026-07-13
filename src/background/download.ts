import browser from 'webextension-polyfill';
import type { DownloadRequest } from '../core/messages';
import { buildFilename } from './filename';
import { isDownloadableURL } from './url-validation';
import { logger } from '../core/logger';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

export async function handleDownload(req: DownloadRequest): Promise<void> {
  if (!isDownloadableURL(req.mediaURL)) {
    logger.error('Refusing to download unsupported URL scheme', req.mediaURL);
    throw new Error(`Unsupported download URL scheme: ${req.mediaURL}`);
  }

  const filename = buildFilename(req);

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
