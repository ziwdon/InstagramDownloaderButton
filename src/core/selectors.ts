export const POST_ARTICLE = [
  'div[role="dialog"] article',
  'main[role="main"] article',
  'article',
] as const;

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
  'ul img[src*="fbcdn"]',
] as const;

export const POST_VIDEO = 'video';

export const CAROUSEL_SLIDES = 'ul > li';
export const CAROUSEL_ACTIVE = 'ul > li:not([tabindex="-1"])';

export const RELAY_JSON_SCRIPTS = 'script[type="application/json"][data-sjs]';
