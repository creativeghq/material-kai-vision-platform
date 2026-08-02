/**
 * Global "Show Prices" toggle. Lets anyone hide every price across the browsing
 * surfaces (catalog/search/agent/quote-add/public catalog/recommendations) during a demo
 * or material-research session, then flip them back. Finance/quote-editing screens ignore
 * it (pricing is the point there).
 *
 * Module-level store + subscription so any component can read/flip it without a provider,
 * and all consumers stay in sync. Persisted per browser.
 */
import { useEffect, useState } from 'react';

const KEY = 'show_prices';

function read(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(KEY) !== 'false'; // default ON
}

let _show = read();
const listeners = new Set<() => void>();

export function useShowPrices(): { showPrices: boolean; setShowPrices: (v: boolean) => void; toggle: () => void } {
  const [show, setShow] = useState(_show);
  useEffect(() => {
    const l = () => setShow(_show);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const apply = (v: boolean) => {
    _show = v;
    try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
  };

  return { showPrices: show, setShowPrices: apply, toggle: () => apply(!_show) };
}
