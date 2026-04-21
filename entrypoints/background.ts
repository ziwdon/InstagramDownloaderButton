import browser from 'webextension-polyfill';
import { handleDownload } from '../src/background/download';
import type { ExtensionMessage } from '../src/core/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as ExtensionMessage;
    if (m.kind === 'download') return handleDownload(m);
    return false;
  });
});
