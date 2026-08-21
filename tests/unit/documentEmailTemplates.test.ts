/**
 * "Use this template for my invoice emails" spans three files, and two of the three failures are
 * silent.
 *
 *   1. `DOCUMENT_EMAIL_KINDS`  — src/modules/email-marketing/services/marketingService.ts
 *      What the UI OFFERS, and which placeholders it tells the author are required.
 *   2. `DOCUMENT_EMAIL_VARIABLES` — supabase/functions/_shared/document-email-template.ts
 *      What the sending side actually FILLS.
 *   3. `resolveDocumentEmailTemplate(..., '<kind>')` — the sending edge function itself.
 *      Whether anything looks the assignment up at all.
 *
 * Offer a kind that no edge function resolves and the assignment saves, renders a badge, and
 * changes nothing about the email that goes out — the silent-zero shape, wearing a checkbox.
 * Declare a variable the UI advertises but the sender never fills and it lands as '' rather than
 * as data, so a template built around it quietly loses a line.
 *
 * Two more copies live in the database and a repo-file guard cannot see either — they are in
 * pg_catalog, not in the checkout. Both fail LOUDLY rather than silently, which is why they are
 * left to the database instead of mirrored here:
 *
 *   • The CHECK on `workspace_document_email_templates.document_kind` — an unknown kind is
 *     rejected at write time with a constraint violation.
 *   • `document_email_required_tags(kind)` — the required-placeholder list, shared by the
 *     assignment trigger and the edit-time drift trigger. If it required MORE than the `required`
 *     list here advertises, the assignment is refused with a message naming the missing tag; if
 *     it required LESS, a template the UI called non-compliant would be accepted and the author
 *     sees the gap the first time they look at the mail. Neither is the silent shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const CLIENT = 'src/modules/email-marketing/services/marketingService.ts';
const EDGE = 'supabase/functions/_shared/document-email-template.ts';

/** Pull `kind: 'x'`, its `required: [...]` and its `variables: [...]` out of the client catalog. */
function clientKinds(): Array<{ kind: string; required: string[]; variables: string[] }> {
  const src = read(join(ROOT, CLIENT));
  const block = src.slice(src.indexOf('DOCUMENT_EMAIL_KINDS'));
  const out: Array<{ kind: string; required: string[]; variables: string[] }> = [];
  const entry = /kind:\s*'([a-z_]+)'[\s\S]*?required:\s*\[([^\]]*)\][\s\S]*?variables:\s*\[([^\]]*)\]/g;
  const list = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  for (const m of block.matchAll(entry)) {
    out.push({ kind: m[1], required: list(m[2]), variables: list(m[3]) });
  }
  return out;
}

/** Pull `<kind>: [ 'a', 'b' ]` out of the edge-side DOCUMENT_EMAIL_VARIABLES map. */
function edgeVariables(): Record<string, string[]> {
  const src = read(join(ROOT, EDGE));
  const start = src.indexOf('DOCUMENT_EMAIL_VARIABLES');
  const block = src.slice(start, src.indexOf('} as const;', start));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/([a-z_]+):\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  return out;
}

/** Which kinds some edge function actually resolves an assignment for. */
function resolvedKinds(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts')) continue;
      const src = read(p);
      for (const m of src.matchAll(/resolveDocumentEmailTemplate\([^)]*?'([a-z_]+)'\s*\)/g)) {
        const rel = p.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
        if (rel === EDGE) continue; // the helper's own signature, not a call site
        out.set(m[1], [...(out.get(m[1]) ?? []), rel]);
      }
    }
  };
  walk(join(ROOT, 'supabase/functions'));
  return out;
}

describe('document email template overrides', () => {
  const kinds = clientKinds();
  const edge = edgeVariables();
  const resolved = resolvedKinds();

  it('the scan found both catalogs — an empty one would vouch for everything', () => {
    expect(kinds.length, `no kinds parsed out of ${CLIENT}`).toBeGreaterThan(0);
    expect(Object.keys(edge).length, `no kinds parsed out of ${EDGE}`).toBeGreaterThan(0);
  });

  it('every kind the UI offers is filled by the sending side', () => {
    const offenders = kinds.filter((k) => !edge[k.kind]).map((k) => k.kind);
    expect(
      offenders,
      `offered in ${CLIENT} but absent from DOCUMENT_EMAIL_VARIABLES in ${EDGE}: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the two catalogs advertise the SAME variables', () => {
    const offenders: string[] = [];
    for (const k of kinds) {
      const there = edge[k.kind];
      if (!there) continue; // reported above
      const missing = k.variables.filter((v) => !there.includes(v));
      const extra = there.filter((v) => !k.variables.includes(v));
      if (missing.length) offenders.push(`${k.kind}: UI advertises ${missing.join(', ')} — the sender never fills them (they render as '')`);
      if (extra.length) offenders.push(`${k.kind}: the sender fills ${extra.join(', ')} — the UI never tells an author they exist`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every REQUIRED placeholder is one the sender actually supplies', () => {
    // The DB trigger refuses a template that omits a required placeholder. Requiring one nothing
    // fills would force every author to include a token that always renders empty.
    const offenders: string[] = [];
    for (const k of kinds) {
      for (const r of k.required) {
        if (!k.variables.includes(r)) offenders.push(`${k.kind}: requires '${r}' which is not in its own variable list`);
        else if (edge[k.kind] && !edge[k.kind].includes(r)) offenders.push(`${k.kind}: requires '${r}' which the sender never fills`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every kind is resolved by a real sending function', () => {
    const offenders = kinds
      .filter((k) => !resolved.has(k.kind))
      .map((k) => `${k.kind} — nothing calls resolveDocumentEmailTemplate(..., '${k.kind}'), so assigning a template to it does nothing`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('a sending function only resolves a kind the catalogs know', () => {
    const known = new Set(kinds.map((k) => k.kind));
    const offenders = [...resolved.entries()]
      .filter(([kind]) => !known.has(kind))
      .map(([kind, files]) => `${kind} resolved in ${files.join(', ')} but absent from DOCUMENT_EMAIL_KINDS`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the sending functions pass every variable through withAllVars', () => {
    // `renderTemplateWithVariables` leaves an unknown {{key}} in the output VERBATIM, so a
    // template referencing a placeholder the caller forgot would mail "{{pay_url}}" as text to a
    // customer. `withAllVars` is what guarantees a value for every documented key.
    const offenders: string[] = [];
    for (const [kind, files] of resolved) {
      for (const f of files) {
        const src = read(join(ROOT, f));
        if (!src.includes('withAllVars')) {
          offenders.push(`${f} resolves '${kind}' but builds its variables without withAllVars`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
