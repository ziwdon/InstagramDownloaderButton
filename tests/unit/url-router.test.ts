import { describe, it, expect } from 'vitest';
import { classify } from '../../src/content/UrlRouter';

const BASE = 'https://www.instagram.com';

describe('classify', () => {
  it('treats the site root and activity as home', () => {
    expect(classify(`${BASE}/`)).toBe('home');
    expect(classify(`${BASE}/accounts/activity/`)).toBe('home');
  });

  it('classifies bare-modal permalinks (no username segment)', () => {
    expect(classify(`${BASE}/p/DWpUzi1DeyI/`)).toBe('post');
    expect(classify(`${BASE}/reel/DYDIEQsAJM9/`)).toBe('reel');
    expect(classify(`${BASE}/reels/DYDIEQsAJM9/`)).toBe('reel');
  });

  it('classifies username-prefixed permalinks (leading-prefix matching would miss these)', () => {
    expect(classify(`${BASE}/someuser/p/DWpUzi1DeyI/`)).toBe('post');
    expect(classify(`${BASE}/someuser/reel/DYDIEQsAJM9/`)).toBe('reel');
  });

  it('classifies stories', () => {
    expect(classify(`${BASE}/stories/someuser/123/`)).toBe('story');
  });

  it('treats profile pages and other routes as other', () => {
    expect(classify(`${BASE}/someuser/`)).toBe('other');
    expect(classify(`${BASE}/explore/`)).toBe('other');
  });

  it('ignores query strings and hashes when classifying', () => {
    expect(classify(`${BASE}/someuser/p/DWpUzi1DeyI/?hl=es`)).toBe('post');
    expect(classify(`${BASE}/?variant=1#x`)).toBe('home');
  });
});
