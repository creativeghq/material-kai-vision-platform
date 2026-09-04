/**
 * Dictating a site walk — the rules that decide whether the records are trustworthy.
 *
 * The site log and the snag list existed before this and were both empty, because nobody stops on
 * a scaffold to fill in a form. Dictation is the input method that makes them get used, which puts
 * a transcription between somebody's voice and a job that gets assigned to a real person. Every
 * guard here is about that gap: what gets invented, what gets defaulted, and what gets quietly
 * dropped on the way through.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const EDGE = readFileSync(resolve(ROOT, 'supabase/functions/structure-site-note/index.ts'), 'utf8');
const DIALOG = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/DictateSiteWalkDialog.tsx'), 'utf8',
);
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/siteService.ts'), 'utf8',
);

describe('the dictation reader', () => {
  it('returns a diary entry AND a list of defects, not one blob', () => {
    // One walk produces both. Returning a single note would leave somebody to split it by hand,
    // which is the work this exists to remove; and defects are separate records because they are
    // assigned and closed separately.
    expect(EDGE).toMatch(/log:\s*\{/);
    expect(EDGE).toMatch(/snags:\s*\{\s*\n?\s*type:\s*'array'/);
  });

  it('forces the tool rather than parsing free-form JSON', () => {
    expect(EDGE).toMatch(/tool_choice:\s*\{\s*type:\s*'tool'/);
    expect(EDGE).not.toMatch(/JSON\.parse\(.*content/);
  });

  it('debits before the model call', () => {
    const debitAt = EDGE.indexOf('debitOrRefuse');
    const callAt = EDGE.indexOf('callClaudeMessages');
    expect(debitAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    expect(debitAt).toBeLessThan(callAt);
  });

  it('derives the workspace from the project row, never from the body', () => {
    expect(EDGE).toMatch(/from\('projects'\)[\s\S]{0,120}workspace_id/);
    expect(EDGE).toContain('userCanAccessWorkspace');
    expect(EDGE).not.toMatch(/const\s*\{[^}]*workspace_id[^}]*\}\s*=\s*body/);
  });

  it('loads its prompt from the database with no code fallback', () => {
    expect(EDGE).toContain("loadPrompt(admin, 'extraction', 'site_note_structure')");
    expect(EDGE).not.toMatch(/loadPrompt\([^)]*\)\s*(\|\||\?\?)/);
  });

  /**
   * The room list is READ server-side, not taken from the caller. A caller-supplied list could
   * name another project's rooms, and the id the model picks is written onto a defect — so the
   * validation has to be against rooms this project actually has.
   */
  it('reads the rooms itself and validates the chosen id against them', () => {
    expect(EDGE).toMatch(/from\('project_rooms'\)[\s\S]{0,80}eq\('project_id'/);
    expect(EDGE).toContain('roomIds.has(row.room_id)');
  });

  it('never snaps an unrecognised severity to a guess', () => {
    // Guessing upward sends somebody to site for a scuffed skirting; guessing downward buries
    // something unsafe. Unrecognised becomes null and the create default stands.
    expect(EDGE).toContain('isSnagSeverity(row.severity) ? row.severity : null');
  });

  it('reads the severity vocabulary from the mirror, not a second copy', () => {
    expect(EDGE).toContain("from '../_shared/snagVocabulary.generated.ts'");
    expect(EDGE).not.toMatch(/const\s+SNAG_SEVERITIES\s*=/);
  });

  it('writes nothing', () => {
    expect(EDGE).not.toMatch(/\.insert\(/);
    expect(EDGE).not.toMatch(/\.upsert\(/);
    expect(EDGE).not.toMatch(/from\('project_snags'\)/);
    expect(EDGE).not.toMatch(/from\('project_site_logs'\)/);
  });

  /**
   * The one that matters most. A dictation that silently loses one of the six faults somebody
   * just walked past is worse than no dictation, because they believe it was recorded.
   */
  it('names everything it could not use instead of discarding it', () => {
    expect(EDGE).toContain('unclear');
    expect(EDGE).toContain('dropped');
    expect(EDGE).toContain('room_unmatched');
    // A titleless defect is pushed onto `dropped`, never filed under a placeholder.
    expect(EDGE).toMatch(/if \(!title\)[\s\S]{0,200}dropped\.push/);
  });
});

describe('the dictation dialog', () => {
  it('writes nothing until the person has seen the proposal', () => {
    // `read` only sets state; the create calls live in `save`, behind the Create records button.
    const read = DIALOG.slice(DIALOG.indexOf('const read ='), DIALOG.indexOf('const save ='));
    expect(read).toContain('structureDictation');
    expect(read).not.toContain('createSnag');
    expect(read).not.toContain('createSiteLog');
    expect(read).not.toContain('recordSiteWalk');
    // ONE write, in save: `record_site_walk` creates the log entry and its defects atomically.
    // The loop of createSiteLog + createSnag it replaced committed the log, failed on a defect,
    // and duplicated the log on retry (anti-regression rule 4).
    expect(DIALOG).toMatch(/const save =[\s\S]*recordSiteWalk/);
    expect(DIALOG).not.toContain('createSnag(');
    expect(DIALOG).not.toContain('createSiteLog(');
  });

  it('lets the transcript be corrected before it is read', () => {
    // The fastest fix for a misheard word is to correct it before the model reads it, not after.
    expect(DIALOG).toContain('onChange={(e) => setTyped(e.target.value)}');
  });

  it('says so when the browser cannot listen, and still works', () => {
    // Speech recognition is simply absent in some browsers. A dead button would look broken.
    expect(DIALOG).toContain('voice.isSupported');
    expect(DIALOG).toMatch(/!voice\.isSupported && \(/);
    expect(DIALOG).toContain('Type the note below instead');
  });

  it('shows what was heard but not recorded', () => {
    expect(DIALOG).toContain('proposal.unclear');
    expect(DIALOG).toContain('proposal.dropped');
    expect(DIALOG).toContain('room_unmatched');
  });

  it('omits severity entirely when none was indicated', () => {
    // Spreading a conditional key rather than passing null keeps the DB default (medium) as the
    // one place the fallback lives.
    expect(DIALOG).toContain("...(s.severity ? { severity: s.severity } : {})");
  });

  it('dates the log entry on the operator local day', () => {
    // Rule 1b — a UTC date puts a Greek site walk on yesterday's diary before 03:00.
    expect(DIALOG).toContain('todayLocalISO()');
    expect(DIALOG).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });

  it('does not default the dictation language to Greek', () => {
    // English is the platform default everywhere; the Greek option is offered, not assumed.
    expect(DIALOG).toMatch(/LANGUAGES\[0\]\.code/);
    expect(DIALOG).toMatch(/\{ code: 'en-US'/);
    const first = DIALOG.indexOf("code: 'en-US'");
    const second = DIALOG.indexOf("code: 'el-GR'");
    expect(first).toBeLessThan(second);
  });
});

describe('the service', () => {
  it('returns the proposal rather than creating anything', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('async structureDictation'));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('functions.invoke');
    expect(body).not.toContain('.insert(');
  });
});
