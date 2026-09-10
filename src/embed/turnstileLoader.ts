/** Cloudflare Turnstile, loaded once per page, for every embed element that needs it (#382). */
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
}

let turnstileLoad: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  const existing = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  if (turnstileLoad) return turnstileLoad;

  turnstileLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('turnstile script loaded without an api'));
    };
    s.onerror = () => reject(new Error('turnstile script failed to load'));
    document.head.appendChild(s);
  });
  // A failed load must not be cached as a permanent verdict — the next form gets a fresh attempt.
  turnstileLoad.catch(() => { turnstileLoad = null; });
  return turnstileLoad;
}
