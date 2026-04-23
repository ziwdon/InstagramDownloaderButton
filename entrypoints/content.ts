import { AddonManager } from '../src/content/AddonManager';

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  cssInjectionMode: 'manifest',
  main() {
    new AddonManager();
  },
});
