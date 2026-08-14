/**
 * `manufacturer_analytics_events.event_type` contract guard (issue #350).
 *
 * This table has TWO independent producers that never see each other:
 *   • src/services/manufacturerAnalyticsService.ts  — in-app product engagement (`product_*`)
 *   • supabase/functions/products-3d-api/index.ts   — the embeddable 3D widget (`embed_*`)
 *
 * For most of its life the table had NO check constraint, despite the service's header comment
 * claiming one. The result was a table that quietly accepted anything: all 43 rows in production
 * turned out to be `embed_*`, while every reader — the Factory Analytics geo panel, the CRM Market
 * tab — filtered for `product_*` types that no constraint guaranteed and no row ever carried. The
 * readers showed "no engagement yet" rather than failing, which is the silent-zero shape.
 *
 * There is now a real CHECK (migration `manufacturer_analytics_event_bus_foundation`). The failure
 * this test prevents is the NEXT one: a producer adds an event type, the migration is forgotten,
 * and every one of those events is rejected at insert time. The beacon swallows the error, so it
 * reads as zero forever — exactly what `EMBED_EVENT_TYPES`' own comment warns happened to
 * `embed_configure` before #341.
 *
 * DB_EVENT_TYPES below mirrors the live CHECK. Adding a type to either producer without adding it
 * here fails this test; adding it here without applying the migration fails at runtime. Keep all
 * three in step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/** The live `manufacturer_analytics_events_event_type_check` allowlist, verbatim. */
const DB_EVENT_TYPES = [
  'product_view',
  'product_save',
  'product_quote',
  'product_search_impression',
  'product_search_click',
  'product_compare',
  'embed_view',
  'embed_model_load',
  'embed_ar_launch',
  'embed_add_to_cart',
  'embed_configure',
  'embed_plan_room',
] as const;

/** Pull the `ManufacturerEventType` string-literal union out of the frontend service. */
function frontendEventTypes(): string[] {
  const src = readFileSync(join(ROOT, 'src/services/manufacturerAnalyticsService.ts'), 'utf8');
  const union = /export type ManufacturerEventType\s*=([\s\S]*?);/.exec(src);
  expect(union, 'ManufacturerEventType union not found — did the service move or get renamed?').toBeTruthy();
  return [...union![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Pull the `EMBED_EVENT_TYPES` allowlist out of the edge function. */
function embedEventTypes(): string[] {
  const src = readFileSync(join(ROOT, 'supabase/functions/products-3d-api/index.ts'), 'utf8');
  const arr = /const EMBED_EVENT_TYPES\s*=\s*\[([\s\S]*?)\]/.exec(src);
  expect(arr, 'EMBED_EVENT_TYPES not found — did products-3d-api move or get renamed?').toBeTruthy();
  return [...arr![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('manufacturer_analytics_events event_type contract', () => {
  it('every frontend event type is accepted by the DB CHECK', () => {
    const missing = frontendEventTypes().filter((t) => !DB_EVENT_TYPES.includes(t as never));
    expect(
      missing,
      `These product events would be REJECTED at insert and read as zero forever. Add them to the `
      + `event_type CHECK via a migration, then to DB_EVENT_TYPES here: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every embed widget event type is accepted by the DB CHECK', () => {
    const missing = embedEventTypes().filter((t) => !DB_EVENT_TYPES.includes(t as never));
    expect(
      missing,
      `These embed events would be REJECTED at insert and read as zero forever (the exact bug `
      + `embed_configure hit before #341). Add them to the event_type CHECK via a migration, then `
      + `to DB_EVENT_TYPES here: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // Scope note: this checks the DECLARED producers (the type union / the allowlist), not call
  // sites. Three product events — search_impression, search_click, compare — are declared and
  // reachable but nothing invokes them yet; wiring them is tracked in #350 increment 3. A
  // call-site assertion would fail the build for work that is deliberately still queued.
  it('the CHECK has no entry that no producer can emit', () => {
    const produced = new Set([...frontendEventTypes(), ...embedEventTypes()]);
    const orphans = DB_EVENT_TYPES.filter((t) => !produced.has(t));
    expect(
      orphans,
      `The CHECK permits event types nothing writes. Either wire a producer or drop them from the `
      + `constraint — a value only the schema believes in is how the last set of dead event types `
      + `survived: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('the two producers do not overlap — each family has exactly one writer', () => {
    const overlap = frontendEventTypes().filter((t) => embedEventTypes().includes(t));
    expect(
      overlap,
      `Two producers claim the same event type, so no reader can tell in-app engagement from `
      + `embedded-widget traffic: ${overlap.join(', ')}`,
    ).toEqual([]);
  });

  it('the frontend service never sends workspace_id — it is derived server-side', () => {
    const src = readFileSync(join(ROOT, 'src/services/manufacturerAnalyticsService.ts'), 'utf8');
    // Comments are stripped first: the header documents WHY the service must not send a
    // workspace_id, and matching that prose would fail the test for explaining itself.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // A client-asserted workspace_id would let a caller attribute engagement to a tenant it does
    // not belong to (security invariant 1). A BEFORE INSERT trigger derives it from the product.
    expect(
      /workspace_id/.test(code),
      'The service must not set workspace_id — the DB trigger derives it from the product, and a '
      + 'body-supplied tenant id is exactly what invariant 1 forbids.',
    ).toBe(false);
  });
});
