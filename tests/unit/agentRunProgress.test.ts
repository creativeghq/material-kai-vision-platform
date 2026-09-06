/**
 * Run-progress guard — the canvas has to say what the agent is DOING, for every toolkit.
 *
 * Before this surface existed, the canvas — the biggest thing on the screen — held its
 * welcome copy ("When the agent produces something…") for the whole length of a turn, and
 * for a direct-run quick-start that emits no artifact it held it forever, under a chat that
 * said "done". Eight of the forty-eight toolkits had a hand-written pipeline; the rest had
 * nothing.
 *
 * The fix is a DERIVATION, not forty more hand-written pipelines: agent-chat already emits
 * `tool_call` / `tool_progress` / `tool_result` / `tool_error` for every tool on every turn,
 * so a run is read off the stream. That is what makes coverage total, and it is why these
 * are the things worth pinning:
 *
 *   1. The derivation's verdicts. A failed call must not read as a zero; a step nobody
 *      reported on must not read as done. Both are the silent-zero shape (anti-regression
 *      rule 2/3), and both are a valid-looking card when they go wrong.
 *   2. The wiring. A derivation nothing feeds is the same blank canvas with more code, so
 *      the stream loop must hand it EVERY chunk and every send must open a run.
 *   3. Coverage. No toolkit list anywhere in the run module — the moment one appears, a
 *      toolkit can be left off it silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyRunChunk, createRun, finishRun, runFromWorkflow, resultLine, stepTitleForTool,
} from '@/components/features/ai/runs/runDerivation';
import { runProgress, type AgentRunState } from '@/components/features/ai/runs/runTypes';
import { iconNameForCategory } from '@/components/features/ai/runs/stepIcons';
import {
  isWorkflowAllDone, resolveWizardStepId, wizardHasSomethingToShow,
} from '@/components/features/ai/workflows/wizardState';
import type { WorkflowRuntimeState } from '@/components/features/ai/workflows/types';
import { AGENTS, TOOLKITS } from '@/components/features/ai/agentToolsCatalog';
import { WORKFLOWS, WORKFLOW_TOOLKIT } from '@/components/features/ai/workflows/workflowRegistry';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const HUB = 'src/components/features/ai/AgentHub.tsx';
const CANVAS = 'src/components/features/ai/CanvasPanel.tsx';
const RUN_CANVAS = 'src/components/features/ai/runs/RunCanvas.tsx';
const RUN_DERIVATION = 'src/components/features/ai/runs/runDerivation.ts';

const newRun = () => createRun({ runId: 'r1', title: 'Find porcelain tiles', startedAt: 1_000 });

describe('a run is derived from the stream', () => {
  it('opens one step per tool CALL, not one per tool', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'material_search' });
    run = applyRunChunk(run, { type: 'tool_result', tool: 'material_search', resultCount: 3 });
    run = applyRunChunk(run, { type: 'tool_call', tool: 'material_search' });

    // An agent that searches twice did two things. Folding them onto one step would hide
    // the second search — and its verdict — completely.
    expect(run.step_order).toEqual(['tool:material_search:1', 'tool:material_search:2']);
    expect(run.steps['tool:material_search:1'].status).toBe('done');
    expect(run.steps['tool:material_search:2'].status).toBe('running');
  });

  it('never shows a raw tool id as a step title', () => {
    // Every tool the platform can call, and every tool a quick-start pins.
    const toolIds = new Set<string>([
      ...AGENTS.flatMap((a) => a.tools.map((t) => t.id)),
      ...TOOLKITS.flatMap((tk) => (tk.quick_starts ?? []).map((qs) => qs.run?.tool).filter(Boolean) as string[]),
    ]);
    expect(toolIds.size).toBeGreaterThan(50);

    const raw = [...toolIds].filter((id) => {
      const title = stepTitleForTool(id);
      return title === id || /_/.test(title);
    });
    expect(
      raw,
      'these render as a raw tool id in the run card. The chat has already shown a customer '
      + '"Done — ran manage_appointments." once; add the tool to agentToolsCatalog so it has a name: '
      + raw.join(', '),
    ).toEqual([]);
  });

  it('names a pinned quick-start step before the stream opens, and does not draw it twice', () => {
    let run = createRun({
      runId: 'r2', title: 'Keyword research', startedAt: 1_000,
      plannedTools: ['seo_keyword_research'],
    });
    // The card can say "Step 1 of 1 — Keyword research" on the click, not on the first chunk.
    expect(run.origin).toBe('planned');
    expect(run.step_order).toEqual(['tool:seo_keyword_research:1']);
    expect(run.steps['tool:seo_keyword_research:1'].status).toBe('pending');

    run = applyRunChunk(run, { type: 'tool_call', tool: 'seo_keyword_research' });
    // Adopted, not duplicated — otherwise the planned copy sits at "waiting" forever beside
    // the real one.
    expect(run.step_order).toEqual(['tool:seo_keyword_research:1']);
    expect(run.steps['tool:seo_keyword_research:1'].status).toBe('running');
  });

  it('attaches a progress line to the step it belongs to, and never drops it', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'seo_keyword_research' });
    run = applyRunChunk(run, { type: 'tool_progress', tool: 'seo_keyword_research', status: 'Researching "πλακάκια μπάνιου"…' });
    expect(run.steps['tool:seo_keyword_research:1'].status_line).toBe('Researching "πλακάκια μπάνιου"…');

    // A line that arrives before any tool opened is still the truest thing on screen.
    const early = applyRunChunk(newRun(), { type: 'tool_progress', status: 'Consulting the knowledge base…' });
    expect(early.activity).toBe('Consulting the knowledge base…');
  });

  it('reports a failure as a failure and an empty result as empty — never as each other', () => {
    expect(resultLine({ failed: true, resultCount: 0 })).toBe('Failed');
    expect(resultLine({ zeroResult: true })).toBe('Nothing found');
    expect(resultLine({ resultCount: 0 })).toBe('Nothing found');
    expect(resultLine({ resultCount: 1 })).toBe('1 result');
    expect(resultLine({ resultCount: 12 })).toBe('12 results');
    // A tool that reports no count gets no invented one.
    expect(resultLine({})).toBe('Done');

    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'web_search' });
    run = applyRunChunk(run, { type: 'tool_result', tool: 'web_search', failed: true, resultCount: 0 });
    const step = run.steps['tool:web_search:1'];
    expect(step.status).toBe('failed');
    expect(step.status_line).not.toMatch(/0|Nothing/);
  });

  it('carries a tool_error onto the step with its message', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'web_fetch' });
    run = applyRunChunk(run, { type: 'tool_error', tool: 'web_fetch', error: 'Upstream returned 429' });
    expect(run.steps['tool:web_fetch:1'].status).toBe('failed');
    expect(run.steps['tool:web_fetch:1'].error_message).toBe('Upstream returned 429');
  });

  it('marks a step the turn never reported on as UNREPORTED, not done', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'knowledge_base_search' });
    run = finishRun(run, 'done');

    // The whole point of the surface. `done` here would claim a success nobody reported,
    // `failed` a failure nobody reported — both are a plausible card over an unknown.
    expect(run.steps['tool:knowledge_base_search:1'].status).toBe('unreported');
    expect(run.status).toBe('done');
  });

  it('counts progress off the steps, and does not divide by zero', () => {
    const empty = runProgress(newRun());
    expect(empty).toMatchObject({ settled: 0, total: 0, pct: 0, currentIndex: null });

    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'material_search' });
    run = applyRunChunk(run, { type: 'tool_result', tool: 'material_search', resultCount: 4 });
    run = applyRunChunk(run, { type: 'tool_call', tool: 'visual_search' });
    const p = runProgress(run);
    expect(p).toMatchObject({ settled: 1, total: 2, pct: 50, currentIndex: 2 });
    expect(p.currentTitle).toBe(stepTitleForTool('visual_search'));
  });

  it('records a queued generation as done — the variations arrive after the turn', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'generation_job_created', job_id: 'j1', model_count: 3 });
    const step = run.steps['generation:1'];
    // Left running, the turn's end would mark it `unreported` and read as a failure of
    // something that is simply still going in the grid.
    expect(step.status).toBe('done');
    expect(step.status_line).toContain('3 variations');
  });

  it('says when JARVIS handed the turn to a specialist', () => {
    const run = applyRunChunk(newRun(), { type: 'agent_routed', to: 'pepper', name: 'Pepper' });
    expect(run.activity).toBe('Routed to Pepper.');
  });

  it('hands a turn over to the workflow that announced itself', () => {
    let run = newRun();
    run = applyRunChunk(run, { type: 'tool_call', tool: 'seo_keyword_research' });
    run = applyRunChunk(run, { type: 'workflow_plan', run_id: 'wf-77', definition_id: 'seo-article' });
    // The plan is strictly more informative than the tools discovered under it, and one turn
    // must not draw two cards.
    expect(run.workflow_run_id).toBe('wf-77');
    expect(run.definition_id).toBe('seo-article');
  });

  it('renders a planned workflow through the same model as a discovered run', () => {
    const wf = {
      definition_id: 'seo-article',
      run_id: 'wf-1',
      steps: { research: { step_id: 'research', status: 'done' as const, status_line: '48 keywords' } },
      step_order: WORKFLOWS.find((w) => w.id === 'seo-article')!.steps.map((s) => s.id),
      status: 'running' as const,
      metadata: {},
    };
    const run: AgentRunState = runFromWorkflow(wf, { toolkitId: WORKFLOW_TOOLKIT['seo-article'] });
    expect(run.origin).toBe('planned');
    expect(run.step_order.length).toBe(4);
    expect(run.steps.research.status).toBe('done');
    // A planned run knows its steps before they run — that is what the user is watching.
    expect(run.steps.plan.status).toBe('pending');
    expect(run.steps.plan.title).toBe('Article plan');
    expect(run.toolkit_name).toBe('SEO Article Pipeline');
  });
});

describe('the wizard and the run card agree on when there is an ask', () => {
  const wf = (steps: Record<string, string>, awaiting?: string): WorkflowRuntimeState => ({
    definition_id: 'seo-article',
    run_id: 'wf-1',
    step_order: ['research', 'plan', 'write', 'analyze'],
    steps: Object.fromEntries(
      ['research', 'plan', 'write', 'analyze'].map((id) => [
        id, { step_id: id, status: (steps[id] ?? 'pending') as never },
      ]),
    ),
    status: 'running',
    metadata: {},
    awaiting_input_step_id: awaiting ?? null,
  });

  it('says nothing while the active step is running — the run card is telling that story', () => {
    // The slot carries its own separator and padding, so a null render paints an empty strip
    // under the step list for the whole length of every running step.
    expect(wizardHasSomethingToShow(wf({ research: 'running' }))).toBe(false);
    expect(wizardHasSomethingToShow(wf({ research: 'done', plan: 'awaiting_input' }))).toBe(true);
  });

  it('an explicit ask outranks "everything finished"', () => {
    const done = { research: 'done', plan: 'done', write: 'done', analyze: 'done' };
    expect(isWorkflowAllDone(wf(done))).toBe(true);
    // Re-run / Edit input on a finished step sets awaiting_input_step_id. Short-circuiting to
    // the completion card here meant both buttons produced no form at all.
    expect(isWorkflowAllDone(wf(done, 'write'))).toBe(false);
    expect(resolveWizardStepId(wf(done, 'write'))).toBe('write');
    expect(wizardHasSomethingToShow(wf(done, 'write'))).toBe(true);
  });
});

describe('every toolkit is covered, because nothing lists toolkits', () => {
  it('the run module names no toolkit and no workflow — coverage is structural', () => {
    const body = stripComments(read(RUN_DERIVATION)) + stripComments(read(RUN_CANVAS));
    const named = [...TOOLKITS.map((t) => t.id), ...WORKFLOWS.map((w) => w.id)]
      .filter((id) => new RegExp(`['"\`]${id}['"\`]`).test(body));
    expect(
      named,
      'a toolkit or workflow named in the run module is a list somebody has to remember to '
      + 'extend — which is exactly how 40 of 48 toolkits ended up with no progress surface: '
      + named.join(', '),
    ).toEqual([]);
  });

  it('every tool CATEGORY resolves to its own icon', () => {
    const categories = new Set(AGENTS.flatMap((a) => a.tools.map((t) => t.category)));
    // The fallback renders perfectly and is simply the wrong picture, so it is invisible.
    const unmapped = [...categories].filter((c) => iconNameForCategory(c) === 'Wrench');
    expect(
      unmapped,
      `these categories draw the generic wrench in every run card: ${unmapped.join(', ')}. `
      + 'Add a row to CATEGORY_ICON in runs/stepIcons.ts.',
    ).toEqual([]);
  });

  it('every workflow says which toolkit owns it', () => {
    const missing = WORKFLOWS.map((w) => w.id).filter((id) => !WORKFLOW_TOOLKIT[id]);
    expect(
      missing,
      'the wizard auto-enables this toolkit before running step 1; without it the first step '
      + `comes back "tools not available": ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

describe('the run is wired to the stream and to the canvas', () => {
  const hub = stripComments(read(HUB));

  it('every chunk reaches the run, from the one place that parses them', () => {
    // Not "some branch calls it": the run must see chunks no branch below happens to handle,
    // or a toolkit's progress goes missing the day someone adds a chunk type.
    expect(hub).toMatch(/const chunk = JSON\.parse\(line\);\s*feedRunChunk\(chunk\);/);
  });

  it('every send opens a run, tied to the user message that started it', () => {
    expect(hub).toMatch(/createRun\(\{/);
    expect(hub).toContain('userMessageId: userMessage.id');
    expect(hub).toContain("activeRunIdRef.current = runId");
  });

  it('closes the run on both exits — the error path and the finally', () => {
    expect(hub).toMatch(/endRun\('failed'/);
    expect(hub).toMatch(/endRun\('done'\)/);
  });

  it('the canvas renders the run, and the run is a canvas page kind', () => {
    expect(hub).toContain('<RunCanvas');
    expect(hub).toMatch(/activeCanvasId\?\.startsWith\('run:'\)/);
    const canvas = stripComments(read(CANVAS));
    expect(canvas).toMatch(/\|\s*'run';/);
    expect(canvas).toMatch(/run:\s*ListChecks/);
  });

  it('the rail does not draw the same card the canvas is already drawing', () => {
    // The chat rail is 400px and the run card is a page. Both at once was never the ask.
    expect(hub).toContain('<RunChip');
    expect(hub).toMatch(/!canvasPaneVisible && Object\.values\(workflows\)\.length > 0/);
  });

  it('an aborted workflow does not take its turn page down with it', () => {
    // Suppression keyed on "the workflow exists" hid the aborted card AND the tool run under
    // it, leaving the turn with no page at all.
    expect(hub).toContain('const drawn = new Set(fromWorkflows.map((r) => r.run_id));');
    expect(hub).toMatch(/drawn\.has\(r\.workflow_run_id\)/);
  });

  it('focuses the page the turn actually draws, not the one it suppresses', () => {
    expect(hub).toMatch(/setActiveCanvasId\(`run:\$\{boundWorkflowRunId \?\? runId\}`\)/);
  });

  it('consumes the workflow binding above the early returns', () => {
    // Cleared after them, a send that returns early (empty composer) left the binding set and
    // folded the NEXT unrelated turn into that workflow's card.
    const top = hub.slice(hub.indexOf('const handleSendMessage = useCallback'));
    const consumed = top.indexOf('pendingWorkflowRunIdRef.current = null;');
    const firstGuard = top.indexOf('if (!directRun && !input.trim()');
    expect(consumed).toBeGreaterThan(-1);
    expect(consumed).toBeLessThan(firstGuard);
  });

  it('the wizard advance sends through the ref, not a closure copy', () => {
    // The other `handleSendMessage()` call sites are in the render body, where it is the
    // current render's value. This one is inside a useCallback keyed on `workflows`, so it
    // held whichever copy that render made — with the previous step's `input`.
    const body = hub.slice(
      hub.indexOf('const handleWizardAdvance = useCallback'),
      hub.indexOf('const handleWizardSkip = useCallback'),
    );
    expect(body).toContain('handleSendMessageRef.current');
    expect(body).not.toMatch(/setTimeout\(\(\) => handleSendMessage\(\), 0\)/);
  });

  it('both workflow continue paths bind their send to the workflow', () => {
    // Unbound, the send opens a run of its own and the turn draws two cards: the pipeline,
    // and the tools executing it.
    expect(hub.split('pendingWorkflowRunIdRef.current = ').length - 1).toBe(3);
  });

  it('offers the wizard slot only when the wizard has something to put in it', () => {
    expect(hub).toContain('wizardHasSomethingToShow(activeRunWorkflow)');
  });

  it('a run page carries no Close / Delete — there is no saved row behind it', () => {
    const canvas = stripComments(read(CANVAS));
    expect(canvas).toMatch(/g\.members\.length === 1 && g\.kind !== 'run'/);
    expect(canvas).toMatch(/\(onCloseArtifact \|\| onDeleteArtifact\) && m\.kind !== 'run'/);
  });

  it('never prints an elapsed time it did not measure', () => {
    // A workflow runtime records no end time, so a finished pipeline printed a confident "0s".
    expect(stripComments(read(RUN_CANVAS))).toContain('if (!live && !run.ended_at) return null;');
  });

  it('the step-action handler is one function, not one per surface', () => {
    const occurrences = hub.split('handleWorkflowStepAction').length - 1;
    // Declaration + the tracker + the canvas. A fourth copy means somebody inlined it again.
    expect(occurrences).toBe(3);
  });
});
