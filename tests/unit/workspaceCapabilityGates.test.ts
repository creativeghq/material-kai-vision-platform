import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  CAPABILITIES, WORKSPACE_ROLE_CAPABILITIES, BUSINESS_CAPABILITIES,
} from '../../src/auth/roleCapabilities';
import { PERSONA_CAPABILITIES } from '../../src/auth/capabilities';
import { WORKSPACE_MEMBER_ROLES } from '../../src/auth/workspaceRoles';
import { TOOLKITS } from '../../src/components/features/ai/agentToolsCatalog';

const ROOT = join(__dirname, '..', '..');
const FN = join(ROOT, 'supabase', 'functions');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}
const rel = (p: string) => relative(FN, p).split(sep).join('/');
const sources = walk(FN).map((p) => ({ file: rel(p), code: stripComments(readFileSync(p, 'utf8')) }));

const UNGATED_TOOLKITS: Record<string, string> = {
  'trip-expenses': "the caller's own trip claims",
  'job-research': "the caller's own job search",
  'my-hr': "the caller's own HR record",
};

/** Bare membership is the right gate only where ANY member may act. Shrink-only. */
const MEMBERSHIP_ONLY: Record<string, { calls: number; reason: string }> = {
  'agent-eval/index.ts': { calls: 1, reason: 'already restricted to platform operators one line above' },
  'flow-engine/index.ts': { calls: 1, reason: 'binds a client-emitted event: any member\'s action may trigger automations' },
};

describe('workspace capability gates (#493)', () => {
  it('no edge function gates on allowedRoles except agent-chat\'s agent table', () => {
    const offenders = sources
      .filter((s) => s.file !== '_shared/auth.ts' && !s.file.startsWith('agent-chat/'))
      .filter((s) => /allowedRoles\s*:/.test(s.code))
      .map((s) => s.file);
    expect(offenders, 'allowedRoles admits a role held in ANY workspace — use userHasWorkspaceCapability '
      + 'or authenticatePlatformOperator').toEqual([]);
  });

  it('bare userCanAccessWorkspace is called only where membership is the right gate', () => {
    const found: Record<string, number> = {};
    for (const s of sources) {
      if (s.file === '_shared/auth.ts' || s.file.endsWith('.generated.ts')) continue;
      const n = (s.code.match(/userCanAccessWorkspace\s*\(/g) ?? []).length;
      if (n) found[s.file] = n;
    }
    const expected = Object.fromEntries(Object.entries(MEMBERSHIP_ONLY).map(([f, v]) => [f, v.calls]));
    expect(found, 'a membership-only check lets a client or warehouse login do this — pass the capability '
      + 'with userHasWorkspaceCapability, or add the file to MEMBERSHIP_ONLY with a reason').toEqual(expected);
  });

  it('the CRM scope is narrowed to workspaces where the role holds crm.view', () => {
    const scope = sources.find((s) => s.file === 'crm-api/handlers/_scope.ts')!.code;
    expect(scope).toMatch(/roleHasCapability\(m\.role, 'crm\.view'\)/);
  });

  it('every stored workspace role has a row in the capability table, and only those', () => {
    expect(Object.keys(WORKSPACE_ROLE_CAPABILITIES).sort()).toEqual([...WORKSPACE_MEMBER_ROLES].sort());
  });

  it('every capability named in the table is a declared capability', () => {
    const declared = new Set<string>(CAPABILITIES);
    for (const [role, caps] of Object.entries(WORKSPACE_ROLE_CAPABILITIES)) {
      for (const c of caps) expect(declared.has(c), `${role} → ${c}`).toBe(true);
    }
  });

  it('owner and admin hold the business set; no other role holds workspace.manage', () => {
    expect(WORKSPACE_ROLE_CAPABILITIES.owner).toEqual(BUSINESS_CAPABILITIES);
    expect(WORKSPACE_ROLE_CAPABILITIES.admin).toEqual(BUSINESS_CAPABILITIES);
    const holders = Object.entries(WORKSPACE_ROLE_CAPABILITIES)
      .filter(([, caps]) => caps.includes('workspace.manage')).map(([r]) => r).sort();
    expect(holders).toEqual(['admin', 'owner']);
  });

  it('personas are derived from the role table, not restated', () => {
    expect(PERSONA_CAPABILITIES.staff).toEqual([...WORKSPACE_ROLE_CAPABILITIES.member]);
    expect(PERSONA_CAPABILITIES.warehouse_staff).toEqual([...WORKSPACE_ROLE_CAPABILITIES.warehouse]);
    expect(PERSONA_CAPABILITIES.guest).toEqual([]);
    const src = stripComments(readFileSync(join(ROOT, 'src/auth/capabilities.ts'), 'utf8'));
    expect(src, 'capabilities.ts lists capabilities by hand again').not.toMatch(/'finance\.manage'/);
  });

  it('every toolkit that is not always-on declares the capability that unlocks it', () => {
    const missing = TOOLKITS
      .filter((t) => !t.alwaysOn && !t.capability && !(t.id in UNGATED_TOOLKITS))
      .map((t) => t.id);
    expect(missing, 'a toolkit with no capability binds for a warehouse or HR login too').toEqual([]);
  });

  it("agent-chat binds a tool only when the caller's role holds one of its clusters' capabilities", () => {
    const chat = sources.find((s) => s.file === 'agent-chat/index.ts')!.code;
    expect(chat).toMatch(/const config = \{ tools: \[\.\.\.requestedIds\]\.filter\(\(t\) => !deniedByRole\.has\(t\)\) \}/);
    expect(chat).toMatch(/\.filter\(roleMayUseCluster\)/);
  });
});
