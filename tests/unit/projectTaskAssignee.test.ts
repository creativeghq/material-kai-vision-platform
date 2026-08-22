/**
 * Who is doing this (#378 N2).
 *
 * `project_tasks.assignee_id` referenced `auth.users`, so work could only be given to somebody with
 * a platform LOGIN — while `hr_employees` is the roster that knows who actually works here, and a
 * fitter or a subcontractor without an account is exactly who a site task is for. The column, its
 * FK and `CreateTaskInput.assignee_id` all existed; **the tasks UI rendered no assignee at all**,
 * so the schedule could not answer "who" and crew planning happened off-platform.
 *
 * The failure mode this guards is the one that shipped last time in a different costume: a control
 * that renders and writes nothing. Three ways that happens here, each with a test:
 *
 *   1. the picker is populated by nothing        → an empty dropdown, forever
 *   2. picking somebody writes neither column    → a Select that changes no data
 *   3. one column is set without clearing the other → the DB CHECK rejects the write, or worse,
 *      a task ends up with two owners and the row means nothing
 */
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
