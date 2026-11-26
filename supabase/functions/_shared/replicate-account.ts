/** Is the Replicate ACCOUNT accepting jobs? One answer for every model, from one near-free create. */
import type { ProbeStatus } from './agents/probeVocabulary.generated.ts';

const API = 'https://api.replicate.com/v1';
/** Billed by GPU-second, so a create cancelled at once costs close to nothing. */
const PROBE_MODEL = '851-labs/background-remover';
/** 16x16 PNG, inline, so the probe depends on no bucket of ours. */
const PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKUlEQVR4nO3'
  + 'MMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAOBtQAABAAEfAAAAAElFTkSuQmCC';

/** Map an HTTP status from the provider onto a verdict we can act on. */
export function classifyProbe(httpStatus: number, body = ''): ProbeStatus {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  if (httpStatus === 402) return 'credit_exhausted';
  if (httpStatus === 404) return 'not_found';
  if (/insufficient credit|payment required|billing|exhausted balance/i.test(body)) return 'credit_exhausted';
  if (httpStatus === 401 || httpStatus === 403) return 'auth_failed';
  if (httpStatus === 422 || httpStatus === 400) return 'schema_rejected';
  return 'error';
}

export interface AccountVerdict { status: ProbeStatus; error: string | null }

/** `null` when the provider throttled us: that is no verdict, never a refusal. */
export async function probeReplicateAccount(token: string, timeoutMs = 15_000): Promise<AccountVerdict | null> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const meta = await fetch(`${API}/models/${PROBE_MODEL}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!meta.ok) {
      const text = (await meta.text()).slice(0, 300);
      if (meta.status === 429) return null;
      const status = classifyProbe(meta.status, text);
      // A 404 here is about the probe's own model, never about the account.
      return { status: status === 'not_found' ? 'error' : status, error: `HTTP ${meta.status}: ${text}` };
    }
    const version = (await meta.json())?.latest_version?.id;
    const res = await fetch(`${API}/predictions`, {
      method: 'POST', headers, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ version, input: { image: PROBE_IMAGE } }),
    });
    if (res.status === 429) { await res.body?.cancel(); return null; }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { status: classifyProbe(res.status, text), error: `HTTP ${res.status}: ${text}` };
    }
    const id = (await res.json())?.id;
    if (id) await fetch(`${API}/predictions/${id}/cancel`, { method: 'POST', headers }).catch(() => {});
    return { status: 'ok', error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: /abort|timed? ?out/i.test(msg) ? 'timeout' : 'error', error: msg };
  }
}
