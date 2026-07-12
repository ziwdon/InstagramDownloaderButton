import { describe, it, expect } from 'vitest';
import { buildFilename, guessExtension, sanitize } from '../../src/background/filename';
import type { DownloadRequest } from '../../src/core/messages';

function req(overrides: Partial<DownloadRequest> = {}): DownloadRequest {
  return {
    kind: 'download',
    mediaURL: 'https://scontent.cdninstagram.com/v/t51/photo.jpg?_nc=1',
    accountName: 'someuser',
    ...overrides,
  };
}

describe('guessExtension', () => {
  it('extracts a lowercased extension, ignoring query strings', () => {
    expect(guessExtension('https://x/photo.JPG?stp=abc&oe=1')).toBe('.jpg');
    expect(guessExtension('https://x/clip.mp4?bytestart=0')).toBe('.mp4');
    expect(guessExtension('https://x/a.webp')).toBe('.webp');
  });

  it('returns an empty string when no known extension is present', () => {
    expect(guessExtension('https://x/api/v1/media/123/info/')).toBe('');
    expect(guessExtension('https://x/file.txt')).toBe('');
  });
});

describe('sanitize', () => {
  it('replaces filesystem-unsafe characters with underscores', () => {
    expect(sanitize('a/b c:d?.jpg')).toBe('a_b_c_d_.jpg');
  });

  it('strips leading dots and dashes (no hidden or flag-like names)', () => {
    expect(sanitize('...hidden.jpg')).toBe('hidden.jpg');
    expect(sanitize('--rf.jpg')).toBe('rf.jpg');
  });

  it('caps the name at 200 characters', () => {
    expect(sanitize('a'.repeat(500)).length).toBe(200);
  });
});

describe('buildFilename', () => {
  it('combines account, shortcode and extension', () => {
    const name = buildFilename(req({ postShortcode: 'DWpUzi1DeyI' }));
    expect(name).toBe('someuser_DWpUzi1DeyI.jpg');
  });

  it('appends the slide index when present', () => {
    const name = buildFilename(req({ postShortcode: 'DWpUzi1DeyI', index: 3 }));
    expect(name).toBe('someuser_DWpUzi1DeyI_3.jpg');
  });

  it('falls back to a timestamp when no shortcode is available', () => {
    const name = buildFilename(req({ mediaURL: 'https://x/clip.mp4' }), () => 1720000000000);
    expect(name).toBe('someuser_1720000000000.mp4');
  });

  it('sanitizes an account name containing unsafe characters', () => {
    const name = buildFilename(req({ accountName: 'a b/c', postShortcode: 'X' }));
    expect(name).toBe('a_b_c_X.jpg');
  });
});
