import { useCallback, useEffect } from 'react';

/**
 * Persist an in-progress modal/form to sessionStorage so a half-filled form
 * survives navigating to another screen and reopening — and is gone when the tab
 * closes (no stale drafts lingering forever like localStorage would).
 *
 * Usage:
 *   const clearDraft = useSessionDraft(
 *     `my-form:${workspaceId}`,
 *     open,
 *     { name, amount, notes },          // the fields to persist
 *     (d) => {                          // restore: runs once when the modal opens
 *       setName(d?.name ?? '');
 *       setAmount(d?.amount ?? '');
 *       setNotes(d?.notes ?? '');
 *     },
 *   );
 *   // call clearDraft() on successful Save AND on explicit Cancel.
 *
 * Only persist plain serializable values (and small self-contained objects you can
 * restore without a refetch). Transient/loaded state (search results, fetched lists)
 * should stay out of `values`.
 *
 * @param key     unique storage key for this form instance
 * @param open    whether the modal is open (drafts are only read/written while open)
 * @param values  current form values (a flat object of the fields to persist)
 * @param restore called once when the modal opens with the saved draft (or null) —
 *                set your state from it, falling back to defaults
 * @returns clear() — removes the saved draft; call on Save and Cancel
 */
export function useSessionDraft<T extends Record<string, unknown>>(
  key: string,
  open: boolean,
  values: T,
  restore: (draft: Partial<T> | null) => void,
): () => void {
  const serialized = JSON.stringify(values);

  // Hydrate once per open (not on every keystroke). `restore` is intentionally
  // excluded from deps — it's recreated each render; we only want to hydrate when
  // the modal opens or the key changes.
  useEffect(() => {
    if (!open) return;
    let draft: Partial<T> | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) draft = JSON.parse(raw) as Partial<T>;
    } catch { /* ignore a corrupt/blocked draft */ }
    restore(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // Persist on every change while the modal is open.
  useEffect(() => {
    if (!open) return;
    try { sessionStorage.setItem(key, serialized); } catch { /* quota / disabled */ }
  }, [open, key, serialized]);

  return useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }, [key]);
}
