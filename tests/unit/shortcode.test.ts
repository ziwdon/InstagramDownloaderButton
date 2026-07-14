import { describe, it, expect } from 'vitest';
import { shortcodeToMediaId } from '../../src/core/shortcode';

describe('shortcodeToMediaId', () => {
  it('decodes single-character shortcodes against the base-64 alphabet', () => {
    // Alphabet is A-Z a-z 0-9 - _ ; index of 'B' is 1, '_' is 63.
    expect(shortcodeToMediaId('A')).toBe('0');
    expect(shortcodeToMediaId('B')).toBe('1');
    expect(shortcodeToMediaId('_')).toBe('63');
  });

  it('applies base-64 place value across characters', () => {
    // "BA" = 1 * 64 + 0 = 64
    expect(shortcodeToMediaId('BA')).toBe('64');
    // "BB" = 1 * 64 + 1 = 65
    expect(shortcodeToMediaId('BB')).toBe('65');
  });

  it('round-trips real Instagram shortcode/media-id pairs (from references/ snapshots)', () => {
    // Each pair is a shortcode from a permalink URL and the `pk` (media id)
    // found in that page's Relay payload — see tests/fixtures/relay/*.json.
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['DWpUzi1DeyI', '3866713258095144072'], // singlepost (image)
      ['DYDIEQsAJM9', '3891989980146340669'], // video/reel
      ['DYDATO-icDf', '3891955824729899231'], // multiplepost (carousel)
      ['DWyCSlHCgoB', '3869165102754826753'], // multiplepost_2 (es locale)
      ['DYFRW_DDicn', '3892593799247832871'], // feed timeline post
    ];
    for (const [shortcode, mediaId] of pairs) {
      expect(shortcodeToMediaId(shortcode)).toBe(mediaId);
    }
  });

  it('handles bignum-sized ids without precision loss (uses BigInt)', () => {
    // 19-digit result exceeds Number.MAX_SAFE_INTEGER; must stay exact.
    expect(shortcodeToMediaId('DYDIEQsAJM9')).toBe('3891989980146340669');
  });

  it('returns null for empty input', () => {
    expect(shortcodeToMediaId('')).toBe(null);
  });

  it('returns null when any character is outside the alphabet', () => {
    expect(shortcodeToMediaId('abc$')).toBe(null);
    expect(shortcodeToMediaId('!')).toBe(null);
  });
});
