/** Work that must outlive the response. */
export function runInBackground(work: Promise<unknown>, label = 'background'): Promise<void> {
  const guarded = work.catch((err) => console.error(`[${label}] background task failed`, err));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(guarded);
    return Promise.resolve();
  }
  return guarded as Promise<void>;
}
