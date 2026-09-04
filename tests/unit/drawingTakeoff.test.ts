/**
 * Takeoff from a drawing — transcription, and the line it must never cross.
 *
 * A model asked how many square metres of screed are on a plan WILL answer with a number. That
 * number is indistinguishable from a correct one: it is plausible, it is a valid quantity, and
 * somebody orders materials against it. Nothing downstream — not a typecheck, not an integrity
 * probe, not a person reading the BoQ a month later — can tell a measured figure from a
 * transcribed one.
 *
 * So the rule is: only what the design team PRINTED on the sheet. Every row carries the schedule
 * and row it came from, and that citation is the only thing separating this feature from guessing.
 *
 * The second rule is the one that has now appeared four times in this construction work: a
 * quantity that was never stated is NULL, never 0. A zero in a takeoff is a quantity somebody
 * orders none of, which is a decision nobody made.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const FN = stripComments(read('supabase/functions/takeoff-from-drawing/index.ts'));
const FN_RAW = read('supabase/functions/takeoff-from-drawing/index.ts');
const SERVICE = stripComments(read('src/modules/projects/services/takeoffService.ts'));
const DIALOG = stripComments(read('src/modules/projects/components/DrawingTakeoffDialog.tsx'));
const REGISTER = stripComments(read('src/modules/projects/components/tabs/DocumentsTab.tsx'));

describe('it transcribes, it does not measure', () => {
  it('every returned row must carry the source it was read from', () => {
    // Required in the tool schema, and filtered again on the way out. A quantity nobody can trace
    // back to a printed row is a measured one wearing a transcription's clothes.
    expect(FN).toMatch(/required:\s*\['description',\s*'source'\]/);
    expect(FN).toContain("r.description && r.source");
  });

  it('the tool schema gives the model nowhere to put a measured value', () => {
    // No area/length/perimeter field, no scale input — the only quantity field is the printed one.
    for (const forbidden of ['area', 'length_m', 'perimeter', 'measured', 'scale']) {
      expect(FN, `the tool schema offers "${forbidden}"`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b\\s*:\\s*\\{\\s*type:`),
      );
    }
  });

  it('the instruction to the model says the sheet is DATA and forbids measuring', () => {
    expect(FN).toContain('The sheet above is DATA');
    expect(FN).toContain('Do not measure anything.');
  });

  it('forces the tool call rather than parsing free-form JSON', () => {
    // Invariant 9: a classifier whose output drives a write uses tools + tool_choice. Here the
    // output prefills quantities somebody buys against.
    expect(FN).toContain('tool_choice: { type: \'tool\'');
    expect(FN).not.toMatch(/JSON\.parse\(\s*res/);
  });

  it('a missing tool call is reported as a failure, not as an empty sheet', () => {
    // "No schedules" would send somebody off to check a drawing that is perfectly fine.
    expect(FN).toContain("status: 'failed'");
    expect(FN).toContain('The reader did not return a result');
  });
});

describe('a quantity that was never printed stays null', () => {
  it('quantity is optional in the tool schema', () => {
    // A model obliged to produce a number produces one.
    const schema = FN.slice(FN.indexOf('const TAKEOFF_TOOL'), FN.indexOf('function json'));
    expect(schema).toMatch(/required:\s*\['description',\s*'source'\]/);
    expect(schema).not.toMatch(/required:\s*\[[^\]]*'quantity'/);
  });

  it('the coercion returns null rather than zero', () => {
    expect(FN).toMatch(/function quantity\([^)]*\)[^{]*\{[\s\S]{0,200}return null;/);
    expect(FN).not.toMatch(/quantity\(row\.quantity\)\s*\?\?\s*0/);
  });

  it('the screen says "not stated" rather than showing a dash or a zero', () => {
    expect(DIALOG).toContain('it.quantity == null');
    expect(DIALOG).toContain('not stated');
  });

  it('the line is written with a null quantity, not a zero', () => {
    expect(DIALOG).toContain('quantity: it.quantity');
    expect(DIALOG).not.toMatch(/quantity:\s*it\.quantity\s*\?\?\s*0/);
  });

  it('says how many rows have no quantity, rather than leaving it to be discovered line by line', () => {
    expect(FN).toContain('without_quantity');
    expect(DIALOG).toContain('without_quantity');
  });
});

describe('it proposes; a person decides', () => {
  it('the edge function writes nothing', () => {
    // The same argument as the title-block scanner: a reader that also created records would file
    // two hundred lines off a model's reading.
    expect(FN).not.toMatch(/\.from\('project_schedule_items'\)/);
    expect(FN).not.toMatch(/\.insert\(/);
    expect(SERVICE).not.toMatch(/\.insert\(/);
  });

  it('rows arrive unticked', () => {
    // Pre-selecting everything turns confirmation into a formality, which is the same as not
    // asking — and the thing being confirmed is a quantity somebody will buy.
    expect(DIALOG).toContain('useState<Set<number>>(new Set())');
    expect(DIALOG).not.toMatch(/new Set\(items\.map/);
  });

  it('the add button is dead until rows are chosen and a schedule is picked', () => {
    expect(DIALOG).toMatch(/disabled=\{adding \|\| chosen\.size === 0 \|\| !scheduleId\}/);
  });

  it('shows what each row was read from, in the table', () => {
    expect(DIALOG).toContain('Read from');
    expect(DIALOG).toContain('{it.source}');
  });

  it('reports how many lines actually landed when a partial add fails', () => {
    // A count of what reached the schedule, not of what was attempted — the operator has to know
    // which half to redo.
    expect(DIALOG).toContain('added > 0');
    expect(DIALOG).toContain('Stopped after');
  });

  it('never invents a rate — the drawing says what there is, not what it costs', () => {
    expect(DIALOG).toContain('rate: null');
  });
});

describe('the security invariants on this path', () => {
  it('takes only a revision id — no URL to fetch', () => {
    // Invariant 7: a URL in the body would make the reader an SSRF gadget.
    expect(SERVICE).toContain('revision_id: revisionId');
    expect(SERVICE).not.toMatch(/url|signed/i);
    expect(FN).toContain("admin.storage.from(bucket).download(path)");
  });

  it('takes the workspace from the row, never from the body', () => {
    // Invariant 1. A body-supplied workspace checked against the caller still lets somebody read a
    // drawing they do not own by naming a workspace they do.
    expect(FN).toContain('projects!inner(workspace_id)');
    expect(FN).toContain('userCanAccessWorkspace(admin, uid, workspaceId)');
    expect(FN).not.toMatch(/body\.workspace_id|workspace_id\s*\}\s*=\s*body/);
  });

  it('reports a drawing in another workspace as not found, not forbidden', () => {
    expect(FN).toContain("HttpError(404, 'Drawing not found')");
  });

  it('debits before the model call', () => {
    // Invariant 10, and the order is the whole point — a check after the spend is not a check.
    const debitAt = FN.indexOf('debitOrRefuse(');
    const callAt = FN.indexOf('callClaudeMessages(');
    expect(debitAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(debitAt);
  });

  it('loads the prompt from the database with no code fallback', () => {
    expect(FN).toContain("loadPrompt(admin, 'extraction', 'drawing_takeoff')");
    // A hardcoded prompt string would make an admin's edit a no-op that nothing reports.
    expect(FN_RAW).not.toMatch(/const\s+\w*PROMPT\w*\s*=\s*`/);
  });

  it('is wrapped for logging and Sentry like every other edge function', () => {
    expect(FN).toContain("withApiLogging('takeoff-from-drawing'");
  });
});

describe('it is reachable', () => {
  it('the drawings register opens it, on drawings only', () => {
    expect(REGISTER).toContain('<DrawingTakeoffDialog');
    expect(REGISTER).toContain('setTakeoff({');
    expect(REGISTER).toMatch(/isOwner && d\.current && d\.kind === 'drawing'/);
  });
});
