/**
 * Manifest-derived quick-start form fields (issue #266, Phase 2).
 *
 * The drift this removes: a tool declares `z.enum(['veo-2', 'kling-v3.0', …])` and
 * the picker's form has to mirror those choices by hand — so options ship in the
 * schema and never reach the UI, or the hand-written `select` keeps offering a value
 * the enum dropped. Instead, a quick-start can declare only WHICH tool it runs:
 *
 *     { label: 'Make a video', run: { tool: 'generate_video' }, autoFields: true }
 *
 * and the fields come from toolManifest.generated.ts — enum → select, boolean →
 * yes/no select, number → number, string → text, `.describe()` → the field's help.
 * Adding an option to the tool's schema then surfaces it in the UI with ZERO
 * frontend edits, which is the whole point of the manifest.
 *
 * Hand-authored `form` entries still win per-key, so a quick-start can relabel one
 * field or pin a nicer placeholder without giving up derivation for the rest.
 */
import type { ToolkitFormField, ToolkitQuickStart, ToolkitQuickStartRun } from './agentToolsCatalog';
import { TOOL_MANIFEST_BY_NAME, type ToolManifestParam } from './toolManifest.generated';

/** `duration_seconds` → `Duration seconds`. Zod param names are snake_case. */
function humanize(name: string): string {
  const s = name.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `walkthrough` → `Walkthrough`; `16:9` / `veo-2` are left alone. */
function optionLabel(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) return value;
  return humanize(value);
}

function fieldFor(param: ToolManifestParam): ToolkitFormField {
  const base = {
    key: param.name,
    label: humanize(param.name),
    required: !param.optional,
    ...(param.description ? { help: param.description } : {}),
  };

  if (param.enum?.length) {
    return {
      ...base,
      kind: 'select',
      options: param.enum.map((v) => ({ value: v, label: optionLabel(v) })),
    };
  }
  if (param.type === 'boolean') {
    return { ...base, kind: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
  }
  if (param.type === 'number') return { ...base, kind: 'number' };
  if (param.type === 'array') return { ...base, kind: 'tags', placeholder: 'One per line, or comma-separated' };
  return { ...base, kind: 'text' };
}

/**
 * Params a derived form must NOT ask the user for. Two kinds:
 *  - pinned by the quick-start itself (`fixedArgs`) — asking would let the answer
 *    overwrite the pin, since buildToolInput applies form values after fixedArgs;
 *  - plumbing the caller supplies (ids resolved from context, workflow correlation).
 */
const NEVER_ASK = new Set(['_workflow_run_id']);

/**
 * Params to leave out of a derived form.
 *
 * OPTIONAL ids are context: the tool resolves them itself (`project_id` OR a fuzzy
 * `project_name`), so asking for a UUID would be worse than not asking. REQUIRED ids
 * are NOT filtered — dropping one would build a form that cannot produce a valid
 * call, which is the failure this module exists to prevent. A tool whose required id
 * only a prior result can supply belongs on OPTIONS_EXEMPT, not in a quick-start.
 */
const isPlumbing = (p: ToolManifestParam) =>
  NEVER_ASK.has(p.name) ||
  p.name.startsWith('_') ||
  (p.optional && (p.name.endsWith('_id') || p.name === 'id'));

/**
 * Param shapes no text box can produce. `z.record(z.any())` / nested `z.object`
 * params (manage_flows.trigger_config, .actions) need structure a string field
 * cannot express — deriving a text input for them would send the tool a string
 * where its schema wants an object, i.e. build the exact failure this module exists
 * to prevent. They stay agent-only unless the quick-start hand-writes a field.
 */
const isUnrepresentable = (p: ToolManifestParam) =>
  !p.enum?.length && (p.type === 'object' || p.type === 'union' || p.type === 'unknown');

/**
 * Fields for a quick-start, derived from its target tool's schema.
 *
 * Returns `[]` for quick-starts that neither declare `run` nor opt in, so callers can
 * use it unconditionally. Ordering: required params first (in schema order), then
 * optional ones — so the form opens on what the user must answer.
 */
export function deriveAutoFields(qs: Pick<ToolkitQuickStart, 'run' | 'form' | 'autoFields'>): ToolkitFormField[] {
  const run: ToolkitQuickStartRun | undefined = qs.run;
  // Derivation is EXPLICIT opt-in. It must not fire for a form-less run quick-start
  // just because it has no form: "Low stock" pins `action: 'list_low_stock'` and is
  // meant to be one click, and deriving would put six optional fields in front of it.
  // No `run` (prompt-template and image-generation quick-starts) → nothing to derive
  // from at all.
  if (!run || !qs.autoFields) return qs.form ?? [];

  const tool = TOOL_MANIFEST_BY_NAME[run.tool];
  if (!tool) return qs.form ?? [];

  const pinned = new Set(Object.keys(run.fixedArgs ?? {}));
  // A hand-authored field overrides the derived one for the SAME resolved tool arg.
  const overrides = new Map(
    (qs.form ?? []).map((f) => [run.argMap?.[f.key] ?? f.key, f] as const),
  );

  const derived = tool.params
    .filter((p) => !pinned.has(p.name) && !isPlumbing(p))
    .filter((p) => !isUnrepresentable(p) || overrides.has(p.name))
    .map((p) => overrides.get(p.name) ?? fieldFor(p));

  // Hand-authored fields that map to no schema param (or to a pinned one) are kept
  // as-is and appended — they are the quick-start author's deliberate extras.
  const derivedKeys = new Set(derived.map((f) => f.key));
  const extras = (qs.form ?? []).filter((f) => !derivedKeys.has(f.key));

  const ordered = [...derived, ...extras];
  return [
    ...ordered.filter((f) => f.required),
    ...ordered.filter((f) => !f.required),
  ];
}

/**
 * Coercions a derived run needs so numeric/boolean params don't arrive as strings.
 * Merged UNDER the quick-start's own `coerce`, which stays authoritative.
 */
export function deriveCoercions(run: ToolkitQuickStartRun): NonNullable<ToolkitQuickStartRun['coerce']> {
  const tool = TOOL_MANIFEST_BY_NAME[run.tool];
  if (!tool) return run.coerce ?? {};
  const out: NonNullable<ToolkitQuickStartRun['coerce']> = {};
  for (const p of tool.params) {
    if (p.type === 'number') out[p.name] = 'number';
    else if (p.type === 'boolean') out[p.name] = 'boolean';
    else if (p.type === 'array') out[p.name] = 'lines';
  }
  return { ...out, ...(run.coerce ?? {}) };
}
