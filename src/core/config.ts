// Compile-time kill-switch for video downloads. The video extraction path
// (src/core/relay.ts) depends on undocumented Instagram internals — SSR Relay
// JSON blobs and the /api/v1/media/{id}/info/ endpoint — either of which can
// change without warning and break video downloads for all users while image
// downloads keep working via <img srcset>. Flipping this constant lets a
// future release disable/re-enable video downloads without touching the
// extraction code. Deliberately not a user-facing option — the options UI is
// out of scope for this extension.
export const VIDEO_DOWNLOADS_ENABLED = false;
