/**
 * #378 class C — a link that only works in the direction that writes it.
 *
 * A cross-module foreign key is easy to ship half-built: the picker saves, the value persists,
 * and every screen that writes it looks correct. The side that should READ it simply does not
 * exist, and nothing anywhere reports a problem. `orders.property_id` and
 * `supplier_bills.property_id` sat that way until `PropertyCommercialCard` was written;
 * `projects.property_id` sat that way until `PropertyProjectsCard`.
 *
 * The failure this guards is REGRESSION rather than absence: deleting the reader, or unmounting
 * it from the workbench, restores the exact original state — a write-only link — and no test,
 * typecheck or lint would notice, because everything that writes it still compiles and still
 * works.
 *
 * Adding a third closed link is one row. It does NOT prove the reader renders anything useful,
 * only that the chain column → RPC → component → mount is unbroken.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const WORKBENCH = 'src/modules/real-estate/pages/PropertyWorkbench.tsx';

/** Each row: a formerly one-way link, and the reader that closed it. */
const CLOSED_ONE_WAY_LINKS = [
  {
    link: 'orders.property_id + supplier_bills.property_id',
    rpc: 'get_property_commercial_links',
    component: 'PropertyCommercialCard',
  },
  {
    link: 'projects.property_id',
    rpc: 'get_property_projects',
    component: 'PropertyProjectsCard',
  },
] as const;

const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

describe('#378 C — every closed one-way property link still has its reader', () => {
  const workbench = read(WORKBENCH);

  it.each(CLOSED_ONE_WAY_LINKS)('$link is read by $component', ({ rpc, component }) => {
    const file = `src/modules/real-estate/components/${component}.tsx`;

    expect(existsSync(join(ROOT, file)), `${file} is gone — the link is write-only again`).toBe(true);

    const src = read(file);
    expect(src, `${component} no longer calls ${rpc}`).toContain(rpc);

    // Mounted, not merely present. An unmounted reader is the same defect wearing a file.
    expect(workbench, `${component} is not mounted in the property workbench`)
      .toMatch(new RegExp(`<${component}\\b`));
    expect(workbench, `${component} is not imported by the property workbench`)
      .toContain(component);
  });

  it('the readers take the property from the route, never from a prop the caller invents', () => {
    // Both are mounted as `propertyId={id}` — the workbench's own route param. A reader handed
    // some other id would report one building's work on another's page.
    for (const { component } of CLOSED_ONE_WAY_LINKS) {
      expect(workbench).toMatch(new RegExp(`<${component}\\s+propertyId=\\{id\\}`));
    }
  });
});
