import browser from 'webextension-polyfill';
import { handleDownload } from '../src/background/download';
import { isDownloadRequest } from '../src/core/messages';
import { logger } from '../src/core/logger';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isDownloadRequest(msg)) {
      logger.warn('Ignoring malformed runtime message', msg);
      return false;
    }
    return handleDownload(msg);
  });
});
