import { AddonManager } from '../src/content/AddonManager';

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  cssInjectionMode: 'ui',
  main() {
    new AddonManager();
  },
});
