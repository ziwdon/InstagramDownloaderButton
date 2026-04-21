import { PostDownloader } from './PostDownloader';
import { UrlRouter, type Route } from './UrlRouter';

export class AddonManager {
  private readonly postDownloader = new PostDownloader();
  private readonly router: UrlRouter;

  constructor() {
    this.router = new UrlRouter(this.onRoute);
    this.router.start();
  }

  private readonly onRoute = (route: Route) => {
    if (route === 'home' || route === 'post' || route === 'reel') {
      this.postDownloader.init();
    } else {
      this.postDownloader.remove();
    }
  };
}
