import { describe, it, expect } from 'vitest';
import { isDownloadRequest } from '../../src/core/messages';

describe('isDownloadRequest', () => {
  it('accepts a minimal valid request', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://scontent.cdninstagram.com/v/t51/photo.jpg',
        accountName: 'someuser',
      }),
    ).toBe(true);
  });

  it('accepts a valid request with optional postShortcode and index', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'someuser',
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
      isDownloadRequest({ kind: 'alert', mediaURL: 'https://x/y.jpg', accountName: 'u' }),
    ).toBe(false);
    expect(isDownloadRequest({ mediaURL: 'https://x/y.jpg', accountName: 'u' })).toBe(false);
  });

  it('rejects when mediaURL or accountName are missing or non-string', () => {
    expect(isDownloadRequest({ kind: 'download', accountName: 'u' })).toBe(false);
    expect(isDownloadRequest({ kind: 'download', mediaURL: 'https://x/y.jpg' })).toBe(false);
    expect(isDownloadRequest({ kind: 'download', mediaURL: 123, accountName: 'u' })).toBe(false);
    expect(
      isDownloadRequest({ kind: 'download', mediaURL: 'https://x/y.jpg', accountName: 7 }),
    ).toBe(false);
  });

  it('rejects when optional fields have the wrong type', () => {
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        postShortcode: 123,
      }),
    ).toBe(false);
    expect(
      isDownloadRequest({
        kind: 'download',
        mediaURL: 'https://x/y.jpg',
        accountName: 'u',
        index: '3',
      }),
    ).toBe(false);
  });
});
