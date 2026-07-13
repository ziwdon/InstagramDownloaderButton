import { describe, it, expect } from 'vitest';
import { isDownloadableURL } from '../../src/background/url-validation';

describe('isDownloadableURL', () => {
  it('accepts https and http URLs', () => {
    expect(isDownloadableURL('https://scontent.cdninstagram.com/v/t51/photo.jpg')).toBe(true);
    expect(isDownloadableURL('http://example.com/clip.mp4')).toBe(true);
  });

  it('rejects data: URLs', () => {
    expect(isDownloadableURL('data:image/png;base64,AAAA')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isDownloadableURL('javascript:alert(1)')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isDownloadableURL('file:///etc/passwd')).toBe(false);
  });

  it('rejects blob: URLs', () => {
    expect(isDownloadableURL('blob:https://www.instagram.com/abc-123')).toBe(false);
  });

  it('rejects malformed strings that are not valid URLs', () => {
    expect(isDownloadableURL('not a url')).toBe(false);
    expect(isDownloadableURL('')).toBe(false);
  });
});
