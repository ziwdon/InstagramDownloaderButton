import '../../styles/alert.scss';

export type AlertLevel = 'default' | 'warn' | 'error';

const MAX_VISIBLE = 3;

const wrapper = (() => {
  const el = document.createElement('div');
  el.className = 'igdl-alert-wrapper';
  document.body.appendChild(el);
  return el;
})();

// Timer ids and dismissed-state flags, keyed by alert element, so dismiss()
// can cancel the pending auto-dismiss and guard against double-removal.
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const dismissed = new WeakSet<HTMLElement>();

function show(text: string, level: AlertLevel, timeoutMs = 5000): void {
  if (wrapper.children.length >= MAX_VISIBLE) {
    const oldest = wrapper.firstElementChild as HTMLElement | null;
    if (oldest) removeImmediately(oldest);
  }

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

  if (timeoutMs > 0) {
    timers.set(
      alert,
      setTimeout(() => dismiss(alert), timeoutMs),
    );
  }
}

function clearAlertTimer(alert: HTMLElement): void {
  const timer = timers.get(alert);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(alert);
  }
}

function dismiss(alert: HTMLElement): void {
  if (dismissed.has(alert)) return;
  dismissed.add(alert);
  clearAlertTimer(alert);

  alert
    .animate([{ opacity: '1' }, { opacity: '0' }], { duration: 300, fill: 'forwards' })
    .finished.then(() => alert.remove());
}

// Used only to enforce the visible-toast cap: removes the oldest alert from
// the DOM right away (no fade-out) so the cap check stays accurate even when
// several alerts are pushed faster than the dismiss animation can settle.
function removeImmediately(alert: HTMLElement): void {
  if (dismissed.has(alert)) return;
  dismissed.add(alert);
  clearAlertTimer(alert);
  alert.remove();
}

export const Alert = {
  info: (text: string, timeoutMs?: number) => show(text, 'default', timeoutMs),
  warn: (text: string, timeoutMs?: number) => show(text, 'warn', timeoutMs),
  error: (text: string, timeoutMs?: number) => show(text, 'error', timeoutMs),
};
