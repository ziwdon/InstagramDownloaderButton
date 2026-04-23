import { defineConfig } from 'wxt';

const GECKO_ID = 'instagramdownloader@ziwdon.github';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Instagram Downloader',
    description: 'One-click download button per Instagram post.',
    version: '5.0.0',
    action: { default_title: 'Instagram Downloader' },
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
