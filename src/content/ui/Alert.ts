import '../../styles/alert.scss';

export type AlertLevel = 'default' | 'warn' | 'error';

const wrapper = (() => {
  const el = document.createElement('div');
  el.className = 'igdl-alert-wrapper';
  document.body.appendChild(el);
  return el;
})();

function show(text: string, level: AlertLevel, timeoutMs = 5000): void {
  const alert = document.createElement('div');
  alert.className = `igdl-alert ${level}`;

  const msg = document.createElement('span');
  msg.textContent = text;
  alert.appendChild(msg);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'igdl-alert-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => dismiss(alert));
  alert.appendChild(closeBtn);

  wrapper.appendChild(alert);
  alert.animate([{ opacity: '0' }, { opacity: '1' }], { duration: 300, fill: 'forwards' });

  if (timeoutMs > 0) setTimeout(() => dismiss(alert), timeoutMs);
}

function dismiss(alert: HTMLElement): void {
  alert
    .animate([{ opacity: '1' }, { opacity: '0' }], { duration: 300, fill: 'forwards' })
    .finished.then(() => alert.remove());
}

export const Alert = {
  info: (text: string, timeoutMs?: number) => show(text, 'default', timeoutMs),
  warn: (text: string, timeoutMs?: number) => show(text, 'warn', timeoutMs),
  error: (text: string, timeoutMs?: number) => show(text, 'error', timeoutMs),
};
