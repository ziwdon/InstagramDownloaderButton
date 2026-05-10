// Instagram localizes aria-label and <title> text on action-bar SVGs based on
// the `?hl=` URL parameter ("Save" → "Guardar" in Spanish, etc.). The icon
// geometry is identical across locales, so we anchor on the SVG path/polygon
// data as a locale-independent fallback. Combined with the English aria-label
// selectors, either anchor must hold for the action bar to be discoverable.
const SAVE_GEOMETRY = 'svg:has(polygon[points="20 21 12 13.44 4 21 4 3 20 3 20 21"])';
const LIKE_GEOMETRY = 'svg:has(path[d^="M16.792 3.904"])';
const SHARE_GEOMETRY = 'svg:has(path[d^="M13.973 20.046"])';

export const SAVE_SVG = `svg[aria-label="Save"], svg[aria-label="Remove"], ${SAVE_GEOMETRY}`;

export const LIKE_SVG = `svg[aria-label="Like"], svg[aria-label="Unlike"], ${LIKE_GEOMETRY}`;

export const SHARE_SVG = `svg[aria-label="Share"], ${SHARE_GEOMETRY}`;

export const ACTION_BAR = [`section:has(${LIKE_SVG})`, `section:has(${SAVE_SVG})`] as const;

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
