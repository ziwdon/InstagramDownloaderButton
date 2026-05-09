export type Route = 'home' | 'post' | 'reel' | 'story' | 'other';

export function classify(url: string): Route {
  const u = new URL(url);
  if (u.pathname === '/' || u.pathname === '/accounts/activity/') return 'home';
  if (u.pathname.startsWith('/stories/')) return 'story';

  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'home';

  if (segments[0] === 'p') return 'post';
  if (segments[0] === 'reel' || segments[0] === 'reels') return 'reel';

  if (segments.length >= 2) {
    if (segments[1] === 'p') return 'post';
    if (segments[1] === 'reel') return 'reel';
  }

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
