import '../../styles/main.scss';

const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-label="Download" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Download</title><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;

export function createDownloadButton(onClick: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', 'Download');
  btn.innerHTML = DOWNLOAD_SVG;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });

  return btn;
}
