import browser from 'webextension-polyfill';
import { handleDownload, registerDownloadTracking } from '../src/background/download';
import { isDownloadRequest } from '../src/core/messages';
import { logger } from '../src/core/logger';

export default defineBackground(() => {
  // Registered synchronously on every service-worker start (including
  // wake-from-suspend) so no `downloads.onChanged` events are missed.
  registerDownloadTracking();

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isDownloadRequest(msg)) {
      logger.warn('Ignoring malformed runtime message', msg);
      return false;
    }
    return handleDownload(msg);
  });

  // No `default_popup` is set, so the toolbar icon has no default click
  // behavior — this listener is what makes clicking it do something useful
  // instead of being a dead affordance.
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: 'https://www.instagram.com/' });
  });
});
