/**
 * AI Assessment — the things about it that are silent when broken (#397).
 *
 * One system, three subjects (project / finance / real estate). Every guard below exists because
 * the failure it catches is INVISIBLE — a wrong number is a valid number, a missing tile looks
 * like a tidy screen, an unregistered chunk looks like "done", a credit reserved after the call
 * is a free feature nobody notices until the bill, and a destination naming a tab that does not
 * exist opens a blank body.
 *
 *   1. SQL derives, TypeScript formats. The severity weights, the dimension scores and the
 *      verdict live in `score_assessment()` alone.
 *   2. ONE system, not three. Three copies of the claim, the action validation and the
 *      reserve/settle order is the shape this whole refactor exists to avoid.
 *   3. A destination is a promise the page keeps — per subject, against that subject's own page.
 *   4. Every dimension renders every time, for every subject.
 *   5. Reserve BEFORE the upstream call (invariant 10), refund on failure. Asserted on ORDER.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSESSMENT_SUBJECTS,
  ASSESSMENT_SUBJECT_LABELS,
  ASSESSMENT_SUBJECT_MODULE,
  ASSESSMENT_SUBJECT_PROMPT,
  ASSESSMENT_DIMENSIONS,
  ASSESSMENT_DIMENSION_LABELS,
  ASSESSMENT_DIMENSION_BLURBS,
  ASSESSMENT_VERDICTS,
  ASSESSMENT_VERDICT_LABELS,
  ASSESSMENT_DESTINATIONS,
  ACTION_STATES,
  ACTION_EFFORTS,
  SIGNAL_SEVERITIES,
  SIGNAL_STATUSES,
  type AssessmentSubject,
} from '../../src/services/assessment/assessmentVocabulary';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const VOCAB = 'src/services/assessment/assessmentVocabulary.ts';
const PANEL = 'src/components/features/assessment/AssessmentPanel.tsx';
const SERVICE = 'src/services/assessment/assessmentService.ts';
const HREFS = 'src/services/assessment/assessmentDestinations.ts';
const RUNNER = 'supabase/functions/_shared/assessment.ts';
const DOOR = 'supabase/functions/_shared/assessment-http.ts';
const TOOLS = 'supabase/functions/_shared/tools/assessment-tools.ts';
const HUB = 'src/components/features/ai/AgentHub.tsx';

const vocabSrc = read(VOCAB);
const panelSrc = read(PANEL);
const serviceSrc = read(SERVICE);
const runnerSrc = read(RUNNER);
const doorSrc = read(DOOR);
const toolsSrc = read(TOOLS);

/** Each subject's own page, and how to read the tab keys it actually renders. */
const SUBJECT_PAGES: Record<AssessmentSubject, { file: string; read: (src: string) => Set<string> }> = {
  project: {
    file: 'src/modules/projects/pages/ProjectDetailPage.tsx',
    read: (src) => new Set([...src.matchAll(/<TabsContent value="([a-z-]+)"/g)].map((m) => m[1])),
  },
  finance: {
    // FINANCE_TAB is the one list FinancePage builds its panes from, and the keys differ from the
    // labels where it matters most: the Orders pane is `doc_orders`, not `orders`.
    file: 'src/modules/finance/routes.ts',
    read: (src) => {
      const at = src.indexOf('export const FINANCE_TAB = {');
      return new Set([...src.slice(at, src.indexOf('} as const', at)).matchAll(/:\s*'([a-z_]+)'/g)]
        .map((m) => m[1]));
    },
  },
  real_estate: {
    file: 'src/modules/real-estate/pages/PropertyWorkbench.tsx',
    read: (src) => new Set([...src.matchAll(/<TabsTrigger value="([a-z-]+)"/g)].map((m) => m[1])),
  },
};

describe('the vocabulary is complete and closed', () => {
  it('every subject has a label, a module, a prompt, labels and blurbs for all six dimensions', () => {
    for (const s of ASSESSMENT_SUBJECTS) {
      expect(ASSESSMENT_SUBJECT_LABELS[s], `no label for subject "${s}"`).toBeTruthy();
      expect(ASSESSMENT_SUBJECT_MODULE[s], `no module slug for subject "${s}"`).toBeTruthy();
      expect(ASSESSMENT_SUBJECT_PROMPT[s], `no prompt category for subject "${s}"`).toBeTruthy();
      expect(ASSESSMENT_DESTINATIONS[s]?.length, `no destinations for subject "${s}"`).toBeGreaterThan(0);
      for (const d of ASSESSMENT_DIMENSIONS) {
        expect(ASSESSMENT_DIMENSION_LABELS[s]?.[d], `no ${s} label for dimension "${d}"`).toBeTruthy();
        expect(ASSESSMENT_DIMENSION_BLURBS[s]?.[d], `no ${s} blurb for dimension "${d}"`).toBeTruthy();
      }
    }
    for (const v of ASSESSMENT_VERDICTS) {
      expect(ASSESSMENT_VERDICT_LABELS[v], `no label for verdict "${v}"`).toBeTruthy();
    }
  });

  it('every subject speaks its own language for the shared dimensions', () => {
    // Six structural slots shared by three domains is the point — one CHECK, one scorer, one
    // weight table. Identical LABELS across subjects would give a set of books a tile called
    // "Delivery" that means whether the filing reached AADE, which nobody can act on.
    for (const d of ASSESSMENT_DIMENSIONS) {
      const labels = ASSESSMENT_SUBJECTS.map((s) => ASSESSMENT_DIMENSION_LABELS[s][d]);
      expect(new Set(labels).size,
        `every subject calls dimension "${d}" the same thing — the per-subject labels have collapsed`,
      ).toBeGreaterThan(1);
    }
  });

  it('the value-sets match the CHECK constraints they mirror', () => {
    // These exact strings are written into `assessments` / `assessment_actions` by migration.
    // Widening one here without widening the constraint is a raw 23514 at run time.
    expect([...ASSESSMENT_SUBJECTS].sort()).toEqual(['finance', 'project', 'real_estate']);
    expect([...ASSESSMENT_DIMENSIONS].sort()).toEqual(
      ['client', 'commercial', 'delivery', 'financial', 'schedule', 'setup']);
    expect([...ASSESSMENT_VERDICTS].sort()).toEqual(
      ['at_risk', 'not_enough_data', 'off_track', 'on_track', 'stalled']);
    expect([...ACTION_STATES].sort()).toEqual(['dismissed', 'done', 'open', 'task_created']);
    expect([...ACTION_EFFORTS].sort()).toEqual(['moderate', 'quick', 'significant']);
    expect([...SIGNAL_SEVERITIES].sort()).toEqual(['critical', 'high', 'info', 'low', 'medium']);
    expect([...SIGNAL_STATUSES].sort()).toEqual(['attention', 'no_data', 'not_applicable', 'ok']);
  });

  it('stays import-free so the Deno mirror can be a byte copy', () => {
    // Vite resolves `@/` and Deno resolves by URL: one import makes the copy unbuildable on the
    // other side. This is also why the href resolver lives in its own file — it needs FINANCE_BASE.
    expect(/^\s*import\s/m.test(vocabSrc),
      `${VOCAB} has grown an import. The mirror is a byte copy; move whatever needs it to `
      + 'assessmentDestinations.ts.').toBe(false);
    expect(read(HREFS)).toContain('FINANCE_BASE');
  });
});

describe('SQL derives the score; TypeScript only formats it', () => {
  it('the vocabulary carries no severity or dimension weights', () => {
    const numericMap = /(critical|high|medium|low)\s*:\s*\d+/i;
    expect(numericMap.test(vocabSrc),
      `${VOCAB} contains what looks like a severity→number map. Weights belong in `
      + 'score_assessment() alone — two copies of a derivation is the defect this feature is '
      + 'built to avoid.',
    ).toBe(false);
  });

  it('the client never computes a verdict or an overall score', () => {
    for (const [file, src] of [[PANEL, panelSrc], [SERVICE, serviceSrc]] as const) {
      expect(/verdict\s*=\s*(?!.*(snapshot|report|out|data|null|\(|prev))/i.test(src),
        `${file} assigns a verdict locally — it must come from the snapshot.`).toBe(false);
      expect(/overall_score\s*[:=]\s*[\d(]/.test(src),
        `${file} computes an overall score — SQL owns that number.`).toBe(false);
    }
  });

  it('the date of record is the operator calendar day, never the UTC one', () => {
    // `new Date().toISOString().slice(0,10)` is the UTC date, which is YESTERDAY for a Greek
    // operator between local midnight and 03:00 — on a derivation that decides what is overdue.
    for (const [file, src] of [[PANEL, panelSrc], [SERVICE, serviceSrc]] as const) {
      expect(/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(src),
        `${file} derives a date from the UTC day. Use todayLocalISO().`).toBe(false);
    }
    expect(serviceSrc).toContain('todayLocalISO()');
  });
});

describe('one system, three subjects — not three copies', () => {
  it('all three doors share the run body and none re-implements it', () => {
    for (const fn of ['project-assessment', 'finance-assessment', 'real-estate-assessment']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, `${fn} does not use the shared door`).toContain('handleAssessmentRequest');
      expect(src, `${fn} re-implements the model call`).not.toContain('callClaudeMessages');
      expect(src, `${fn} re-implements the credit gate`).not.toContain('reserveCredits');
    }
    expect(toolsSrc, 'the toolkit re-implements the run').not.toContain('callClaudeMessages');
    expect(toolsSrc).toContain("from '../assessment.ts'");
  });

  it('there is one claim, one scorer and one action validator — in SQL', () => {
    // The client and the tools may READ a stored report; neither may decide what an action is
    // allowed to be. That check lives in `record_assessment` alone.
    for (const [file, src] of [[PANEL, panelSrc], [SERVICE, serviceSrc], [TOOLS, toolsSrc]] as const) {
      expect(/signal_code[\s\S]{0,80}(includes|some|find)\(/.test(src),
        `${file} looks like it validates an action against the signals. record_assessment does that.`,
      ).toBe(false);
    }
  });

  it('the panel is mounted for every subject', () => {
    const mounts: Record<AssessmentSubject, string> = {
      project: 'src/modules/projects/pages/ProjectDetailPage.tsx',
      finance: 'src/pages/Admin/FinancePage.tsx',
      real_estate: 'src/modules/real-estate/pages/PropertyWorkbench.tsx',
    };
    for (const s of ASSESSMENT_SUBJECTS) {
      const src = read(mounts[s]);
      expect(src, `${mounts[s]} does not mount the assessment panel`).toContain('<AssessmentPanel');
      expect(src, `${mounts[s]} mounts the panel for the wrong subject`).toContain(`subject="${s}"`);
      // The page gate is UX and the edge function is the real line — but a surface with NO gate
      // offers a paid module to a workspace that cannot use it and explains nothing.
      expect(src, `${mounts[s]} does not gate the pane on its module`)
        .toContain(`moduleSlug="${ASSESSMENT_SUBJECT_MODULE[s]}"`);
    }
  });
});

describe('naming a place is linking to it', () => {
  it('every destination is a tab its own subject page renders', () => {
    for (const s of ASSESSMENT_SUBJECTS) {
      const page = SUBJECT_PAGES[s];
      const rendered = page.read(read(page.file));
      expect(rendered.size, `${page.file} yielded no tab keys — this guard is pointed at nothing`)
        .toBeGreaterThan(3);
      const missing = ASSESSMENT_DESTINATIONS[s].filter((d) => !rendered.has(d));
      expect(missing,
        `${s} signals point at these tabs and ${page.file} does not render them, so "Go there" is `
        + `a link to nowhere: ${missing.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('the resolver refuses an unknown key instead of guessing a URL', () => {
    // A link to a tab the page does not render lands the reader on a blank body, which is worse
    // than the plain text it replaced.
    const src = read(HREFS);
    expect(src).toContain('ASSESSMENT_DESTINATIONS[subject].includes(destination)');
    expect(src).toMatch(/return null;/);
  });

  it('each subject has its own assessment surface to link back to', () => {
    const src = read(HREFS);
    for (const s of ASSESSMENT_SUBJECTS) expect(src).toContain(`case '${s}':`);
  });
});

describe('a metric is a value or a stated reason — never a hidden row', () => {
  it('the panel renders every dimension, not just the ones with a score', () => {
    expect(panelSrc, `${PANEL} must iterate ASSESSMENT_DIMENSIONS so every tile renders every time`)
      .toContain('ASSESSMENT_DIMENSIONS.map(');
    expect(panelSrc).toContain('Not judged');
  });

  it('a dimension that could not be judged is never shown as a zero', () => {
    expect(/score\s*\?\?\s*0|score\s*\|\|\s*0/.test(panelSrc),
      `${PANEL} coerces a missing score to 0. A null score means NOT JUDGED and renders as words.`,
    ).toBe(false);
  });

  it('the signal counts name all four statuses, including the ones with no value', () => {
    for (const status of SIGNAL_STATUSES) {
      expect(panelSrc, `${PANEL} never mentions the "${status}" status, so those signals are invisible`)
        .toContain(`'${status}'`);
    }
  });

  it('the history shows failed runs with their reason', () => {
    expect(panelSrc).toContain('error_message');
    expect(serviceSrc, 'history() must not filter to complete runs only')
      .toMatch(/history[\s\S]{0,700}from\('assessments'\)/);
  });
});

describe('paid work is gated before it is done, not after', () => {
  it('credits are reserved BEFORE the model call and refunded when it fails', () => {
    const reserve = runnerSrc.indexOf('reserveCredits(');
    const call = runnerSrc.indexOf('callClaudeMessages(');
    const settle = runnerSrc.indexOf('settleCredits(');
    expect(reserve, `${RUNNER} does not reserve credits at all`).toBeGreaterThan(-1);
    expect(call, `${RUNNER} does not call the model`).toBeGreaterThan(-1);
    expect(reserve,
      'The reservation must come BEFORE the upstream call (invariant 10). A debit after the '
      + 'spend is not a gate — it is a receipt.',
    ).toBeLessThan(call);
    expect(settle, 'the reserved ceiling must be settled against real usage').toBeGreaterThan(call);
    expect(runnerSrc, 'a failed run must refund the ceiling — nothing was delivered')
      .toContain('refundCredits(');
    expect(runnerSrc, 'a failed run must be NAMED on the row, not swallowed')
      .toContain('fail_assessment');
  });

  it('an unpriced model keeps the ceiling instead of settling to zero', () => {
    expect(runnerSrc).toMatch(/priced\s*\?\s*priced\.credits\s*:\s*ASSESSMENT_CREDIT_CEILING/);
    expect(runnerSrc).toContain('unpriced_model');
  });

  it('every subject loads its prompt from the database with no code fallback', () => {
    expect(runnerSrc).toContain('ASSESSMENT_SUBJECT_PROMPT[subjectType]');
    expect(runnerSrc).toContain("loadPrompt(supabase, 'tool'");
    // A hardcoded prompt is invisible when it fires: the admin edits the row, saves, and nothing
    // changes forever while every health signal stays green.
    expect(/const\s+\w*PROMPT\w*\s*=\s*[`'"][\s\S]{200,}/.test(runnerSrc),
      `${RUNNER} looks like it carries a hardcoded prompt. Prompts live in the DB, always.`,
    ).toBe(false);
  });

  it('the model output is a forced tool call, not parsed prose', () => {
    expect(runnerSrc).toContain('tool_choice');
    expect(runnerSrc).toContain("type: 'tool'");
    expect(/JSON\.parse\(/.test(runnerSrc),
      `${RUNNER} parses model output by hand. The forced tool call IS the result.`).toBe(false);
  });

  it('only the assess_* tools are paid; the readers cost nothing', () => {
    // "What should I do next" must not cost money to ask twice.
    for (const reader of [
      'createGetProjectAssessmentTool', 'createGetFinanceAssessmentTool',
      'createGetPropertyAssessmentTool', 'createListAssessmentActionsTool',
      'createApplyAssessmentActionTool',
    ]) {
      const at = toolsSrc.indexOf(`export const ${reader}`);
      expect(at, `${TOOLS} no longer exports ${reader}`).toBeGreaterThan(-1);
      const nextExport = toolsSrc.indexOf('export const', at + 20);
      const body = toolsSrc.slice(at, nextExport > -1 ? nextExport : undefined);
      expect(body.includes('runAssessment('),
        `${reader} runs a paid assessment. Only the assess_* tools may.`).toBe(false);
    }
    for (const paid of ['assess_project', 'assess_finance', 'assess_property']) {
      expect(toolsSrc, `${paid} must state that it costs credits`)
        .toContain(`Costs up to \${ASSESSMENT_CREDIT_CEILING} credits`);
    }
  });
});

describe('every chunk the toolkit emits reaches the screen', () => {
  it('is registered in AGENT_RESULT_TITLES', () => {
    const hubSrc = read(HUB);
    const emitted = new Set(
      [...toolsSrc.matchAll(/type:\s*'(assessment_[a-z_]+)'/g)].map((m) => m[1]));
    expect(emitted.size, `${TOOLS} emits no assessment chunks — this guard is pointed at nothing`)
      .toBeGreaterThan(0);
    const titles = hubSrc.slice(hubSrc.indexOf('AGENT_RESULT_TITLES'),
      hubSrc.indexOf('};', hubSrc.indexOf('AGENT_RESULT_TITLES')));
    const missing = [...emitted].filter((t) => !titles.includes(`${t}:`));
    expect(missing,
      'These chunks are emitted and unregistered, so AgentHub drops them and the user sees a '
      + `cheerful "done" over a blank screen: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the report card can reach the subject it is about', () => {
    const caps = read('src/config/capabilities.ts');
    for (const t of ['assessment_report', 'assessment_actions', 'assessment_action_applied']) {
      expect(caps, `${t} has no capability handoff, so its card is a dead end`).toContain(`${t}: '`);
    }
  });
});

describe('tenancy is bound to the verified identity, never to the request body', () => {
  it('the shared door checks workspace access and 404s on a mismatch', () => {
    expect(doorSrc).toContain('userCanAccessWorkspace(');
    // 403 confirms the id exists; 404 does not (invariant 1).
    expect(doorSrc).toMatch(/HttpError\(404, 'Not found'\)/);
    expect(doorSrc, 'module entitlement is enforced at the API boundary, not by the nav')
      .toContain('assertEntitled(');
    expect(doorSrc).toContain('ASSESSMENT_SUBJECT_MODULE[subjectType]');
  });

  it('the tools resolve every subject through a workspace-scoped resolver', () => {
    expect(toolsSrc).toContain('resolveProjectId(sb, userId, workspaceId');
    expect(toolsSrc).toContain('resolvePropertyId(sb, workspaceId');
    // Finance has no id to supply — the subject IS the active workspace, so there is nothing a
    // caller could name and therefore nothing to name wrongly.
    expect(toolsSrc).toMatch(/subject === 'finance'[\s\S]{0,220}eq\('id', workspaceId\)/);
    // Two copies of a tenancy check is how the hole #395 closed gets reopened one file over.
    const projectTools = read('supabase/functions/_shared/tools/project-tools.ts');
    expect(projectTools).toContain("from '../assessment.ts'");
  });

  it('acting on an action re-checks the workspace before it writes', () => {
    const at = toolsSrc.indexOf('export const createApplyAssessmentActionTool');
    const body = toolsSrc.slice(at);
    expect(body).toContain('act.workspace_id !== workspaceId');
    // And the module gate follows the DATA, not the caller's guess about it.
    expect(body).toContain('ASSESSMENT_SUBJECT_MODULE[act.subject_type');
  });
});
