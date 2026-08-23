/**
 * Cloudflare Turnstile, loaded once per page, for every embed element that needs it (#382).
 *
 * Shared because there are now TWO widgets with a quote form — the spec builder and the blueprint
 * configurator — and Cloudflare's script defines a GLOBAL. Two private copies of this loader would
 * each think they owned it: the second load is at best wasted bytes and at worst a
 * re-registration, and a visitor who solved one challenge would be sending a token belonging to a
 * widget nothing is watching.
 *
 * Rejects rather than hanging when the script cannot load. The caller then submits without a token
 * and the SERVER rules on it, which is the correct place for that decision — holding a form
 * hostage to a third-party CDN loses the lead outright.
 */
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
