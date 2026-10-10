import { HttpError } from './api-logger.ts';
import { MAX_OUTREACH_STEPS, OUTREACH_MAX_LEAD_MS, OUTREACH_MIN_LEAD_MS } from './outreachLimits.generated.ts';

/** `steps: [{body, send_at}]` (or a lone `body` + `send_at`): a follow-up chain, each step in the allowed window and after the one before. */
export function parseOutreachSteps(payload: Record<string, unknown>): Array<{ body: string; sendAt: string }> {
  const raw = Array.isArray(payload.steps)
    ? payload.steps as Array<Record<string, unknown>>
    : payload.body != null ? [{ body: payload.body, send_at: payload.send_at }] : [];
  if (!raw.length) throw new HttpError(400, 'Add at least one follow-up');
  if (raw.length > MAX_OUTREACH_STEPS) throw new HttpError(400, `At most ${MAX_OUTREACH_STEPS} follow-ups in one sequence`);
  const now = Date.now();
  let prev = 0;
  return raw.map((st, i) => {
    const text = String(st.body ?? '').trim();
    if (!text) throw new HttpError(400, `Write follow-up ${i + 1}`);
    const at = new Date(String(st.send_at ?? '')).getTime();
    if (Number.isNaN(at) || at < now + OUTREACH_MIN_LEAD_MS || at > now + OUTREACH_MAX_LEAD_MS) {
      throw new HttpError(400, `Pick a time for follow-up ${i + 1} between a minute and a year from now`);
    }
    if (at <= prev) throw new HttpError(400, `Follow-up ${i + 1} must be after follow-up ${i}`);
    prev = at;
    return { body: text.slice(0, 20_000), sendAt: new Date(at).toISOString() };
  });
}
