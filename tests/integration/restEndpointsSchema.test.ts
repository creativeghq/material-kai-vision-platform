import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCreds, SUPABASE_URL } from './_harness';

interface Column { name: string; type: string; required?: boolean }
interface Resource { name: string; kind: 'table' | 'view' | 'rpc'; columns?: Column[]; args?: Column[] }
interface Swagger {
  definitions: Record<string, { properties: Record<string, { format?: string }> }>;
  paths: Record<string, { post?: { parameters?: Array<{ in: string; schema?: { properties?: Record<string, { format?: string }>; required?: string[] } }> } }>;
}

const { resources } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'scripts', 'rest-endpoints.json'), 'utf8'),
) as { resources: Resource[] };

const suite = hasCreds ? describe : describe.skip;
const fmt = (m: Record<string, { format?: string }>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.format ?? '']));
const asDoc = (cols: Column[]) => Object.fromEntries(cols.map((c) => [c.name, c.type]));

suite('rest-endpoints.json (a captured snapshot) still matches the live schema PostgREST describes', () => {
  let live: Swagger;

  beforeAll(async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET /rest/v1/ → ${res.status}`);
    live = await res.json() as Swagger;
  });

  for (const r of resources.filter((x) => x.kind !== 'rpc')) {
    it(`${r.kind} ${r.name}: same columns, same types`, () => {
      const def = live.definitions[r.name];
      expect(def, `${r.name} is not exposed by PostgREST`).toBeTruthy();
      expect(asDoc(r.columns!)).toEqual(fmt(def.properties));
    });
  }

  for (const r of resources.filter((x) => x.kind === 'rpc')) {
    it(`rpc ${r.name}: same arguments, same types`, () => {
      const body = live.paths[`/rpc/${r.name}`]?.post?.parameters?.find((p) => p.in === 'body')?.schema;
      expect(body, `rpc ${r.name} is not exposed by PostgREST`).toBeTruthy();
      expect(asDoc(r.args!)).toEqual(fmt(body!.properties ?? {}));
      expect(r.args!.filter((a) => a.required).map((a) => a.name).sort()).toEqual([...(body!.required ?? [])].sort());
    });
  }
});
