import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) =>
  stripComments(readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'));

const DOOR = read('supabase/functions/_shared/assessment-http.ts');
const ASSESS = read('supabase/functions/_shared/assessment.ts');
const TEAM = read('supabase/functions/_shared/project-team.ts');
const API = read('supabase/functions/customer-assets-api/index.ts');
const CRON = read('supabase/functions/asset-service-reminders-cron/index.ts');
const PORTAL = read('supabase/functions/tender-bid-portal/index.ts');
const ESTIMATOR = read('supabase/functions/public-project-plan/index.ts');
const TAKEOFF = read('supabase/functions/takeoff-from-drawing/index.ts');

describe('project team is the edge twin of _user_is_project_team', () => {
  it('requires an ACTIVE workspace membership for a non-owner project member', () => {
    expect(TEAM).toContain("from('project_members')");
    expect(TEAM).toMatch(/from\('workspace_members'\)[\s\S]{0,200}eq\('status', 'active'\)/);
  });

  it('the assessment door applies the subject gate SQL applies', () => {
    expect(DOOR).toContain("finance: 'finance.operate'");
    expect(DOOR).toMatch(/subjectType === 'project' && !\(await userSeesProjectMoney\(/);
  });

  it('the agent resolver is team-based, not owner-only', () => {
    const body = ASSESS.slice(ASSESS.indexOf('export async function resolveProjectId'));
    expect(body.slice(0, 1600)).toContain('userIsProjectTeam(');
    expect(body.slice(0, 1600)).not.toMatch(/eq\('id', projectId\)\.eq\('user_id', userId\)/);
  });

  it('portal send and drawing takeoff check the team', () => {
    expect(PORTAL).toContain('userIsProjectTeam(service, uid, projectId)');
    expect(TAKEOFF).toContain('userIsProjectTeam(admin, uid, doc.project_id)');
  });
});

describe('installed base writes stay inside the row workspace', () => {
  it('asset.update, warranty.save and plan.save verify every referenced id before writing', () => {
    for (const action of ["case 'update':", "case 'warranty.save':", "case 'plan.save':"]) {
      const body = API.slice(API.indexOf(action), API.indexOf(action) + 900);
      const check = body.indexOf('assertRefsInWorkspace(');
      expect(check, `${action} has no reference check`).toBeGreaterThan(-1);
      const write = body.search(/\.(update|insert)\(/);
      expect(check, `${action} checks after it writes`).toBeLessThan(write === -1 ? Infinity : write);
    }
    for (const key of ['customer_company_id', 'supplier_company_id', 'project_id', 'room_id', 'assignee_user_id']) {
      expect(API).toContain(`'${key}'`);
    }
  });

  it('plan.save never discards a failure to open the next occurrence', () => {
    expect(API).toMatch(/const \{ error \} = await service\.rpc\('open_next_service_event'[\s\S]{0,120}if \(error\)/);
    expect(API).not.toMatch(/^\s*await service\.rpc\('open_next_service_event'/m);
  });

  it('the cron notifies only active members of the row workspace and skips stamped rows', () => {
    expect(CRON).toMatch(/async function activeMembers[\s\S]{0,300}eq\('status', 'active'\)/);
    expect(CRON).toContain("responsible_sales_user_ids')\n      .eq('id', companyId || contactId)\n      .eq('workspace_id', workspaceId)");
    expect(CRON).toContain('overdue_reminded_at.is.null');
    expect(CRON).toMatch(/const \{ error: stampErr \} = await db\.from\('customer_asset_service_events'\)/);
  });
});

describe('tender portal prices only an issued, in-date package', () => {
  it('one predicate gates both resolve and submit', () => {
    expect(PORTAL).toMatch(/function packageOpenForPricing[\s\S]{0,200}status !== 'issued'/);
    expect(PORTAL).toContain('pkg.due_at');
    expect(PORTAL).toContain('if (!packageOpenForPricing(pkg))');
    expect(PORTAL).not.toMatch(/pkg\.status === 'awarded' \|\| pkg\.status === 'cancelled'/);
  });
});

describe('public estimator matches a visitor email exactly', () => {
  it('never uses the visitor email as a LIKE pattern', () => {
    expect(ESTIMATOR).not.toMatch(/ilike\('email'/);
    expect(ESTIMATOR).toContain("in('email', ");
  });
});

describe('drawing takeoff reads only its own document folder', () => {
  it('pins bucket and prefix before the download and before the debit', () => {
    const pin = TAKEOFF.indexOf('path.startsWith(`project-docs/${doc.project_id}/${doc.id}/`)');
    const download = TAKEOFF.indexOf('.download(path)');
    const debit = TAKEOFF.indexOf('debitOrRefuse(');
    expect(pin).toBeGreaterThan(-1);
    expect(pin).toBeLessThan(download);
    expect(download).toBeLessThan(debit);
    expect(TAKEOFF).toContain("const DRAWING_BUCKET = 'pdf-documents'");
  });
});
