/**
 * Work that must outlive the response.
 *
 * An edge isolate is torn down once its handler resolves. A promise left running at that moment is
 * killed mid-flight — and because nothing throws, the only evidence is a metric that stays at zero
 * forever, which is the dominant failure shape in this platform (see CLAUDE.md, "silent zero").
 * `EdgeRuntime.waitUntil` keeps the worker alive until the work settles; where it is unavailable
 * (local `deno run`, tests) we fall back to awaiting inline, which is slower but never lossy.
 *
 * This lives in ONE place on purpose. It was written twice — the payments webhook had it with a
 * careful explanation, and the agent-chat memory gate fired its (billable) Haiku call with a bare
 * `.catch()` and no keep-alive at all.
 */
export function runInBackground(work: Promise<unknown>, label = 'background'): Promise<void> {
  const guarded = work.catch((err) => console.error(`[${label}] background task failed`, err));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(guarded);
    return Promise.resolve();
  }
  return guarded as Promise<void>;
}
