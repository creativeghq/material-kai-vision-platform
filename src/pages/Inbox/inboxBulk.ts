export interface BulkResult { done: string[]; failed: Array<{ id: string; error: string }> }

export async function runBulk(ids: string[], fn: (id: string) => Promise<unknown>, concurrency = 4): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [] };
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        await fn(id);
        result.done.push(id);
      } catch (e) {
        result.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return result;
}

/** "Archived 12" or "Archived 10 of 12 — 2 failed: <reason>". A partial run is never reported as done. */
export function bulkSummary(verb: string, r: BulkResult): { title: string; description?: string; failed: boolean } {
  const total = r.done.length + r.failed.length;
  if (r.failed.length === 0) return { title: `${verb} ${total}`, failed: false };
  return {
    title: `${verb} ${r.done.length} of ${total}`,
    description: `${r.failed.length} failed: ${r.failed[0].error}`,
    failed: true,
  };
}
