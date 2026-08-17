/**
 * Guard for the generation model registry (issue #4 Phase 1).
 *
 * WHY THIS TEST EXISTS.
 * Every generation defect in #4 is the same shape: a model id written down in one place and not
 * another. A 404 model stayed selectable at 12 credits for months. Five models had no price row
 * and fell through to a flat $0.01 default. `replicateConfig.ts` drifted from the MIVAA roster in
 * both directions. The same Kling model is spelled `kling-3.0`, `kling-v3.0` and `kling-1.6-pro`
 * across three files, and two hand-written identity maps exist purely to bridge spellings.
 *
 * None of that is catchable by the other gates. A wrong price is a valid `number`, so typecheck
 * cannot see it. The data is internally consistent, so no integrity probe can either. That is the
 * "silent zero" shape from CLAUDE.md, and an enforced cross-reference is the only thing that
 * catches it. Hence: a model id offered or billed in code MUST have a registry row.
 *
 * The registry is read from the committed projection (src/config/generationModels.generated.ts),
 * not from the database, so this runs in CI. Regenerate with `npm run models:generate` after any
 * change to public.generation_models — a stale projection is a red build, by design.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GENERATION_MODELS,
  GENERATION_MODEL_IDS,
  PROJECTION_FINGERPRINT,
  selectableModels,
} from '../../src/config/generationModels.generated';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Model ids these files offer to a user or bill against. Each entry names the file and the way ids
 * appear in it. Add a source here when you add a surface that names models — that is the whole
 * mechanism, and skipping it is how the wan2.1 bug survived.
 */
const ID_SOURCES: { file: string; extract: (src: string) => string[] }[] = [
  {
    // The one place an image-generation credit figure is written.
    file: 'supabase/functions/_shared/generation-routing.ts',
    extract: (src) => {
      const block = src.match(/GENERATION_CREDIT_COSTS[^=]*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      return [...block.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]);
    },
  },
  {
    file: 'supabase/functions/generate-interior-video-v2/index.ts',
    extract: (src) => {
      const block = src.match(/CREDIT_COSTS:\s*Record<VideoModel, number>\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      return [...block.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]);
    },
  },
  {
    file: 'supabase/functions/generate-vr-world/index.ts',
    extract: (src) => {
      const block = src.match(/CREDIT_COSTS:\s*Record<string, number>\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      return [...block.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]);
    },
  },
  {
    // The video model dropdown — the exact surface that offered a 404 model at 12 credits.
    // Anchored on the VIDEO_MODEL_OPTIONS declaration rather than on the JSX: the list was
    // hoisted out of the render when the picker and the generator's CREDIT_COSTS had to be
    // reconciled (#363 follow-up), and an extractor pinned to `].map(vm =>` matched nothing
    // afterwards. This test caught that itself, because it asserts its own extractor found
    // something — keep that property when moving this anchor again.
    file: 'src/components/features/ai/ProgressiveImageGrid.tsx',
    extract: (src) => {
      const block = src.match(/const VIDEO_MODEL_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';
      return [...block.matchAll(/value: '([^']+)'/g)]
        .map((m) => m[1])
        // 'auto' is a routing instruction to the generator, not a model id, so it has no
        // registry row to find.
        .filter((id) => id !== 'auto');
    },
  },
];

/**
 * `grok-aurora` is the label inside generate-interior-gemini's RESPONSE payload, not a model id —
 * PRICING_KEY_BY_LABEL maps it to the registered id `xai-aurora`. It is exempt because renaming it
 * would change a response shape clients already read. Any OTHER alias belongs in the registry, not
 * here: this list is shrink-only, and each entry states why it cannot simply be renamed.
 */
const LABEL_ALIASES: Record<string, string> = {
  'grok-aurora': 'xai-aurora',
};

/** Confirmed deleted upstream (404 on Replicate's credit-free GET /v1/models), 2026-08-12. */
const DELETED_UPSTREAM = [
  'wan2.1-i2v-720p',
  'kling-1.6-pro',
  'threestudio-project/threestudio',
  'runwayml/stable-diffusion-v1-5',
];

describe('generation model registry', () => {
  it('projection is non-empty and internally consistent', () => {
    expect(GENERATION_MODELS.length).toBeGreaterThan(0);
    expect(GENERATION_MODEL_IDS.size).toBe(GENERATION_MODELS.length); // ids are unique
    for (const m of GENERATION_MODELS) {
      expect(m.id, `${m.id}: display_name is required`).toBeTruthy();
      expect(m.display_name, `${m.id}: display_name is required`).toBeTruthy();
      expect(m.provider, `${m.id}: provider is required`).toBeTruthy();
    }
  });

  it('every model id offered or billed in code has a registry row', () => {
    const missing: string[] = [];
    for (const { file, extract } of ID_SOURCES) {
      const ids = extract(read(file));
      // An extractor that silently matches nothing would make this test vacuously green — the
      // exact failure mode it exists to prevent. Assert it found something.
      expect(ids.length, `extractor for ${file} matched no ids — the file's shape changed`).toBeGreaterThan(0);
      for (const raw of ids) {
        const id = LABEL_ALIASES[raw] ?? raw;
        if (!GENERATION_MODEL_IDS.has(id)) missing.push(`${raw} (${file})`);
      }
    }
    expect(
      missing,
      `These model ids are offered or billed in code but have no generation_models row.\n` +
        `Add the row (and its ai_model_pricing entry), then run: npm run models:generate\n` +
        missing.map((m) => `  - ${m}`).join('\n'),
    ).toEqual([]);
  });

  it('no model deleted upstream has reappeared anywhere', () => {
    const surfaces = [
      'supabase/functions/generate-interior-video-v2/index.ts',
      'supabase/functions/generate-social-video/index.ts',
      'supabase/functions/_shared/credit-utils.ts',
      'supabase/functions/_shared/agents/model-health-check-agent.ts',
      'supabase/functions/_shared/tools/background-tools.ts',
      'src/config/apis/replicateConfig.ts',
      'src/components/features/ai/ProgressiveImageGrid.tsx',
      'src/components/features/ai/agentToolsCatalog.ts',
      'src/components/Admin/ModelDebuggingPanel.tsx',
    ];
    const offenders: string[] = [];
    for (const file of surfaces) {
      const src = read(file);
      for (const dead of DELETED_UPSTREAM) {
        // Mentions in a `//` comment are the record of WHY it was removed — those must survive.
        // Only a live reference (a quoted string) counts as reintroduction.
        const live = src
          .split('\n')
          .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
          .some((l) => l.includes(`'${dead}'`) || l.includes(`"${dead}"`));
        if (live) offenders.push(`${dead} in ${file}`);
      }
      expect(GENERATION_MODEL_IDS.has, 'sanity').toBeTruthy();
    }
    expect(
      offenders,
      `Models confirmed deleted upstream by Replicate are referenced again:\n` +
        offenders.map((o) => `  - ${o}`).join('\n') +
        `\nThese 404 on GET /v1/models — a read that needs no credit — so this is not the unfunded-account 402.`,
    ).toEqual([]);
    for (const dead of DELETED_UPSTREAM) {
      expect(GENERATION_MODEL_IDS.has(dead), `${dead} is deleted upstream and must not be registered`).toBe(false);
    }
  });

  it('a model with no verified price is explicitly unpriced, never silently guessed', () => {
    // pricing_key null is a DELIBERATE statement: "no verified cost exists for this model". The
    // alternative — inventing a plausible number — is how MIVAA carried Opus at 15/75 (3x the real
    // 5/25) undetected. Whoever obtains a real figure adds the ai_model_pricing row and links it.
    const unpriced = GENERATION_MODELS.filter((m) => m.pricing_key === null).map((m) => m.id).sort();
    expect(unpriced).toEqual(
      [
        // EMPTY as of 2026-08-17 — every registered model resolves to an ai_model_pricing row.
        //
        // How each of the five got here, because "priced" does not mean the same thing for all
        // of them and the difference matters when someone reads a margin report:
        //   veo-2                    $0.35/s   — published Gemini Developer API rate.
        //   marble-1.1               $1.264    — DERIVED, not guessed: vrWorldService.ts has
        //                                        recorded 1,580 WL credits at $1 = 1,250 WL
        //                                        credits since it was written.
        //   marble-1.0-draft         retired   — the tier no longer exists; 1.1 is the only one.
        //   proplabs-virtual-staging $0.134    — DELIBERATE PLACEHOLDER, see below.
        //   flux-depth-pro           $0.134    — DELIBERATE PLACEHOLDER, see below.
        //
        // The two placeholders are set to the highest per-image cost the platform pays anywhere
        // (gemini-3-pro-image) because neither provider publishes a figure. That is a knowing
        // over-estimate, chosen because over-stating a cost can only make a sale look LESS
        // profitable than it is — it can never hide a loss, which is the failure this whole
        // family of checks exists to prevent. They are marked in the database by
        // `last_verified_at IS NULL`; a verified row always carries a date. Do not read their
        // margin figures as fact.
        //
        // This list is SHRINK-ONLY. An entry leaves when a real figure is obtained. One may be
        // ADDED only for a model whose rate genuinely cannot be established even conservatively
        // — and "I could not find it quickly" is not that.
      ].sort(),
    );
  });

  it('only active + enabled models are selectable', () => {
    for (const m of selectableModels()) {
      expect(m.status).toBe('active');
      expect(m.enabled).toBe(true);
    }
    // The health check writes status back to the registry; the UI renders selectableModels(). That
    // pairing is what makes "a dead model is still offered" structurally impossible rather than a
    // thing someone has to notice.
    expect(selectableModels('video').length).toBeGreaterThan(0);
    expect(selectableModels('image').length).toBeGreaterThan(0);
  });

  it('the committed projection matches the generator’s own output shape', () => {
    const src = read('src/config/generationModels.generated.ts');
    // `/* eslint-disable */` leads, then the provenance comment. The row payload is emitted with
    // JSON.stringify, so every key comes out double-quoted and trips the repo's `quotes` rule —
    // that failed `npm run lint` and blocked the deploy job outright. Both lines are asserted
    // because both matter: the disable keeps the file lintable, the provenance line keeps a
    // reader from hand-editing a generated artifact.
    expect(src.startsWith('/* eslint-disable */\n// AUTO-GENERATED by scripts/gen-generation-models.mjs')).toBe(true);
    // Stable ordering — an unstable generator produces diff noise, and diff noise is how a real
    // change gets waved through in review.
    const orders = GENERATION_MODELS.map((m) => m.sort_order);
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b));
  });

  it('has not been hand-edited — the rows still match the fingerprint the generator wrote', async () => {
    // THE HALF CI CAN ACTUALLY CHECK.
    //
    // Two directions of drift exist for this file and each needs its own guard, because neither
    // side can see the other:
    //
    //   database moves, file not regenerated → caught nightly by
    //     `dic_detect__generation_registry_projection_stale`, which compares what the generator
    //     RECORDED against the live table. It never sees this file.
    //   file edited by hand                  → caught here. CI cannot compare against the table
    //     (`generation_models` is authenticated-only and no workflow carries a service-role key),
    //     so the file carries its own checksum instead.
    //
    // Recomputed with the GENERATOR's own function, imported rather than copied — a second
    // definition of "how the fingerprint is formed" is exactly how the two would drift apart.
    const { fingerprintRows } = await import('../../scripts/lib/projectionFingerprint.mjs');
    const picked = GENERATION_MODELS.map((m) => ({
      id: m.id,
      display_name: m.display_name,
      capability: m.capability,
      sub_capability: m.sub_capability,
      provider: m.provider,
      slug: m.slug,
      version: m.version,
      adapter: m.adapter,
      input_requirements: m.input_requirements,
      pricing_key: m.pricing_key,
      tier: m.tier,
      status: m.status,
      enabled: m.enabled,
      sort_order: m.sort_order,
    }));
    expect(
      fingerprintRows(picked),
      'generationModels.generated.ts was edited by hand. It is a projection of the ' +
      '`generation_models` table — change the table, then run ' +
      '`SUPABASE_SERVICE_ROLE_KEY=... npm run models:generate` and commit the result.',
    ).toBe(PROJECTION_FINGERPRINT);
  });
});
