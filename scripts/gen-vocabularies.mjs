/**
 * Regenerate the Deno-side mirrors of dependency-free VOCABULARY modules — the closed value-sets
 * that both runtimes have to agree on.
 *
 * WHY THIS EXISTS, AND WHY IT IS GENERIC. A sweep on 2026-08-27 found 59 value-sets typed out by
 * hand in both `src/` and `supabase/functions/`, of which 32 exactly match a Postgres enum or
 * CHECK constraint — meaning the database is the enforcer and TypeScript restates the same fact
 * two to six times, with nothing keeping them in step. That is not a hypothetical failure mode:
 * the flow vocabulary (the first entry below) had four hand-written copies and the palette copy
 * had drifted wider than the enforcer, so the builder offered nodes whose INSERT can only raise
 * 42501. A guard test on a copy detects drift afterwards; a generated copy cannot drift at all.
 *
 * Adding a vocabulary here is meant to be one line, because the plan is to keep adding them.
 *
 * Same contract as scripts/gen-finance-mirrors.mjs: source modules are deliberately IMPORT-FREE
 * so the mirror stays a byte copy — Vite resolves the `@/` alias, Deno resolves by URL, so a
 * single import makes the copy unbuildable in the other runtime.
 *
 * NO SHEBANG, deliberately: `core.autocrlf` is on, so a Windows checkout can hand this file CRLF,
 * and a `#!` line followed by CRLF makes vitest's loader throw "Invalid or unexpected token" —
 * reported against the IMPORT in the test, nowhere near the actual cause.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** [source, target] pairs, repo-relative. One line per vocabulary. */
export const VOCABULARIES = [
  [
    'src/services/flows/tenantVocabulary.ts',
    'supabase/functions/_shared/tools/tenantVocabulary.generated.ts',
  ],
  [
    // AADE VAT category ↔ rate. Lived inside financeService (unmirrorable), so the edge had no
    // category→rate lookup and every server-built line took the workspace default rate. A hire
    // from a public profile prices its lines server-side and needs the real one.
    'src/modules/finance/vatVocabulary.ts',
    'supabase/functions/_shared/vatVocabulary.generated.ts',
  ],
  [
    // #391 — eight HR value-sets that were written across ten files, two to six copies
    // each. The DB CHECK constraints are the enforcer; this source equals them exactly.
    'src/modules/hr/hrVocabulary.ts',
    'supabase/functions/_shared/hrVocabulary.generated.ts',
  ],
  [
    // #391 — `SheetType` was declared in SIX files with twelve values each, the largest
    // duplication in the sweep. `moodboard_sheet_type` is a Postgres enum.
    'src/services/moodboards/sheetVocabulary.ts',
    'supabase/functions/_shared/sheetVocabulary.generated.ts',
  ],
  [
    // #392 — how a sheet names an image it owns, plus the traversal that finds them. Not a
    // value-set but the same hazard: the client folds signed URLs back to refs on write and the
    // edge resolves them on read, so a walk that disagreed with itself would persist a URL that
    // stops working in an hour.
    'src/services/moodboards/sheetAssetRefs.ts',
    'supabase/functions/_shared/sheetAssetRefs.generated.ts',
  ],
  [
    // #391 — `ContractContext`, five copies. `contracts_context_check` is the enforcer.
    'src/services/contracts/contractVocabulary.ts',
    'supabase/functions/_shared/contractVocabulary.generated.ts',
  ],
  [
    // What kind of business document an inbox attachment is. The edge needs it for the
    // classifier's forced-tool enum; the client needs it for the tag and the "Add as expense"
    // decision. One list, or the tag offers a kind the classifier cannot return.
    'src/modules/messaging/inboxDocumentKinds.ts',
    'supabase/functions/_shared/inboxDocumentKinds.generated.ts',
  ],
  [
    // A catalog card in an Inbox message: product or service, the price basis, the button label,
    // and how many one message carries. The composer offers these; inbox-api validates the pick
    // against the same list and the edge renderers label the card's button from it.
    'src/modules/messaging/inboxCardKinds.ts',
    'supabase/functions/_shared/inboxCardKinds.generated.ts',
  ],
  [
    // The http(s) allowlist for an href/src assembled by hand — a different contract from
    // escapeHtml (invariant 11), needed wherever tenant-supplied URLs reach an email or a card.
    'src/utils/safeUrl.ts',
    'supabase/functions/_shared/safeUrl.generated.ts',
  ],
  [
    // How a golden-case run failed. `agent_eval_runs_failure_class_check` is the enforcer; the
    // scorer in agent-eval emits these and a future evals page labels them.
    'src/config/agentEvalVocabulary.ts',
    'supabase/functions/_shared/agentEvalVocabulary.generated.ts',
  ],
  [
    // The drawing register's value-sets. `scan-drawing-title-block` snaps what it reads off a
    // title block onto the same lists the register's pickers offer — a model answers
    // "FOR CONSTRUCTION" / "Construction Issue" / "Issued for Construction" for one status, and a
    // register storing all three cannot be filtered. `project_documents_kind_check` and
    // `project_document_revisions_purpose_check` are the enforcers for two of the three.
    'src/modules/projects/drawingVocabulary.ts',
    'supabase/functions/_shared/drawingVocabulary.generated.ts',
  ],
  [
    // #391 — `property_type`, four copies in four different SHAPES (array, array, union,
    // Set). `properties_property_type_check` is the enforcer.
    'src/modules/real-estate/realEstateVocabulary.ts',
    'supabase/functions/_shared/realEstateVocabulary.generated.ts',
  ],
  [
    // #391 — asset `category` and `acquisition_type`: a union pair in the service and an
    // `as const` pair feeding a z.enum in the tool.
    'src/services/assets/assetVocabulary.ts',
    'supabase/functions/_shared/assetVocabulary.generated.ts',
  ],
  [
    // #391 — `AgentRunStatus`, `LogLevel` and `AgentTriggerType`, declared on both sides
    // of the Vite/Deno boundary.
    'src/services/agents/agentVocabulary.ts',
    'supabase/functions/_shared/agents/agentVocabulary.generated.ts',
  ],
  [
    // #391 — page-watch change status (a union one side, a Set the other) and judge
    // confidence.
    'src/services/pageWatch/pageWatchVocabulary.ts',
    'supabase/functions/_shared/pageWatchVocabulary.generated.ts',
  ],
  [
    // #391 — snag severity, shared with the SEO findings handler deliberately.
    'src/modules/projects/snagVocabulary.ts',
    'supabase/functions/_shared/snagVocabulary.generated.ts',
  ],
  [
    // AI Assessment (#397) — subject, dimension, severity, signal status, verdict, run status
    // and action state. Three consumers, not two: SQL derives them, the edge tool feeds them to
    // a `z.enum` so the model cannot invent a sixth verdict, and the client formats them. NOT
    // under `src/modules/projects/`: it covers projects, finance AND real estate, and a
    // vocabulary filed under one of its three subjects is an invitation to fork it.
    'src/services/assessment/assessmentVocabulary.ts',
    'supabase/functions/_shared/assessmentVocabulary.generated.ts',
  ],
  [
    // #391 — trip-expense card type.
    'src/modules/finance/tripExpenseVocabulary.ts',
    'supabase/functions/_shared/tripExpenseVocabulary.generated.ts',
  ],
  [
    // #391 — payment method (a union + two label maps) and the payment-provider slug
    // (a union, a display-order Record and four hand-written <SelectItem>s).
    'src/modules/finance/paymentVocabulary.ts',
    'supabase/functions/_shared/paymentVocabulary.generated.ts',
  ],
  [
    // #391 — `FiscalCapability`, the same six-line union in both runtimes.
    'src/services/fiscal/fiscalVocabulary.ts',
    'supabase/functions/_shared/fiscal/fiscalVocabulary.generated.ts',
  ],
  [
    // #391 — the tech-radar ring, written out three times across two files. NOT under
    // `_shared/tools/`: `check-edge-functions.mjs` globs that directory as entrypoints
    // ("every agent tool body"), so a vocabulary dropped there becomes a typecheck
    // target in its own right and quietly changes what that glob means.
    'src/services/techRadar/techRadarVocabulary.ts',
    'supabase/functions/_shared/techRadarVocabulary.generated.ts',
  ],
  [
    // #391 — generation-model probe status.
    'src/services/generation/probeVocabulary.ts',
    'supabase/functions/_shared/agents/probeVocabulary.generated.ts',
  ],
  [
    // #353 CRM-1 — the Greek→Latin search transliteration. Mirrored rather than re-typed for
    // the usual reason, and one that bites harder here: the SAME mapping already has to exist
    // in SQL (the searchable column is generated), so a hand-kept Deno copy would make it three.
    // `scripts/gen-crm-translit-sql.mjs` emits the SQL half from this same source.
    'src/services/crm/greekTransliteration.ts',
    'supabase/functions/_shared/crm/greekTransliteration.generated.ts',
  ],
  [
    // #353 CRM-4/CRM-7 — the VAT normaliser. Mirrored because the validation receipt is keyed
    // on it, written by `vies-validate` / `myaade-rgwspublic2` and read by `crm-api`.
    'src/services/crm/vatNormalize.ts',
    'supabase/functions/_shared/crm/vatNormalize.generated.ts',
  ],
  [
    // #391 — the trackable-document registry. This source PREDATES the mirror script and
    // its own header called out "four copies ... held in step by the registry guard, not
    // by care"; generating the edge copy removes one of the four outright.
    'src/services/documentDeliveryTypes.ts',
    'supabase/functions/_shared/documentDeliveryTypes.generated.ts',
  ],
  [
    // #395 — NOT a vocabulary: a DERIVATION, hand-copied. `calculator-tools.ts` carried a
    // second implementation of the heat-pump sizing model under a header reading "keep the
    // two in sync", which is the mechanism this script exists to replace. The constants
    // happened to still agree; nothing held them there.
    'src/lib/calculators/heatPumpSizing.ts',
    'supabase/functions/_shared/calculators/heatPumpSizing.generated.ts',
  ],
  [
    // What counts as a LINK in a message body. The bubble renders the segments and inbox-api
    // checks the URL you asked to preview is one the thread actually contains — two readers of
    // one string, so a second copy is a bubble offering a card for a fragment the other half
    // does not consider a link.
    'src/utils/messageLinks.ts',
    'supabase/functions/_shared/messageLinks.generated.ts',
  ],
  [
    // The inbox avatar cast: the 24 rendered characters, which half of the cast each belongs
    // to, and the name→gender reading that narrows the pool. THREE consumers, not two —
    // `messaging-api` builds the generation prompts from `look`, `inbox-api` derives each
    // participant's slot, and the client renders it. The roster already existed twice (the
    // generator's prompt list and the client's `CAST_SIZE`), which is how the picker could go on
    // handing a slot to men after the generator re-rendered it as a woman.
    'src/utils/characterAvatar.ts',
    'supabase/functions/_shared/characterAvatar.generated.ts',
  ],
  [
    // #395 — the same, and this pair had ALREADY diverged: the tool's copy hardcoded the
    // calorific values and efficiencies the canonical version accepts as overrides, so the
    // web page could be told "our oil is 10.2 kWh/L" and the agent could not.
    'src/lib/calculators/heatingCostComparison.ts',
    'supabase/functions/_shared/calculators/heatingCostComparison.generated.ts',
  ],
];

const banner = (source) => [
  `// GENERATED MIRROR of ${source} — do not edit here.`,
  '// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by',
  '// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.',
  '',
  '',
].join('\n');

export function expectedMirror(source) {
  return banner(source) + readFileSync(join(root, source), 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [source, target] of VOCABULARIES) {
    writeFileSync(join(root, target), expectedMirror(source), 'utf8');
    console.log(`Wrote ${target} from ${source}.`);
  }
}
