const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function shortcodeToMediaId(shortcode: string): string | null {
  if (!shortcode) return null;
  let id = 0n;
  for (const c of shortcode) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}
