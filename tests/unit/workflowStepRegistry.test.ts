/**
 * A workflow chunk names a workflow that exists, and a step that belongs to it (#395).
 *
 * `WorkflowTracker` resolves everything from the chunk: `getWorkflow(runtime.definition_id)` gives
 * the header name, the icon, and the step list each incoming `step_id` is matched against. A step
 * the definition does not contain still renders — `title={s.def?.title || s.id}` — as a raw id row
 * with no title, no icon and no description, bolted onto whatever plan was named.
 *
 * That is what `translate_pdf_to_catalog` did: it emitted a `catalog-build` plan and
 * `step_id: 'translate' as any`, while the registry puts `translate` in `catalog-translate` — on
 * that step's own `tool_id`, pointing back at this very tool. The `as any` was the tell, and the
 * comment beside it claimed the wizard "advances from Translate PDF → Generate PDF
 * automatically", which `catalog-build` has no Translate PDF step to do.
 *
 * Two hand-kept lists across the Vite/Deno boundary — `STEPS` in `_workflow-chunks.ts` and the
 * `steps:` arrays in `workflowRegistry.ts` — whose own header says they "must match exactly".
 * They did. Nothing held them there.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const TOOLS = join(ROOT, 'supabase', 'functions', '_shared', 'tools');

const registrySrc = readFileSync(join(ROOT, 'src/components/features/ai/workflows/workflowRegistry.ts'), 'utf8');
const chunksSrc = readFileSync(join(TOOLS, '_workflow-chunks.ts'), 'utf8');

/** definition id → ordered step ids, parsed from the registry's own literals. */
function registryDefinitions(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /const\s+\w+:\s*WorkflowDefinition\s*=\s*\{/g;
  for (const m of registrySrc.matchAll(re)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    while (depth > 0 && i < registrySrc.length) {
      if (registrySrc[i] === '{') depth++;
      else if (registrySrc[i] === '}') depth--;
      i++;
    }
    const body = registrySrc.slice(m.index! + m[0].length, i);
    const id = /id:\s*'([a-z0-9-]+)'/.exec(body)?.[1];
    const stepsAt = body.indexOf('steps:');
    if (!id || stepsAt === -1) continue;
    out.set(id, [...body.slice(stepsAt).matchAll(/\{\s*id:\s*'([a-z0-9_]+)'/g)].map((s) => s[1]));
  }
  return out;
}

/** The server-side inventory: `STEPS = { NAME: [...] as const }`. */
function serverSteps(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of chunksSrc.matchAll(/(\w+):\s*\[([^\]]*)\]\s*as const/g)) {
    out.set(m[1], [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((s) => s[1]));
  }
  return out;
}

/** `STEPS` key → registry definition id. Both sides name the same five workflows. */
const PAIRS: Record<string, string> = {
  CATALOG_BUILD: 'catalog-build',
  MENTION_MONITOR: 'mention-monitor',
  SEO_ARTICLE: 'seo-article',
  PRESENTATION_SHEET: 'presentation-sheet',
  B2B_RESEARCH: 'b2b-research',
};

describe('#395 — the workflow step vocabulary is one list, twice', () => {
  it('both sides parse to something real', () => {
    // Without this, a broken parser makes every comparison below vacuous.
    const defs = registryDefinitions();
    expect(defs.size).toBeGreaterThanOrEqual(8);
    expect(defs.get('catalog-build')?.length).toBeGreaterThanOrEqual(7);
    expect(serverSteps().size).toBeGreaterThanOrEqual(5);
  });

  it('every STEPS inventory matches its registry definition, in order', () => {
    const defs = registryDefinitions();
    const steps = serverSteps();
    for (const [key, slug] of Object.entries(PAIRS)) {
      expect(steps.get(key), `STEPS.${key} is missing`).toBeDefined();
      expect(defs.get(slug), `${slug} is missing from the registry`).toBeDefined();
      expect(steps.get(key), `STEPS.${key} vs ${slug}`).toEqual(defs.get(slug));
    }
  });

  it('every step_id a tool emits belongs to a real workflow', () => {
    const known = new Set([...registryDefinitions().values()].flat());
    const offenders: string[] = [];
    for (const file of readdirSync(TOOLS).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(TOOLS, file), 'utf8');
      for (const m of src.matchAll(/step_id:\s*'([a-z0-9_]+)'/g)) {
        if (!known.has(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders,
      'These step ids are emitted and belong to no workflow definition. The tracker renders them '
      + 'as a raw id row with no title or icon:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every definition_id a tool emits is a real workflow', () => {
    const known = new Set(registryDefinitions().keys());
    const offenders: string[] = [];
    for (const file of readdirSync(TOOLS).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(TOOLS, file), 'utf8');
      for (const m of src.matchAll(/definition_id:\s*'([a-z0-9-]+)'/g)) {
        if (!known.has(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders, `unknown workflow ids:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the catalog emitter names its workflow rather than assuming one', () => {
    // Comments stripped: the doc block above the emitter QUOTES the old `'translate' as any` to
    // explain it, and a scan that reads prose convicts the explanation instead of the code.
    const catalog = stripComments(readFileSync(join(TOOLS, 'catalog-tools.ts'), 'utf8'));
    expect(catalog).toMatch(/definition_id: args\.definition_id,/);
    expect(catalog, 'the plan hardcodes catalog-build again')
      .not.toMatch(/type: 'workflow_plan',\s*\n\s*run_id: args\.catalog_id,\s*\n\s*definition_id: 'catalog-build',/);
    // The translate tool is catalog-translate's first step — the registry says so on its tool_id.
    expect(catalog).toMatch(/definition_id: 'catalog-translate',/);
    expect(catalog, "a step id is cast past its own union again").not.toMatch(/step_id: '[a-z_]+' as any/);
  });

  it('a step naming a tool names one that exists', () => {
    /**
     * `tool_id` is documented as "purely informational; the agent picks" — the form values are
     * serialised into a chat message, not passed to the tool as arguments, so a mismatched FIELD
     * NAME is translated by the model rather than dropped. That is why this checks the tool
     * exists and not that the field names line up.
     *
     * Documentation that names nothing is still a defect in this codebase: `unlinkedOnly`
     * promised a guarantee it did not implement, and the ops tools' comment claimed an isAdmin
     * gate that was not there. Both were found by reading the comment and then the code.
     */
    const manifest = readFileSync(join(ROOT, 'src/components/features/ai/toolManifest.generated.ts'), 'utf8');
    const toolNames = new Set([...manifest.matchAll(/^ {4}name: '([a-z0-9_]+)',$/gm)].map((m) => m[1]));
    expect(toolNames.size).toBeGreaterThan(150);

    // Steps whose `tool_id` names something that is deliberately NOT an agent tool. Each entry
    // is an edge function the UI drives directly, and shrinking this list is the direction of
    // travel — an agent step that cannot be run by an agent is a step the wizard cannot finish.
    const NOT_A_TOOL = new Set(['catalog-send-to-customers']);

    const offenders: string[] = [];
    for (const m of registrySrc.matchAll(/tool_id:\s*'([a-z0-9_.-]+)'/g)) {
      if (!toolNames.has(m[1]) && !NOT_A_TOOL.has(m[1])) offenders.push(m[1]);
    }
    expect([...new Set(offenders)],
      'A workflow step names a tool that is not in the manifest. Either the tool was renamed and '
      + `the registry still names the old one, or the step describes work nothing can do:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the mention workflow asks for a subject its tool can enrol', () => {
    // `mention-monitor`'s first step asks for `subject_label` + `subject_type`, and
    // `track_product_mentions` required a `product_id` and offered nothing else — so launching
    // "Monitor mentions" and typing a brand name reached a step no bound tool could act on.
    // MIVAA has served `POST /track` with subject_label since the feature shipped.
    const manifest = readFileSync(join(ROOT, 'src/components/features/ai/toolManifest.generated.ts'), 'utf8');
    const entry = manifest.slice(manifest.indexOf("name: 'track_product_mentions'"));
    const body = entry.slice(0, entry.indexOf('\n  {'));
    expect(body).toMatch(/\{ name: 'subject_label'/);
    expect(body).toMatch(/\{ name: 'subject_type', type: 'enum', enum: \['brand', 'keyword'\]/);
    expect(body, 'product_id is mandatory again, so the subject arm is unreachable')
      .toMatch(/\{ name: 'product_id', type: 'string', optional: true/);
  });

  it('the registry step that names a tool is a step that tool can emit', () => {
    // `catalog-translate.translate` declares `tool_id: 'translate_pdf_to_catalog'`; that tool has
    // to be able to report it, or the definition describes something unreachable.
    const defs = registryDefinitions();
    expect(defs.get('catalog-translate')).toContain('translate');
    const catalog = stripComments(readFileSync(join(TOOLS, 'catalog-tools.ts'), 'utf8'));
    expect(catalog).toMatch(/step_id: 'translate',/);
  });
});
