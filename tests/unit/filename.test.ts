import { describe, it, expect } from 'vitest';
import { buildFilename, guessExtension, sanitize } from '../../src/background/filename';
import type { DownloadRequest } from '../../src/core/messages';

function req(overrides: Partial<DownloadRequest> = {}): DownloadRequest {
  return {
    kind: 'download',
    mediaURL: 'https://scontent.cdninstagram.com/v/t51/photo.jpg?_nc=1',
    accountName: 'someuser',
    mediaKind: 'image',
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

  it('keeps a normal video URL extension unchanged', () => {
    const name = buildFilename(
      req({
        mediaURL: 'https://scontent.cdninstagram.com/v/t50/clip.mp4?_nc=1',
        mediaKind: 'video',
        postShortcode: 'DWpUzi1DeyI',
      }),
    );
    expect(name).toBe('someuser_DWpUzi1DeyI.mp4');
  });

  it('defaults to .mp4 for a signed video URL with no recognized extension', () => {
    // Signed CDN video URLs commonly have no file extension in the path at all,
    // e.g. an API-resolved redirect target — guessExtension() returns ''.
    const name = buildFilename(
      req({
        mediaURL: 'https://scontent.cdninstagram.com/o1/v/t2/f2/m367/signed-blob-no-ext',
        mediaKind: 'video',
        postShortcode: 'DWpUzi1DeyI',
      }),
    );
    expect(name).toBe('someuser_DWpUzi1DeyI.mp4');
  });

  it('defaults to .jpg for an image URL with no recognized extension', () => {
    const name = buildFilename(
      req({
        mediaURL: 'https://scontent.cdninstagram.com/o1/v/t2/f2/m367/signed-blob-no-ext',
        mediaKind: 'image',
        postShortcode: 'DWpUzi1DeyI',
      }),
    );
    expect(name).toBe('someuser_DWpUzi1DeyI.jpg');
  });

  it('keeps the extension intact when the account name is very long (500 chars)', () => {
    const longAccountName = 'a'.repeat(500);
    const name = buildFilename(
      req({
        accountName: longAccountName,
        mediaURL: 'https://x/clip.mp4',
        mediaKind: 'video',
        postShortcode: 'X',
      }),
    );
    expect(name.endsWith('.mp4')).toBe(true);
    // Base (everything before the extension) is capped at 180 chars — this
    // would have failed under the old "sanitize-then-slice(0,200)" ordering,
    // which truncated the extension off entirely for inputs this long.
    expect(name).toBe(`${'a'.repeat(180)}.mp4`);
  });
});
