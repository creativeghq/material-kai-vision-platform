import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

interface Param { name: string; required?: boolean }
interface EdgeEntry {
  name: string;
  tag?: string;
  security?: string[];
  methods?: string[];
  request?: Param[] | { fields?: Record<string, unknown> };
  params?: Param[];
  actions?: Array<{ name?: string; action?: string; params?: Param[] }>;
  common?: Param[];
}
interface Column { name: string; type: string }
interface RestResource {
  name: string;
  kind: 'table' | 'view' | 'rpc';
  methods?: string[];
  filters?: string[];
  columns?: Column[];
  args?: Column[];
  returns?: Column[] | null;
}

const edge = readJson('scripts/edge-endpoints.json') as EdgeEntry[];
const rest = readJson('scripts/rest-endpoints.json') as { tag: string; resources: RestResource[] };
const spec = readJson('public/api/openapi-edge.json');

const READ_KEYS = new Set([
  'name', 'tag', 'summary', 'description', 'security', 'docs', 'methods', 'methodDocs',
  'request', 'params', 'response', 'actions', 'common', 'routes', 'query',
]);

describe('the published spec', () => {
  it('is what the generator writes from the committed sources', () => {
    let out = '';
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/build-openapi-edge.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      out = String((err as { stderr?: string }).stderr ?? err);
    }
    expect(out, 'Run `npm run openapi:edge` and commit the result').toBe('');
  });

  it('every key an edge entry uses is one the generator reads', () => {
    const unread = edge.flatMap((e) => Object.keys(e).filter((k) => !READ_KEYS.has(k)).map((k) => `${e.name}.${k}`));
    expect(unread).toEqual([]);
  });

  it('every edge entry states its tag and its auth', () => {
    const missing = edge.filter((e) => !e.tag || !Array.isArray(e.security)).map((e) => e.name);
    expect(missing).toEqual([]);
  });

  it('a POST entry that describes a body is published with one', () => {
    const dropped = edge.filter((e) => {
      const posts = (e.methods?.length ? e.methods : ['POST']).some((m) => m.toUpperCase() === 'POST');
      const req = e.request;
      const described = (Array.isArray(req) && req.length > 0)
        || (!!req && !Array.isArray(req) && Object.keys(req.fields ?? {}).length > 0)
        || (e.params?.length ?? 0) > 0
        || (e.actions?.length ?? 0) > 0;
      return posts && described && !spec.paths[`/${e.name}`]?.post?.requestBody;
    }).map((e) => e.name);
    expect(dropped).toEqual([]);
  });

  it('an action-discriminated entry publishes one branch per action, with its common fields', () => {
    const revolut = edge.find((e) => e.name === 'revolut-api')!;
    const branches = spec.paths['/revolut-api'].post.requestBody.content['application/json'].schema.oneOf as Array<{
      required: string[]; properties: Record<string, { enum?: string[] }>;
    }>;
    expect(branches.map((b) => b.properties.action.enum?.[0])).toEqual(revolut.actions!.map((a) => a.name));
    for (const b of branches) expect(b.required).toContain('workspace_id');
  });
});

describe('database resources (Banking)', () => {
  it('answers "which accounts do we have and what is their balance"', () => {
    const balances = rest.resources.find((r) => r.name === 'vw_bank_account_balances');
    expect(balances?.columns?.map((c) => c.name)).toEqual(expect.arrayContaining(['bank_account_id', 'workspace_id', 'current_balance']));
    expect(spec.paths['/rest/v1/vw_bank_account_balances']?.get).toBeTruthy();
  });

  it('every table and view is filterable by the columns it names', () => {
    for (const r of rest.resources.filter((x) => x.kind !== 'rpc')) {
      const cols = new Set(r.columns!.map((c) => c.name));
      for (const f of r.filters ?? []) expect(cols.has(f), `${r.name}.${f}`).toBe(true);
    }
  });

  it('documents no credential column', () => {
    const secretish = /private_key|secret|token|password|api_key/i;
    const leaks = rest.resources.flatMap((r) => [...(r.columns ?? []), ...(r.returns ?? [])]
      .filter((c) => secretish.test(c.name)).map((c) => `${r.name}.${c.name}`));
    expect(leaks).toEqual([]);
  });

  it('is published under its own tag, on the database origin', () => {
    for (const r of rest.resources) {
      const path = r.kind === 'rpc' ? `/rest/v1/rpc/${r.name}` : `/rest/v1/${r.name}`;
      expect(spec.paths[path], path).toBeTruthy();
      expect(spec.paths[path].servers[0].url).not.toContain('/functions/v1');
    }
    expect(spec.tags.map((t: { name: string }) => t.name)).toContain(rest.tag);
  });
});
