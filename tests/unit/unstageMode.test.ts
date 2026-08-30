import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { resolveGenerationRouting } from '../../supabase/functions/_shared/generation-routing.ts';
import { TOOL_MANIFEST } from '../../src/components/features/ai/toolManifest.generated.ts';
import { TOOLKITS } from '../../src/components/features/ai/agentToolsCatalog';

/**
 * `unstage` — remove every movable object from a room photo and reconstruct what was behind it.
 *
 * It is the inverse of everything else in the interior stack, and that is exactly why it is
 * fragile. Every OTHER path here ADDS: the Replicate grid restyles a room, `generate-virtual-
 * staging` furnishes one and says so in its own description ("Stage an EMPTY room"), and
 * `image-edit`'s prompt is built to PRESERVE "every fixed element ... sink, vanity, toilet,
 * shower, bath" plus the furniture. So a mode that deletes has to be wired against the grain at
 * five separate points, and four of the five fail SILENTLY when missed:
 *
 *   - not in the tool's z.enum      → the agent can never ask for it; it answers in prose instead
 *   - not in GEMINI_ONLY_MODES      → the Replicate grid runs too and returns a confidently
 *                                     FURNISHED room beside the one tile that emptied it
 *   - not in EDIT_MODES             → invariant 9b's gate is skipped on a user-supplied image
 *   - not in GROK_UNSUPPORTED_MODES → `tier: 'grok'` bills grok-aurora and runs Gemini anyway,
 *                                     the wrong-but-valid number generation-routing.ts exists for
 *
 * Only the first has a visible symptom, and it looks like the model being unhelpful.
 */

const root = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(root, p), 'utf8'));

const EDGE = 'supabase/functions/generate-interior-gemini/index.ts';
const TOOLS = 'supabase/functions/_shared/tools/generation-tools.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';

describe('unstage — the agent can actually ask for it', () => {
  it('is a value of generate_gemini\'s mode enum in the generated manifest', () => {
    // The manifest is the AST projection of the real zod schema, so this reads what the model
    // is offered rather than what a hand-kept list claims.
    const tool = TOOL_MANIFEST.find((t) => t.name === 'generate_gemini');
    expect(tool, 'generate_gemini missing from the manifest').toBeTruthy();
    const modeParam = tool!.params.find((p) => p.name === 'mode');
    expect(modeParam, 'generate_gemini has no `mode` param').toBeTruthy();
    expect(modeParam!.type, 'mode degraded to a plain string — an unresolved enum').toBe('enum');
    expect(modeParam!.enum).toContain('unstage');
  });

  it('is reachable from the interior toolkit as a quick-start that pins the mode', () => {
    const generation = TOOLKITS.find((t) => t.id === 'generation');
    expect(generation, 'generation toolkit missing').toBeTruthy();
    const qs = generation!.quick_starts?.find((q) => q.generation?.mode === 'unstage');
    expect(qs, 'no quick-start pins mode:unstage').toBeTruthy();
    // It transforms a photo the user supplies, so it must actually collect one — a quick-start
    // that pins an image mode and captures no image sends the agent to an empty reference.
    expect(qs!.imageRequired).toBe(true);
    expect(qs!.generation!.imageKeys?.length ?? 0).toBeGreaterThan(0);
    const photoKey = qs!.generation!.imageKeys![0];
    const photoField = qs!.form?.find((f) => f.key === photoKey);
    expect(photoField?.kind, `form has no image field for '${photoKey}'`).toBe('image');
    expect(photoField?.required).toBe(true);
  });
});

describe('unstage — the Replicate grid must not run alongside it', () => {
  it('is listed in agent-chat\'s GEMINI_ONLY_MODES', () => {
    const src = read(AGENT_CHAT);
    const block = src.match(/const GEMINI_ONLY_MODES\s*=\s*\[([\s\S]*?)\]/);
    expect(block, 'GEMINI_ONLY_MODES not found — did it get renamed?').toBeTruthy();
    expect(block![1]).toContain("'unstage'");
  });
});

describe('unstage — billing and the model that runs cannot disagree', () => {
  it('routes to Gemini on every tier, including an explicit grok request', () => {
    for (const tier of ['fast', 'pro', 'grok'] as const) {
      const r = resolveGenerationRouting('unstage', tier);
      expect(r.provider, `tier=${tier}`).toBe('gemini');
      // The label is what both the credit lookup and the ai_usage_logs row are keyed on.
      expect(r.modelLabel, `tier=${tier}`).toBe(r.geminiModel);
      expect(r.modelLabel, `tier=${tier}`).not.toBe('grok-aurora');
    }
  });

  it('charges the Gemini rate, not the Grok one, when Grok was asked for', () => {
    expect(resolveGenerationRouting('unstage', 'grok').credits)
      .toBe(resolveGenerationRouting('unstage', 'fast').credits);
  });

  it('is pinned to the pro tier by the tool — flash smears the reconstructed floor', () => {
    const src = read(TOOLS);
    const body = src.match(/model_tier:[\s\S]{0,240}/);
    expect(body, 'model_tier assignment not found in the request body').toBeTruthy();
    expect(body![0]).toContain("'unstage'");
  });
});

describe('unstage — the image-edit gate applies', () => {
  it('is listed in EDIT_MODES, so assertEditableSource runs on the source photo', () => {
    const src = read(EDGE);
    const block = src.match(/const EDIT_MODES:\s*GenerationMode\[\]\s*=\s*\[([\s\S]*?)\]/);
    expect(block, 'EDIT_MODES not found').toBeTruthy();
    expect(block![1]).toContain("'unstage'");
  });

  it('records the generation as image_to_image, not the hybrid fallback', () => {
    const src = read(EDGE);
    const block = src.match(/const REQUEST_TYPE_BY_MODE[\s\S]*?\};/);
    expect(block, 'REQUEST_TYPE_BY_MODE not found').toBeTruthy();
    expect(block![0]).toMatch(/'unstage':\s*'image_to_image'/);
  });
});

describe('unstage — reachable from the image modal, on BOTH grids', () => {
  const HUB = 'src/components/features/ai/AgentHub.tsx';
  const GRID = 'src/components/features/ai/ProgressiveImageGrid.tsx';

  it('the modal emits the |UNSTAGE| sentinel next to Virtual Staging', () => {
    const src = read(GRID);
    expect(src).toContain("'|UNSTAGE|'");
    // The button is only useful beside the action it precedes.
    expect(src).toContain('Virtual Staging');
  });

  it('|UNSTAGE| is a registered direct-edit action mapped to the unstage mode', () => {
    const src = read(HUB);
    const table = src.match(/const DIRECT_EDIT_ACTIONS\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(table, 'DIRECT_EDIT_ACTIONS not found').toBeTruthy();
    expect(table![1]).toMatch(/sentinel:\s*'\|UNSTAGE\|',\s*mode:\s*'unstage'/);
  });

  it('BOTH onEditImage handlers decode through the shared helper, not an inline copy', () => {
    // There are two identical handlers — the in-message grid and the single-image modal.
    // The sentinel branch was already copy-pasted into both once; a surviving inline
    // `indexOf('|LIGHTING|')` means one surface silently ignores every action added since,
    // falling through to "open the edit modal" with no error.
    const src = read(HUB);
    const handlers = src.match(/onEditImage=\{\(imageUrl\)\s*=>\s*\{/g) ?? [];
    expect(handlers.length, 'expected exactly two onEditImage handlers').toBe(2);
    expect(src, 'an inline sentinel decode survives').not.toMatch(/indexOf\('\|LIGHTING\|'\)/);
    const decodeCalls = src.match(/decodeDirectEditAction\(imageUrl\)/g) ?? [];
    expect(decodeCalls.length, 'not every handler calls the shared decoder').toBe(handlers.length);
  });
});

describe('unstage — the staging skill routes a FURNISHED room through it', () => {
  // This skill is the tool-ORDER authority for the interior agent. Before unstage existed it
  // sent every "stage this" straight to virtual_staging, and rule 5 forbade calling
  // generate_gemini and virtual_staging in the same turn — which is exactly the chain.
  const md = readFileSync(join(root, 'supabase/functions/_shared/skills/interior-staging-workflow/SKILL.md'), 'utf8');
  const ts = readFileSync(join(root, 'supabase/functions/_shared/skills/interior-staging-workflow/skill.ts'), 'utf8');

  it('names the unstage mode in its decision tree', () => {
    expect(md).toContain('mode=`unstage`');
  });

  it('tells the agent to unstage BEFORE staging a furnished photo', () => {
    expect(md).toMatch(/unstage[\s\S]{0,120}then[\s\S]{0,40}virtual_staging/i);
  });

  it('carves the chain out of the never-call-both rule', () => {
    // Rule 5 stays — it is right for two takes on one brief. It just must not read as a ban
    // on the two-halves-of-one-job case, or the agent follows it and stages a furnished room.
    const rule = md.slice(md.indexOf('Never call both'));
    expect(rule).toMatch(/exception/i);
  });

  it('the shipped .ts twin is in sync with the reviewed .md', () => {
    // `npm run skills:sync` generates the .ts; the .md is what gets read in review. A drifted
    // pair means the prompt that ships is not the one anybody approved. The generator escapes
    // every backtick, so undo that rather than pinning the escaping — which is also the thing
    // String.raw gets wrong, leaking a literal backslash into the prompt.
    const unescaped = ts.replace(/\\`/g, '`');
    for (const marker of ['mode=`unstage`', 'exception']) {
      expect(unescaped, `skill.ts missing '${marker}' — run npm run skills:sync`).toContain(marker);
    }
  });
});

describe('unstage — the prompt comes from the database', () => {
  const src = read(EDGE);
  const branch = src.match(/else if \(mode === 'unstage'\)\s*\{[\s\S]*?\n {4}\}/);

  it('has a dedicated branch rather than reusing image-edit\'s preserve-everything prompt', () => {
    expect(branch, "no `else if (mode === 'unstage')` branch").toBeTruthy();
  });

  it('loads interior_unstage through the DB loader', () => {
    expect(branch![0]).toContain("getGenerationPrompt(supabase, 'interior_unstage')");
  });

  it('carries no hardcoded prompt fallback', () => {
    // The banned shape is a long instruction string sitting in the branch as a `||` / `??`
    // fallback or a catch. `getGenerationPrompt` throws by design; a fallback here would be
    // invisible the moment somebody edits the row in /admin/ai-configs.
    expect(branch![0]).not.toMatch(/\bcatch\b/);
    const longStringLiterals = branch![0].match(/'[^'\n]{80,}'|`[^`]{80,}`/g) ?? [];
    expect(longStringLiterals, 'a prompt-sized literal is inlined in the unstage branch').toEqual([]);
  });
});
