/** Who is doing this (#378 N2). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const TAB = read('src/modules/projects/components/tabs/TasksTab.tsx');
const SERVICE = read('src/modules/projects/services/projectsService.ts');

describe('the assignee picker is populated', () => {
  it('the tasks tab actually calls the assignee list', () => {
    expect(TAB, 'nothing loads the assignees — the dropdown renders empty forever')
      .toContain('listTaskAssignees');
  });

  it('the service reads the SQL derivation rather than querying user_profiles directly', () => {
    // user_profiles RLS is `is_public OR own row` with no teammate branch, so a plain client read
    // returns a picker full of people called "Member".
    const body = SERVICE.slice(SERVICE.indexOf('async listTaskAssignees('));
    const end = body.indexOf('\n  async ', 1);
    const method = end > 0 ? body.slice(0, end) : body;
    expect(method).toContain('list_project_task_assignees');
    expect(method, 'reading user_profiles from the client returns blanks for teammates')
      .not.toMatch(/from\('user_profiles'\)/);
  });
});

describe('picking somebody actually writes it', () => {
  const handler = (() => {
    const i = TAB.indexOf('const handleAssign');
    expect(i, 'handleAssign should exist').toBeGreaterThan(-1);
    const rest = TAB.slice(i);
    const end = rest.indexOf('\n  const ', 1);
    return end > 0 ? rest.slice(0, end) : rest;
  })();

  it('writes through updateTask', () => {
    expect(handler).toContain('projectsService.updateTask');
  });

  it('sets BOTH columns on every write, so the unchosen one is cleared', () => {
    // The DB CHECK (num_nonnulls(assignee_id, assignee_employee_id) <= 1) refuses two owners. A
    // handler that sets only the chosen column leaves the previous assignee in the other one and
    // the write is rejected — or, if the CHECK were ever dropped, the task has two owners and the
    // row means nothing.
    expect(handler, 'assignee_id must be written on every path').toMatch(/assignee_id:/);
    expect(handler, 'assignee_employee_id must be written on every path').toMatch(/assignee_employee_id:/);
  });

  it('can unassign — a task given to the wrong person must be reversible', () => {
    expect(handler).toContain('NO_ASSIGNEE');
  });
});

describe('the row renders what is stored', () => {
  it('reads both columns, not just the platform user', () => {
    expect(TAB).toMatch(/task\.assignee_employee_id/);
    expect(TAB).toMatch(/task\.assignee_id/);
  });

  it('the service type carries the employee column', () => {
    expect(SERVICE).toMatch(/assignee_employee_id: string \| null;/);
    // Both inputs, or a task can be created with an assignee it can never be given.
    const creates = SERVICE.match(/assignee_employee_id\?: string \| null;/g) ?? [];
    expect(creates.length, 'CreateTaskInput and UpdateTaskInput should both accept it').toBeGreaterThanOrEqual(2);
  });
});
