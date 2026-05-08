export const ACTION_BAR = [
  'section:has(svg[aria-label="Like"], svg[aria-label="Unlike"])',
  'section:has(svg[aria-label="Save"], svg[aria-label="Remove"])',
] as const;

export const SAVE_SVG = 'svg[aria-label="Save"], svg[aria-label="Remove"]';

export const AUTHOR_LINK = [
  'header a[role="link"][href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/explore/"])',
  'a[role="link"][href^="/"][href$="/"]',
] as const;

export const PERMALINK = 'a[href*="/p/"], a[href*="/reel/"]';

export const POST_IMG = [
  'img[alt^="Photo by "]',
  'img[alt^="May be "]',
  'img[alt^="Photo shared by "]',
  'div._aagu img',
  'ul img[src*="fbcdn"]',
  // Fallback: any img that is not a profile/avatar/story thumb. Catches posts
  // whose alt text was author-set (e.g. promotional captions) and so doesn't
  // match the auto-generated "Photo by …" / "May be …" prefixes.
  'img:not([alt$="profile picture"]):not([alt$="profile photo"]):not([alt$="highlight story picture"]):not([alt$="highlight cover image"]):not([alt=""])',
] as const;

export const POST_VIDEO = 'video';

// Used inside extractors to locate the post's carousel <ul>. A "post slide"
// <li> contains a video or an image whose alt/src looks like Instagram media.
// In feed posts, this UL is the first one in the article; in permalink the
// post wrapper holds it directly.
export const CAROUSEL_SLIDE_MEDIA =
  'video, img[alt^="Photo by "], img[alt^="May be "], img[alt^="Photo shared by "], img[src*="fbcdn"], img[src*="cdninstagram"]';

export const RELAY_JSON_SCRIPTS = 'script[type="application/json"][data-sjs]';
