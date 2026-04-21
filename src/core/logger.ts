const IS_DEV = import.meta.env.MODE !== 'production';

export const logger = {
  log: (...args: unknown[]) => IS_DEV && console.warn('[igdl]', ...args),
  warn: (...args: unknown[]) => console.warn('[igdl]', ...args),
  error: (...args: unknown[]) => console.error('[igdl]', ...args),
};
