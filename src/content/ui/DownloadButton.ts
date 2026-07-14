import '../../styles/main.scss';

const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-label="Download" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Download</title><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;

const BUSY_ATTR = 'data-igdl-busy';

export function createDownloadButton(onClick: () => Promise<void> | void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', 'Download');
  btn.innerHTML = DOWNLOAD_SVG;

  // Re-entrancy guard: the busy attribute is set synchronously, before any
  // `await`, so a second click/keydown dispatched before the first
  // resolution run completes is rejected by the `hasAttribute` check below —
  // there is no `await` between the check and the set for a race to land in.
  const activate = (): void => {
    if (btn.hasAttribute(BUSY_ATTR)) return;
    btn.setAttribute(BUSY_ATTR, 'true');
    btn.setAttribute('aria-disabled', 'true');

    const clearBusy = (): void => {
      btn.removeAttribute(BUSY_ATTR);
      btn.removeAttribute('aria-disabled');
    };

    let result: Promise<void> | void;
    try {
      result = onClick();
    } catch {
      // Thrown synchronously (e.g. a non-async onClick) — clear immediately.
      clearBusy();
      return;
    }
    // Covers both a returned Promise (success or rejection) and a plain
    // `void` return — `finally` always clears the busy state, and `catch`
    // prevents an unhandled-rejection warning if onClick's own error
    // handling doesn't fully swallow a failure.
    Promise.resolve(result)
      .finally(clearBusy)
      .catch(() => {});
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activate();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });

  return btn;
}
