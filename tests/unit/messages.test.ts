import { describe, it, expect } from 'vitest';
import { isDownloadRequest } from '../../src/core/messages';

describe('isDownloadRequest', () => {
  it('accepts a minimal valid request', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://scontent.cdninstagram.com/v/t51/photo.jpg',
        accountName: 'someuser',
        mediaKind: 'image',
      }),
    ).toBe(true);
  });

  it('accepts a valid request with optional postShortcode and index', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'someuser',
        mediaKind: 'video',
        postShortcode: 'DWpUzi1DeyI',
        index: 2,
      }),
    ).toBe(true);
  });

  it('rejects non-object messages', () => {
    expect(isDownloadRequest(null)).toBe(false);
    expect(isDownloadRequest(undefined)).toBe(false);
    expect(isDownloadRequest('download')).toBe(false);
    expect(isDownloadRequest(42)).toBe(false);
  });

  it('rejects messages with the wrong kind', () => {
    expect(
      isDownloadRequest({
        kind: 'alert',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        mediaKind: 'image',
      }),
    ).toBe(false);
    expect(isDownloadRequest({ mediaURL: 'https://x/y.jpg', accountName: 'u' })).toBe(false);
  });

  it('rejects when mediaURL or accountName are missing or non-string', () => {
    expect(isDownloadRequest({ kind: 'download', accountName: 'u', mediaKind: 'image' })).toBe(
      false,
    );
    expect(isDownloadRequest({ kind: 'download', mediaURL: 'https://x/y.jpg' })).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 123,
        accountName: 'u',
        mediaKind: 'image',
      }),
    ).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 7,
        mediaKind: 'image',
      }),
    ).toBe(false);
  });

  it('rejects when mediaKind is missing or not exactly "image"/"video"', () => {
    expect(
      isDownloadRequest({ kind: 'download', mediaURL: 'https://x/y.jpg', accountName: 'u' }),
    ).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        mediaKind: 'photo',
      }),
    ).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        mediaKind: '',
      }),
    ).toBe(false);
  });

  it('rejects when optional fields have the wrong type', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        mediaKind: 'image',
        postShortcode: 123,
      }),
    ).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        mediaKind: 'image',
        index: '3',
      }),
    ).toBe(false);
  });
});
