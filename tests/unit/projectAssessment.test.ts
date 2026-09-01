/**
 * AI Assessment — the four things about it that are silent when broken (#397).
 *
 * This feature has exactly the shape that has produced most of this platform's "small issues": a
 * model writing about numbers. Every one of the guards below exists because the failure it
 * catches is INVISIBLE — a wrong number is a valid number, a missing tile looks like a tidy
 * screen, an unregistered chunk looks like "done", and a credit reserved after the call is a free
 * feature nobody notices until the bill.
 *
 *   1. SQL derives, TypeScript formats. The severity weights, the dimension scores and the
 *      verdict live in `score_project_assessment()` alone. A second copy on this side would be a
 *      second derivation of one quantity — the shape that let a fully-paid order display an
 *      outstanding balance.
 *   2. A destination is a promise the page keeps. Every tab key the SQL can attach to a signal
 *      has to be a tab `ProjectDetailPage` actually renders, or "Go there" is a link to nowhere.
 *   3. Every dimension renders every time. A tile that vanishes when nothing could be judged is
 *      the `WebsiteDomainIntelPanel` defect: a collector that has never once succeeded is then
 *      pixel-identical to a clean project.
 *   4. Reserve BEFORE the upstream call (invariant 10), refund on failure. Asserted on ORDER,
 *      because a debit after the spend is not a gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
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
} from '../../src/modules/projects/assessmentVocabulary';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const VOCAB = 'src/modules/projects/assessmentVocabulary.ts';
const TAB = 'src/modules/projects/components/tabs/AssessmentTab.tsx';
const SERVICE = 'src/modules/projects/services/projectAssessmentService.ts';
const PAGE = 'src/modules/projects/pages/ProjectDetailPage.tsx';
const RUNNER = 'supabase/functions/_shared/project-assessment.ts';
const TOOLS = 'supabase/functions/_shared/tools/project-assessment-tools.ts';
const EDGE = 'supabase/functions/project-assessment/index.ts';
const HUB = 'src/components/features/ai/AgentHub.tsx';

const vocabSrc = read(VOCAB);
const tabSrc = read(TAB);
const serviceSrc = read(SERVICE);
const runnerSrc = read(RUNNER);
const toolsSrc = read(TOOLS);
const edgeSrc = read(EDGE);

describe('the vocabulary is complete and closed', () => {
  it('every dimension has a label and a blurb', () => {
    for (const d of ASSESSMENT_DIMENSIONS) {
      expect(ASSESSMENT_DIMENSION_LABELS[d], `no label for dimension "${d}"`).toBeTruthy();
      expect(ASSESSMENT_DIMENSION_BLURBS[d], `no blurb for dimension "${d}"`).toBeTruthy();
    }
    for (const v of ASSESSMENT_VERDICTS) {
      expect(ASSESSMENT_VERDICT_LABELS[v], `no label for verdict "${v}"`).toBeTruthy();
    }
  });

  it('the value-sets match the CHECK constraints they mirror', () => {
    // These exact strings are written into project_assessments / project_assessment_actions by
    // migration. Widening one here without widening the constraint is a raw 23514 at run time.
    expect([...ASSESSMENT_DIMENSIONS].sort()).toEqual(
      ['client', 'commercial', 'delivery', 'financial', 'schedule', 'setup']);
    expect([...ASSESSMENT_VERDICTS].sort()).toEqual(
      ['at_risk', 'not_enough_data', 'off_track', 'on_track', 'stalled']);
    expect([...ACTION_STATES].sort()).toEqual(['dismissed', 'done', 'open', 'task_created']);
    expect([...ACTION_EFFORTS].sort()).toEqual(['moderate', 'quick', 'significant']);
    expect([...SIGNAL_SEVERITIES].sort()).toEqual(['critical', 'high', 'info', 'low', 'medium']);
    expect([...SIGNAL_STATUSES].sort()).toEqual(['attention', 'no_data', 'not_applicable', 'ok']);
  });
});

describe('SQL derives the score; TypeScript only formats it', () => {
  it('the vocabulary carries no severity or dimension weights', () => {
    // A weight table here would be a second derivation of the score. The one that counts lives in
    // score_project_assessment(); this file is deliberately words only.
    const numericMap = /(critical|high|medium|low)\s*:\s*\d+/i;
    expect(numericMap.test(vocabSrc),
      `${VOCAB} contains what looks like a severity→number map. Weights belong in `
      + 'score_project_assessment() alone — two copies of a derivation is the defect this feature '
      + 'is built to avoid.',
    ).toBe(false);
  });

  it('the client never computes a verdict or an overall score', () => {
    for (const [file, src] of [[TAB, tabSrc], [SERVICE, serviceSrc]] as const) {
      // Assigning either from anything other than what the RPC returned means a screen can
      // disagree with the stored report about whether a project is on track.
      expect(/verdict\s*=\s*(?!.*(snapshot|report|out|data|null|\(|prev))/i.test(src),
        `${file} assigns a verdict locally — it must come from the snapshot.`).toBe(false);
      expect(/overall_score\s*[:=]\s*[\d(]/.test(src),
        `${file} computes an overall score — SQL owns that number.`).toBe(false);
    }
  });

  it('the date of record is the operator calendar day, never the UTC one', () => {
    // `new Date().toISOString().slice(0,10)` is the UTC date, which is YESTERDAY for a Greek
    // operator between local midnight and 03:00 — on a derivation whose whole job is deciding
    // what is overdue (CLAUDE.md rule 1b).
    for (const [file, src] of [[TAB, tabSrc], [SERVICE, serviceSrc]] as const) {
      expect(/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(src),
        `${file} derives a date from the UTC day. Use todayLocalISO().`).toBe(false);
    }
    expect(serviceSrc).toContain('todayLocalISO()');
  });
});

describe('naming a place is linking to it', () => {
  it('every assessment destination is a tab the project page renders', () => {
    const pageSrc = read(PAGE);
    const at = pageSrc.indexOf('const PROJECT_TABS = [');
    expect(at, `${PAGE} no longer declares PROJECT_TABS — this guard is pointed at nothing`)
      .toBeGreaterThan(-1);
    const declared = new Set(
      [...pageSrc.slice(at, pageSrc.indexOf('] as const', at)).matchAll(/'([a-z-]+)'/g)]
        .map((m) => m[1]));
    const rendered = new Set(
      [...pageSrc.matchAll(/<TabsContent value="([a-z-]+)"/g)].map((m) => m[1]));

    const missing = ASSESSMENT_DESTINATIONS.filter((d) => !declared.has(d) || !rendered.has(d));
    expect(missing,
      'Signals point at these project tabs and the page does not render them, so "Go there" is a '
      + `link to nowhere: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the assessment tab is itself a real, owner-only tab', () => {
    const pageSrc = read(PAGE);
    expect(pageSrc).toContain("'assessment'");
    expect(pageSrc).toContain('<TabsContent value="assessment"');
    // A report names margin, uncosted labour and overdue invoices. A collaborator is the CLIENT.
    const ownerOnly = pageSrc.slice(pageSrc.indexOf('OWNER_ONLY_TABS'), pageSrc.indexOf('export const ProjectDetailPage'));
    expect(ownerOnly, 'the assessment tab must be owner-only — it is an internal document')
      .toContain("'assessment'");
    // And gated on its own paid module at the surface, with the edge function as the real line.
    expect(pageSrc).toContain('moduleSlug="project-assessment"');
  });
});

describe('a metric is a value or a stated reason — never a hidden row', () => {
  it('the tab renders every dimension, not just the ones with a score', () => {
    // Mapping over the vocabulary (rather than over the response) is what makes a dimension with
    // nothing to say render "Not judged" instead of disappearing.
    expect(tabSrc, `${TAB} must iterate ASSESSMENT_DIMENSIONS so every tile renders every time`)
      .toContain('ASSESSMENT_DIMENSIONS.map(');
    expect(tabSrc).toContain('Not judged');
  });

  it('a dimension that could not be judged is never shown as a zero', () => {
    // `score ?? 0` or `score || 0` would turn "we could not look" into "this is fine", which is
    // the exact confusion the four signal statuses exist to prevent.
    expect(/score\s*\?\?\s*0|score\s*\|\|\s*0/.test(tabSrc),
      `${TAB} coerces a missing score to 0. A null score means NOT JUDGED and must render as words.`,
    ).toBe(false);
  });

  it('the signal counts name all four statuses, including the ones with no value', () => {
    for (const status of SIGNAL_STATUSES) {
      expect(tabSrc, `${TAB} never mentions the "${status}" status, so those signals are invisible`)
        .toContain(`'${status}'`);
    }
  });

  it('the history shows failed runs with their reason', () => {
    // A failed run is what EXPLAINS a missing report. Filtering it out leaves a gap in the
    // history with no reason attached to it.
    expect(tabSrc).toContain('error_message');
    expect(serviceSrc, 'history() must not filter to complete runs only')
      .toMatch(/history[\s\S]{0,600}from\('project_assessments'\)/);
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
      .toContain('fail_project_assessment');
  });

  it('an unpriced model keeps the ceiling instead of settling to zero', () => {
    // `creditsForTokens` returns null when the model has no ai_model_pricing row. That is a gap
    // in the price table, NOT a free call, and charging nothing for it is the silent-zero
    // mistake with the sign flipped.
    expect(runnerSrc).toMatch(/priced\s*\?\s*priced\.credits\s*:\s*ASSESSMENT_CREDIT_CEILING/);
    expect(runnerSrc).toContain('unpriced_model');
  });

  it('the prompt comes from the database with no code fallback', () => {
    expect(runnerSrc).toContain("loadPrompt(supabase, 'tool', 'project_assessment')");
    // A hardcoded prompt is invisible when it fires: the admin edits the row, saves, and nothing
    // changes forever while every health signal stays green.
    expect(/const\s+\w*PROMPT\w*\s*=\s*[`'"][\s\S]{200,}/.test(runnerSrc),
      `${RUNNER} looks like it carries a hardcoded prompt. Prompts live in the DB, always.`,
    ).toBe(false);
  });

  it('the model output is a forced tool call, not parsed prose', () => {
    // Invariant 9: a classifier whose verdict drives a DB write uses tools + tool_choice, never
    // free-form JSON plus a salvage parser.
    expect(runnerSrc).toContain('tool_choice');
    expect(runnerSrc).toContain("type: 'tool'");
    expect(/JSON\.parse\(/.test(runnerSrc),
      `${RUNNER} parses model output by hand. The forced tool call IS the result.`).toBe(false);
  });

  it('both entry points share one body, so they cannot disagree', () => {
    // The edge function and the agent tool must produce the same report, charge the same credit
    // and hit the same idempotency claim. Two copies would drift on the first change to either.
    expect(edgeSrc).toContain("from '../_shared/project-assessment.ts'");
    expect(toolsSrc).toContain("from '../project-assessment.ts'");
    expect(edgeSrc, 'the edge function must not re-implement the run')
      .not.toContain('callClaudeMessages');
    expect(toolsSrc, 'the tool must not re-implement the run')
      .not.toContain('callClaudeMessages');
  });

  it('the reading tools cost nothing and the paid one says it is paid', () => {
    // "What should I do next" must not cost money to ask twice.
    for (const readerCall of ['createGetProjectAssessmentTool', 'createListAssessmentActionsTool', 'createApplyAssessmentActionTool']) {
      const at = toolsSrc.indexOf(readerCall);
      expect(at, `${TOOLS} no longer exports ${readerCall}`).toBeGreaterThan(-1);
      const body = toolsSrc.slice(at, toolsSrc.indexOf('export const', at + 10) + 1 || undefined);
      expect(body.includes('runProjectAssessment('),
        `${readerCall} runs a paid assessment. Only assess_project may.`).toBe(false);
    }
    expect(toolsSrc, "assess_project's description must state that it costs credits")
      .toMatch(/Costs up to \$\{ASSESSMENT_CREDIT_CEILING\} credits/);
  });
});

describe('every chunk the toolkit emits reaches the screen', () => {
  it('is registered in AGENT_RESULT_TITLES', () => {
    const hubSrc = read(HUB);
    const emitted = new Set(
      [...toolsSrc.matchAll(/type:\s*'(project_assessment_[a-z_]+)'/g)].map((m) => m[1]));
    expect(emitted.size, `${TOOLS} emits no assessment chunks — this guard is pointed at nothing`)
      .toBeGreaterThan(0);
    const titles = hubSrc.slice(hubSrc.indexOf('AGENT_RESULT_TITLES'), hubSrc.indexOf('};', hubSrc.indexOf('AGENT_RESULT_TITLES')));
    const missing = [...emitted].filter((t) => !titles.includes(`${t}:`));
    expect(missing,
      'These chunks are emitted and unregistered, so AgentHub drops them and the user sees a '
      + `cheerful "done" over a blank screen: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the report card can reach the project it is about', () => {
    // A card that names findings and offers no way to the project is the dead end
    // `RESULT_TYPE_CAPABILITY` exists to close (it is what `flows_list` did).
    const caps = read('src/config/capabilities.ts');
    for (const t of ['project_assessment_report', 'project_assessment_actions', 'project_assessment_action_applied']) {
      expect(caps, `${t} has no capability handoff, so its card is a dead end`).toContain(`${t}: 'project'`);
    }
  });
});

describe('tenancy is bound to the verified identity, never to the request body', () => {
  it('the edge function checks workspace access and 404s on a mismatch', () => {
    expect(edgeSrc).toContain('userCanAccessWorkspace(');
    // 403 confirms the id exists; 404 does not (invariant 1).
    expect(edgeSrc).toMatch(/HttpError\(404, 'Project not found'\)/);
    expect(edgeSrc, 'module entitlement is enforced at the API boundary, not by the nav')
      .toContain('assertEntitled(');
  });

  it('the tools resolve a project through the one workspace-scoped resolver', () => {
    expect(toolsSrc).toContain('resolveProjectId(sb, userId, workspaceId');
    // Two copies of a tenancy check is how the hole #395 closed gets reopened one file over.
    const projectTools = read('supabase/functions/_shared/tools/project-tools.ts');
    expect(projectTools).toContain("from '../project-assessment.ts'");
    // Its local wrapper must stay a delegation. A `.from('projects')` inside that body means the
    // query — and with it a second place the workspace filter can be forgotten — came back.
    const at = projectTools.indexOf('async function resolveProjectId');
    expect(at, 'project-tools.ts no longer has the delegating wrapper').toBeGreaterThan(-1);
    const wrapper = projectTools.slice(at, projectTools.indexOf('\n}', at) + 2);
    // Positive first, so an empty slice cannot pass the negative below by being empty.
    expect(wrapper, 'the wrapper no longer delegates').toContain('sbResolveProjectId(');
    expect(wrapper.includes("from('projects')"),
      'project-tools.ts has grown its own copy of the resolver again.').toBe(false);
  });
});
