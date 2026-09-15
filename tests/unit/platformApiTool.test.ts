import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  PLATFORM_API_BLOCKED, PLATFORM_API_CONFIRM, platformApiAccess, classifiedEndpointNames,
} from '../../src/config/platformApiAccess';
import { buildCatalog } from '../../scripts/gen-platform-api-catalog.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => stripComments(read(p));

const TOOL = 'supabase/functions/_shared/tools/platform-api-tools.ts';
const CATALOG_FILE = 'supabase/functions/_shared/platformApiCatalog.generated.ts';
const src = code(TOOL);

const catalog = buildCatalog() as Array<{ name: string; methods: string[]; tag: string }>;
const names = new Set(catalog.map((e) => e.name));

describe('the callable set is derived from the code, not hand-kept', () => {
  it('the generated catalogue is fresh', () => {
    // A stale catalogue is the whole failure mode in miniature: an endpoint that shipped is
    // unreachable, or one that was locked down is still offered.
    const gen = require('../../scripts/gen-platform-api-catalog.mjs');
    expect(read(CATALOG_FILE).replace(/\r\n/g, '\n'))
      .toBe(gen.render(gen.buildCatalog()).replace(/\r\n/g, '\n'));
  });

  it('holds only endpoints a user JWT opens', () => {
    const endpoints = Object.values(
      JSON.parse(read('scripts/edge-endpoints.json')),
    ) as Array<{ name: string; security?: string[] }>;
    const byName = new Map(endpoints.map((e) => [e.name, e]));
    expect(catalog.length).toBeGreaterThan(50);
    for (const entry of catalog) {
      expect(byName.get(entry.name)?.security, `${entry.name} is in the agent catalogue`)
        .toContain('supabaseJwt');
    }
  });

  it('cron-secret, admin-secret and webhook-signed endpoints are absent by construction', () => {
    const endpoints = Object.values(
      JSON.parse(read('scripts/edge-endpoints.json')),
    ) as Array<{ name: string; security?: string[] }>;
    const otherScheme = endpoints.filter(
      (e) => Array.isArray(e.security) && e.security.length > 0 && !e.security.includes('supabaseJwt'),
    );
    expect(otherScheme.length).toBeGreaterThan(20);
    for (const e of otherScheme) {
      expect(names.has(e.name), `${e.name} reached the agent catalogue without a user-JWT scheme`).toBe(false);
    }
  });
});

describe('nothing joins the agent\'s reach unclassified', () => {
  it('every classified endpoint still exists', () => {
    // A rename would otherwise turn a gate into a no-op silently: platformApiAccess() would stop
    // matching and the endpoint would become freely callable under its new name.
    for (const name of classifiedEndpointNames()) {
      expect(names.has(name), `${name} is classified but is no longer a user-callable endpoint`).toBe(true);
    }
  });

  it('every blocked and confirmed endpoint carries a stated reason', () => {
    for (const e of [...PLATFORM_API_BLOCKED, ...PLATFORM_API_CONFIRM]) {
      expect(e.reason.trim().length, `${e.name} has no reason`).toBeGreaterThan(20);
    }
  });

  it('an endpoint is blocked or confirmed, never both', () => {
    const blocked = new Set(PLATFORM_API_BLOCKED.map((e) => e.name));
    const overlap = PLATFORM_API_CONFIRM.filter((e) => blocked.has(e.name)).map((e) => e.name);
    expect(overlap).toEqual([]);
  });

  it('the agent runtime itself is not callable', () => {
    expect(platformApiAccess('agent-chat').access).toBe('blocked');
  });

  it('the jobs that drain a human queue are not callable', () => {
    // Anti-regression rule 6: the platform holds real un-actioned business data waiting on a
    // person, and these are the endpoints that would action it in bulk.
    for (const name of ['finance-inbound-sync', 'data-integrity-runner', 'xml-import-orchestrator']) {
      expect(platformApiAccess(name).access, `${name} should never be agent-callable`).toBe('blocked');
    }
  });

  it('money, filings and anything reaching a third party stop for approval', () => {
    for (const name of [
      'finance-issue-invoice', 'finance-send-payment', 'finance-mydata-book',
      'email-api', 'messaging-api', 'send-quote-email', 'hr-api',
    ]) {
      expect(platformApiAccess(name).access, `${name} should need approval`).toBe('confirm');
    }
  });

  it('an action DISPATCHER is not classified as if it were one action', () => {
    // A proxy over another backend's action vocabulary cannot be judged by one verdict here, so
    // blocking named bulk endpoints one at a time while leaving the dispatcher open is a gate
    // with a door beside it.
    expect(platformApiAccess('mivaa-gateway').access).toBe('blocked');
  });

  it('the thing that RUNS the fanout is gated, not only the messenger', () => {
    // notification-dispatcher is blocked; flow-engine executes the automations that send the
    // same emails and messages. Gating one and not the other gates nothing.
    expect(platformApiAccess('notification-dispatcher').access).toBe('blocked');
    expect(platformApiAccess('flow-engine').access).not.toBe('open');
  });

  it('an ordinary read is open — the deny list is the exception, not the rule', () => {
    // If this inverts, the tool has quietly become the hand-written allowlist it replaced.
    const open = catalog.filter((e) => platformApiAccess(e.name).access === 'open');
    expect(open.length).toBeGreaterThan(catalog.length / 2);
  });
});

describe('the call acts as the user, and says so when it cannot', () => {
  it('sends the user JWT, never the service role', () => {
    expect(src).toMatch(/Authorization: `Bearer \$\{jwt\}`/);
    expect(src, 'a service-role key appears in the call path').not.toContain('SERVICE_ROLE');
  });

  it('fails closed with no session', () => {
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    const jwtGuard = call.indexOf('if (!jwt)');
    const fetchAt = call.indexOf('await fetch(');
    expect(jwtGuard).toBeGreaterThan(-1);
    expect(jwtGuard, 'the session check runs after the call').toBeLessThan(fetchAt);
  });

  it('a 403 is reported as the user lacking the right, not retried elsewhere', () => {
    expect(src).toMatch(/resp\.status === 401 \|\| resp\.status === 403/);
    expect(src).toContain('do not try another endpoint');
  });

  it('reads the runtime URL lazily, never at module load', () => {
    // The bootstrap populates env at HANDLER entry; a module-load capture is `undefined`, and
    // the call then fails against "undefined/functions/v1/…" reported as a network error.
    expect(src, 'SUPABASE_URL is captured at module load')
      .not.toMatch(/const\s+SUPABASE_URL\s*=\s*Deno\.env\.get/);
    expect(src).toMatch(/const supabaseUrl = \(\) => Deno\.env\.get/);
  });

  it('a GET carries its parameters in the query string, not a dropped body', () => {
    // fetch discards a GET body. Without this the user approves a card showing a date range and
    // the endpoint answers for its default — approved one thing, ran another.
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    expect(call).toContain('URLSearchParams');
    expect(call).toMatch(/\$\{search \? `\?\$\{search\}` : ''\}/);
  });

  it('the body limit is measured in BYTES', () => {
    // `.length` is UTF-16 units, so a Greek body passes at roughly twice the stated limit.
    expect(src).toContain('new TextEncoder().encode(s).length');
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    expect(call).toMatch(/byteLength\(serialized\)/);
    expect(call, 'the cap still compares a string length').not.toMatch(/serialized\.length > MAX_BODY_BYTES/);
  });

  it('a large result is capped AND says it was capped', () => {
    // Silently truncating hands the model a list it believes is complete — "you have 3 suppliers"
    // built from the first 3 of 300.
    expect(src).toContain('MAX_RESULT_CHARS');
    const cap = src.slice(src.indexOf('function capResult'));
    expect(cap.slice(0, 600)).toMatch(/truncated:/);
    expect(cap).toContain('Do not report this as the complete answer');
  });

  it('a timeout says the write may have happened', () => {
    // A timed-out write and a refused one want opposite next moves, and only one of them is safe
    // to repeat (anti-regression rule 4).
    const timeout = src.slice(src.indexOf('const aborted'));
    expect(timeout).toContain('It may still have run');
  });
});

describe('the approval gate comes before the side effect', () => {
  it('emits the card and RETURNS before fetching', () => {
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    const gate = call.indexOf("access.access === 'confirm' && confirm !== true");
    const chunk = call.indexOf("type: 'action_confirmation'");
    const fetchAt = call.indexOf('await fetch(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(chunk);
    expect(chunk, 'the call is made before the user is asked').toBeLessThan(fetchAt);
    expect(call.slice(gate, fetchAt)).toContain('awaiting_confirmation: true');
  });

  it('a blocked endpoint is refused before the gate and before the call', () => {
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    const blocked = call.indexOf("access.access === 'blocked'");
    expect(blocked).toBeGreaterThan(-1);
    expect(blocked).toBeLessThan(call.indexOf("access.access === 'confirm'"));
    expect(blocked).toBeLessThan(call.indexOf('await fetch('));
  });

  it('the endpoint name is checked against the catalogue, not passed through', () => {
    // Without this the model could name any path under /functions/v1/ — including the ones the
    // security scheme was supposed to keep out.
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    const known = call.indexOf('PLATFORM_API_CATALOG.find');
    expect(known).toBeGreaterThan(-1);
    expect(known).toBeLessThan(call.indexOf('await fetch('));
  });

  it('the method must be one the endpoint declares', () => {
    const call = src.slice(src.indexOf('createCallPlatformApiTool'));
    expect(call).toContain('known.methods.includes(verb)');
  });

  it('confirm is declared for the Approve card and pinned by no quick-start', () => {
    expect(src).toMatch(/confirm:\s*z\.boolean\(\)/);
    const catalogSrc = code('src/components/features/ai/agentToolsCatalog.ts');
    const at = catalogSrc.indexOf("id: 'platform-api'");
    expect(at).toBeGreaterThan(-1);
    const cluster = catalogSrc.slice(at, catalogSrc.indexOf("id: 'core'", at));
    expect(cluster).not.toContain('confirm');
    // …and the direct-run quick-start must only ever DISCOVER, never call.
    expect(cluster).toContain("run: { tool: 'discover_platform_api' }");
    expect(cluster).not.toContain("run: { tool: 'call_platform_api'");
  });
});

describe('the fallback is reachable and renders', () => {
  it('both tools are bound and listed by agents', () => {
    const chat = code('supabase/functions/agent-chat/index.ts');
    for (const t of ['discover_platform_api', 'call_platform_api']) {
      expect(chat).toContain(`config.tools.includes('${t}')`);
      expect(chat).toContain(`'${t}'`);
    }
  });

  it('discovery emits a chunk even when nothing matches', () => {
    // A direct-run quick-start has no model turn behind it, so an unemitted result is the
    // quick-start's "done" copy over an empty screen — and "nothing matches" is itself the answer.
    const discover = src.slice(src.indexOf('createDiscoverPlatformApiTool'), src.indexOf('createCallPlatformApiTool'));
    const emit = discover.indexOf("type: 'platform_api_matches'");
    const emptyBranch = discover.indexOf('matches.length === 0');
    expect(emit).toBeGreaterThan(-1);
    expect(emit, 'the chunk is emitted only on the non-empty path').toBeLessThan(emptyBranch);
  });

  it('both chunk types are registered for render', () => {
    const hub = code('src/components/features/ai/AgentHub.tsx');
    for (const chunk of ['platform_api_matches', 'platform_api_result']) {
      expect(src, `${chunk} is asserted but nothing emits it`).toContain(`type: '${chunk}'`);
      expect(hub, `${chunk} has no AGENT_RESULT_TITLES entry`).toContain(`${chunk}:`);
    }
  });

  it('an area the model paraphrases narrows, it never empties', () => {
    // "Invoicing" for the real tag "Finance" would otherwise empty the pool, and the empty
    // branch tells the model to say the capability does not exist — a confident wrong answer,
    // which is the exact failure this tool exists to remove.
    const discover = src.slice(src.indexOf('createDiscoverPlatformApiTool'), src.indexOf('createCallPlatformApiTool'));
    expect(discover).toMatch(/return scoped\.length \? scoped : all/);
  });

  it('the not-found note never prints an undefined query', () => {
    const discover = src.slice(src.indexOf('createDiscoverPlatformApiTool'), src.indexOf('createCallPlatformApiTool'));
    expect(discover, 'the raw query is interpolated even when only an area was given')
      .not.toMatch(/matches "\$\{query\}"/);
    expect(discover).toMatch(/const asked =/);
  });

  it('a blocked endpoint is still shown by discovery, with its reason', () => {
    // Hiding it makes the model guess a neighbour and fail differently; naming it lets the agent
    // tell the user why not.
    const discover = src.slice(src.indexOf('createDiscoverPlatformApiTool'), src.indexOf('createCallPlatformApiTool'));
    expect(discover).toContain('platformApiAccess(e.name)');
    expect(src).toMatch(/unavailable:/);
    expect(src).toMatch(/needs_approval:/);
  });
});
