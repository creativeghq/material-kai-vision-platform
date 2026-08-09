/**
 * Guard: every element the embed widget MOUNTS must also be CREATED (#258).
 *
 * This exists because the bug it catches shipped. `violationsEl` was added to the widget's
 * `replaceChildren(...)` call but never assigned in `renderShell`, so the argument was
 * `undefined` — and `Node.replaceChildren` does not throw on that. It stringifies it, so the
 * widget rendered a literal **"undefined"** on the merchant's product page, between the options
 * and the cart button.
 *
 * WHY NOTHING ELSE SAW IT. `typecheck`, 900 unit tests, `deno check` and the bundle build were all
 * green. The field is declared `private violationsEl!: HTMLDivElement` — the `!` definite-assignment
 * assertion tells TypeScript "trust me, this is assigned", which is precisely the check that would
 * have caught it. The assertion is still the right call for a field assigned in `connectedCallback`
 * rather than the constructor; it just means the guarantee has to come from somewhere else. Here.
 *
 * Text-level rather than behavioural on purpose: mounting a custom element that imports three.js
 * needs a real browser, and this bug is fully visible in the source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src/embed/materialkai-product.ts'), 'utf8');

/** The `renderShell` method body — where the shadow DOM is assembled. */
function renderShellBody(): string {
  const start = SRC.indexOf('private renderShell()');
  expect(start, 'renderShell not found — was it renamed?').toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  }', start);
  return SRC.slice(start, end);
}

describe('the embed widget mounts only elements it created', () => {
  const body = renderShellBody();

  it('finds the shell assembly (guards against a vacuous pass)', () => {
    expect(body).toContain('replaceChildren');
    expect(body.length).toBeGreaterThan(100);
  });

  it('every `this.x` passed to replaceChildren is assigned in the same method', () => {
    const call = body.slice(body.indexOf('replaceChildren'));
    const mounted = [...call.matchAll(/this\.(\w+)/g)].map((m) => m[1]);
    expect(mounted.length, 'no this.* arguments parsed').toBeGreaterThan(2);

    const assigned = new Set(
      [...body.matchAll(/this\.(\w+)\s*=\s*document\.createElement/g)].map((m) => m[1]),
    );

    const unassigned = mounted.filter((name) => name !== 'root' && !assigned.has(name));
    expect(
      unassigned,
      'these are mounted but never created, so replaceChildren receives undefined and renders the '
      + 'string "undefined" into the widget: ' + unassigned.join(', '),
    ).toEqual([]);
  });

  it('every element created in the shell is actually mounted', () => {
    const created = [...body.matchAll(/this\.(\w+)\s*=\s*document\.createElement/g)].map((m) => m[1]);
    const call = body.slice(body.indexOf('replaceChildren'));
    // `overlay` is mounted inside `frame`, not at the shadow root — the one legitimate exception.
    const orphans = created.filter((n) => n !== 'overlay' && !call.includes(`this.${n}`));
    expect(orphans, 'created but never mounted — dead elements: ' + orphans.join(', ')).toEqual([]);
  });

  it('the violations container specifically is both created and mounted', () => {
    // Named explicitly because this is the one that shipped broken.
    expect(body).toMatch(/this\.violationsEl\s*=\s*document\.createElement/);
    expect(body.slice(body.indexOf('replaceChildren'))).toContain('this.violationsEl');
  });
});
