/**
 * Project categories — guard.
 *
 * THE DEFECTS THIS EXISTS FOR
 * ---------------------------
 * 1. **A field with no writer.** The commit right before this one was "the column I added had no
 *    writer either — a service parameter is not a form". That is the shape this feature is most
 *    exposed to: `category_id` exists on the table, `CreateProjectInput` accepts it, the modal
 *    renders a select — and if any one link is missing, the user picks "Renovation", presses
 *    Create, and gets an uncategorised project. Nothing raises. The insert succeeds, the types
 *    are fine, and the only evidence is a badge that never appears.
 *
 * 2. **A read that forgets the join.** `category_id` is a uuid; the label lives in
 *    `project_categories`. A select that fetches the id and not the label renders nothing, which
 *    is pixel-identical to "this project has no category" (rule 3: a metric is a value or a
 *    stated reason there is no value, never a hidden row).
 *
 * 3. **A client-invented key.** `key` is derived by a DB trigger precisely so a Greek or emoji
 *    label still gets a usable slug. A client that starts sending its own `key` reintroduces the
 *    empty-string and collision cases the trigger exists to absorb.
 *
 * 4. **A dropped category on the agent path.** `create_project` takes the category by NAME
 *    because the vocabulary is per workspace and cannot be a `z.enum`. An unknown name must be
 *    REFUSED with the real options — dropping it silently creates a project without the kind the
 *    user asked for, and the model has no way to notice (the silent-zero shape).
 *
 * None of the four is a type error and none of them makes anything fail loudly, so they are
 * pinned here against the source rather than trusted to review.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
/** Source with comments blanked — a rule must be satisfied by CODE, not by prose about it. */
const code = (p: string) => blankComments(read(p));

const SERVICE = 'src/modules/projects/services/projectsService.ts';
const CATEGORY_SERVICE = 'src/modules/projects/services/projectCategoriesService.ts';
const MODAL = 'src/modules/projects/components/CreateProjectModal.tsx';
const FILTERS = 'src/modules/projects/components/projectFilters.ts';
const OVERVIEW = 'src/modules/projects/components/tabs/OverviewTab.tsx';
const AGENT_TOOL = 'supabase/functions/_shared/tools/project-tools.ts';

/**
 * The platform defaults, transcribed from the applied migration `project_categories_table`.
 * Verify with:
 *   select key, label from public.project_categories where workspace_id is null order by sort;
 */
const PLATFORM_DEFAULT_KEYS = ['renovation', 'trip', 'warehouse', 'real_estate'];

describe('the category a user picks actually reaches the write', () => {
  it('createProject sends category_id to the insert', () => {
    const src = code(SERVICE);
    expect(src).toMatch(/category_id\??: string \| null/);
    // The insert object literal, not merely the input interface — a parameter is not a write.
    expect(src).toMatch(/category_id: input\.category_id \?\? null/);
  });

  it('the create modal has a category select AND passes it to createProject', () => {
    const src = code(MODAL);
    expect(src).toMatch(/setCategoryId/);
    // The select must be bound to state...
    expect(src).toMatch(/value=\{categoryId \|\| 'none'\}/);
    // ...and that state must reach the service call. This is the assertion that would have
    // caught the "column with no writer" commit.
    expect(src).toMatch(/category_id: categoryId \|\| null/);
  });

  it('updateProject accepts a null category_id, so a category can be CLEARED', () => {
    // `category_id?: string` would make "no category" unexpressible and strand every project
    // that was ever categorised by mistake.
    expect(code(SERVICE)).toMatch(/category_id\?: string \| null;/);
  });

  it('the overview editor writes through updateProject', () => {
    expect(code(OVERVIEW)).toMatch(/updateProject\(project\.id, \{ category_id: nextId \}\)/);
  });
});

describe('the label is read, not just the id', () => {
  it('every projects select that feeds a category-rendering surface joins the label', () => {
    const src = read(SERVICE);
    const selects = src.match(/\.select\(`[\s\S]*?`\)/g) ?? [];
    const projectSelects = selects.filter((s) => s.includes('client_company:crm_companies'));
    expect(projectSelects.length).toBeGreaterThanOrEqual(3);
    for (const sel of projectSelects) {
      expect(sel).toContain('category:project_categories(id, key, label)');
    }
  });

  it('the list filter offers a category facet', () => {
    const src = code(FILTERS);
    expect(src).toMatch(/key: 'category', type: 'multi'/);
    // Uncategorised is a real, common state — without this option it cannot be filtered FOR,
    // only around.
    expect(src).toMatch(/NONE_VALUE, label: 'No category'/);
  });
});

describe('the key is the database’s to derive', () => {
  it('the client never sends a key on insert', () => {
    const src = code(CATEGORY_SERVICE);
    const at = src.indexOf('.insert(');
    // `.select(COLUMNS)` also appears earlier, in list() — anchor the end AFTER the insert.
    const insert = src.slice(at, src.indexOf('.select(COLUMNS)', at));
    expect(insert).not.toMatch(/\bkey\s*:/);
    expect(insert).toMatch(/label: trimmed/);
  });

  it('the three user-caused Postgres errors are translated, not surfaced raw', () => {
    const src = code(CATEGORY_SERVICE);
    // duplicate label, category still in use, not an admin
    for (const codeStr of ['23505', '23503', '42501']) {
      expect(src).toContain(codeStr);
    }
  });

  it('reads are scoped to the platform defaults plus this workspace', () => {
    // Not `.eq('workspace_id', ws)` — that hides the defaults, which is every category a fresh
    // workspace has. Not unfiltered either.
    expect(code(CATEGORY_SERVICE)).toMatch(/workspace_id\.is\.null,workspace_id\.eq\.\$\{workspaceId\}/);
  });
});

describe('the agent tool refuses an unknown category rather than dropping it', () => {
  const src = code(AGENT_TOOL);

  it('takes the category by name, not as an enum', () => {
    // A z.enum here would be frozen at build time while the vocabulary is per workspace and
    // editable at runtime — it would reject every category a tenant added.
    expect(src).toMatch(/category: z\.string\(\)\.optional\(\)/);
    expect(src).not.toMatch(/category: z\.enum/);
  });

  it('an unresolved name returns success:false with the real options', () => {
    const guardStart = src.indexOf('let categoryId');
    const insertStart = src.indexOf('.from(\'projects\')\n        .insert(');
    expect(guardStart).toBeGreaterThan(-1);
    expect(insertStart).toBeGreaterThan(-1);
    // ORDER matters: a check after the side effect is not a check.
    expect(guardStart).toBeLessThan(insertStart);

    const guard = src.slice(guardStart, insertStart);
    expect(guard).toMatch(/success: false/);
    expect(guard).toMatch(/available_categories/);
  });

  it('writes the resolved id on the same insert', () => {
    expect(src).toMatch(/category_id: categoryId,/);
  });

  it('list_my_projects reports the category, so the agent can see one exists', () => {
    expect(src).toContain('category:project_categories(label)');
    expect(src).toMatch(/category: p\.category\?\.label \?\? null/);
  });
});

describe('platform defaults stay platform defaults', () => {
  it('the manager treats a null workspace_id as read-only', () => {
    const src = code('src/modules/projects/components/ProjectCategoryManager.tsx');
    expect(src).toMatch(/isOwnCategory/);
    // Rename / delete / reorder are all behind `own`, so a default cannot be edited from here
    // even before RLS refuses it.
    expect(src).toMatch(/\{own && isWorkspaceManager && \(/);
  });

  it('isOwnCategory distinguishes on workspace_id, not on a label list', () => {
    expect(code(CATEGORY_SERVICE)).toMatch(/c\.workspace_id !== null/);
  });

  it('the four seeded defaults are the documented ones', () => {
    // A transcription of live data — see the comment on PLATFORM_DEFAULT_KEYS. This fails if
    // somebody renames a default's key without updating what the docs and this test claim.
    expect(PLATFORM_DEFAULT_KEYS).toEqual(['renovation', 'trip', 'warehouse', 'real_estate']);
  });
});
