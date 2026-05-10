import { defineConfig } from 'wxt';

const GECKO_ID = 'instagramdownloader@ziwdon.github';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Instagram Downloader Button',
    description: 'One-click download button per Instagram post.',
    version: '1.2.2',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'Instagram Downloader Button',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
    permissions: ['downloads'],
    host_permissions: ['*://*.instagram.com/*', '*://*.cdninstagram.com/*', '*://*.fbcdn.net/*'],
    web_accessible_resources: [
      {
        resources: ['icons/*'],
        matches: ['*://*.instagram.com/*'],
      },
    ],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          ...(process.env['UPDATES_URL'] ? { update_url: process.env['UPDATES_URL'] } : {}),
        },
      },
    }),
  }),
  runner: { disabled: true },
});
