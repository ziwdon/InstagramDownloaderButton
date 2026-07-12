import { defineConfig } from 'vitest/config';

// Standalone config for the unit-test suite (vitest reads this; wxt keeps its
// own build config in wxt.config.ts). happy-dom is the default environment so
// both the pure-logic and DOM-selector tiers can share it; pure tests simply
// ignore the `document` global. See tests/README.md for the fixture strategy.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
