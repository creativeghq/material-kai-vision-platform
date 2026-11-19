import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** A tab kept in `?tab=`, so a menu can deep-link it. An unknown value falls back to the landing tab. */
export function useUrlTab<T extends string>(tabs: readonly T[], landing: T): [T, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = (tabs as readonly string[]).includes(requested ?? '') ? (requested as T) : landing;
  const select = useCallback((next: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === landing) p.delete('tab'); else p.set('tab', next);
      return p;
    }, { replace: true });
  }, [setParams, landing]);
  return [active, select];
}
