import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDownloadButton } from '../../src/content/ui/DownloadButton';

// createDownloadButton builds its element with plain document.createElement,
// so — like relay.test.ts — these tests drive the global happy-dom
// `document` directly rather than loading a fixture snapshot.

beforeEach(() => {
  document.body.innerHTML = '';
});

function click(btn: HTMLElement): void {
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressEnter(btn: HTMLElement): void {
  btn.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
}

describe('createDownloadButton — busy-state guard', () => {
  it('sets data-igdl-busy and aria-disabled synchronously on click, before onClick can resolve', () => {
    let resolveFirst: (() => void) | undefined;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    click(btn);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('data-igdl-busy')).toBe('true');
    expect(btn.getAttribute('aria-disabled')).toBe('true');

    resolveFirst?.();
  });

  it('ignores a second click fired before the first resolution run finishes (double-click race)', async () => {
    let resolveFirst: (() => void) | undefined;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    // Two clicks dispatched back-to-back, synchronously — simulates a rapid
    // double-click. The guard attribute is set before any `await` inside the
    // handler, so the second dispatch's `hasAttribute` check sees it.
    click(btn);
    click(btn);

    expect(onClick).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(btn.hasAttribute('data-igdl-busy')).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);

    // Busy state cleared — a subsequent click starts a new resolution run.
    click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores keydown activation while busy', () => {
    let resolveFirst: (() => void) | undefined;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    click(btn);
    pressEnter(btn);

    expect(onClick).toHaveBeenCalledTimes(1);
    resolveFirst?.();
  });

  it('clears the busy state after onClick rejects (thrown-error path)', async () => {
    const onClick = vi.fn(() => Promise.reject(new Error('boom')));
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    click(btn);
    expect(btn.getAttribute('data-igdl-busy')).toBe('true');

    // Let the rejected promise's finally/catch chain run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(btn.hasAttribute('data-igdl-busy')).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
  });

  it('clears the busy state after onClick throws synchronously', async () => {
    const onClick = vi.fn(() => {
      throw new Error('sync boom');
    });
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    click(btn);

    expect(btn.hasAttribute('data-igdl-busy')).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
  });

  it('clears the busy state after a successful resolution and allows another click', async () => {
    const onClick = vi.fn(() => Promise.resolve());
    const btn = createDownloadButton(onClick);
    document.body.appendChild(btn);

    click(btn);
    await Promise.resolve();
    await Promise.resolve();

    expect(btn.hasAttribute('data-igdl-busy')).toBe(false);

    click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
