export type Route = 'home' | 'post' | 'reel' | 'story' | 'other';

export function classify(url: string): Route {
  const u = new URL(url);
  if (u.pathname === '/' || u.pathname === '/accounts/activity/') return 'home';
  if (u.pathname.startsWith('/p/')) return 'post';
  if (u.pathname.startsWith('/reel/')) return 'reel';
  if (u.pathname.startsWith('/stories/')) return 'story';
  return 'other';
}

export class UrlRouter {
  private current: Route = 'other';

  constructor(private readonly onChange: (r: Route) => void) {
    window.addEventListener('locationchange', this.tick);
    window.addEventListener('popstate', this.tick);
  }

  start(): void {
    this.tick();
  }

  destroy(): void {
    window.removeEventListener('locationchange', this.tick);
    window.removeEventListener('popstate', this.tick);
  }

  private readonly tick = () => {
    const next = classify(location.href);
    if (next !== this.current) {
      this.current = next;
      this.onChange(next);
    }
  };
}
