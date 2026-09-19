/**
 * Sentry titles a console event by `String()`-ing the arguments, so an error object becomes
 * `[object Object]` — which is also why `ignoreErrors` never matches it: that filter reads the
 * title, and the real reason is only in `extra.arguments`. These put the reason back.
 */

/** Errors that are a condition of the network or the browser, never a defect in this app. */
export const NOISE_PATTERNS: ReadonlyArray<string | RegExp> = [
  'top.GLOBALS',
  'chrome-extension://',
  'moz-extension://',
  'NetworkError',
  'Failed to fetch',
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  /\[vite\] Failed to reload/,
  'Failed to fetch dynamically imported module',
  'Invalid Refresh Token',
  'Refresh Token Not Found',
];

export function isNoiseMessage(message: string): boolean {
  return NOISE_PATTERNS.some((p) =>
    typeof p === 'string' ? message.includes(p) : p.test(message),
  );
}

/** One console argument as a string worth reading. A PostgREST error needs both halves:
 *  `PGRST201` is the difference between a network blip and a query refused outright. */
export function describeConsoleArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (typeof arg !== 'object') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

  const o = arg as Record<string, unknown>;
  const message = typeof o.message === 'string' ? o.message : undefined;
  const code = typeof o.code === 'string' && o.code ? o.code : undefined;
  if (message) return code ? `${code} ${message}` : message;
  if (typeof o.error === 'string') return o.error;

  try {
    const json = JSON.stringify(arg);
    if (json && json !== '{}') return json.length > 300 ? `${json.slice(0, 300)}…` : json;
  } catch {
    // circular — fall through
  }
  return Object.prototype.toString.call(arg);
}

/** Rebuild a console event's title from its arguments, or null when there is nothing to improve. */
export function rebuildConsoleMessage(args: unknown): string | null {
  if (!Array.isArray(args) || args.length === 0) return null;
  const rebuilt = args.map(describeConsoleArg).join(' ').trim();
  return rebuilt || null;
}
