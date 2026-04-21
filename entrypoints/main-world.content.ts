export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const patch = (name: 'pushState' | 'replaceState') => {
      const orig = history[name];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (history as Record<string, any>)[name] = function (
        data: unknown,
        unused: string,
        url?: string | URL | null,
      ) {
        const r = orig.call(history, data, unused, url);
        window.dispatchEvent(new Event('locationchange'));
        return r;
      };
    };
    patch('pushState');
    patch('replaceState');
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
  },
});
