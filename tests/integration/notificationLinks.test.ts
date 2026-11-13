import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

import { hasCreds, serviceClient } from './_harness';
import { strippedSource } from '../helpers/sourceIndex';
import { PAGE_FOR, routeExists, tabsFor } from '../helpers/routeTargets';

const STORED_ALIASES: Record<string, string[]> = {
  '/profile': ['appointments', 'calendar', 'inbox'],
  '/admin/operations': ['catalog', 'catalogs', 'factory-onboarding', 'system-health', 'search-analytics', 'services-billing', 'platform-overview', 'push'],
};

const NO_FLOW_BY_DESIGN: Record<string, string> = {
  price_alert_triggered: 'MIVAA writes the bell itself; this only feeds tenant automations',
  mention_alert_triggered: 'MIVAA writes the bell itself; this only feeds tenant automations',
  job_alert_triggered: 'MIVAA writes the bell itself; this only feeds tenant automations',
  email_opened: 'one per recipient with no bell recipient; a default would ring on every open',
  email_clicked: 'one per recipient with no bell recipient; a default would ring on every click',
};

interface Target { kind: 'fn_url' | 'row_url' | 'fn_event'; source: string; value: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

function brokenLink(url: string): string | null {
  const [rawPath, query = ''] = url.split('?');
  const concatenated = rawPath.endsWith('/');
  const path = concatenated ? `${rawPath}:id` : rawPath;
  if (!routeExists(path)) return 'no route';
  const tab = query.match(/(?:^|&)tab=([A-Za-z0-9_-]+)/)?.[1];
  const page = PAGE_FOR.get(path);
  if (tab && page && !tabsFor(page).has(tab) && !STORED_ALIASES[path]?.includes(tab)) return `no tab ${tab}`;
  return null;
}

const balancedArgs = (src: string, open: number): string => {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')' && --depth === 0) return src.slice(open, j + 1);
  }
  return '';
};

function emittedNotificationEvents(): Map<string, string> {
  const out = new Map<string, string>();
  const emit = /(?:emitFlowEventToWorkspaceRoles|flowEventService\.emitToWorkspaceRoles|emitFlowEvent|flowEventService\.emit)\(/g;
  for (const root of ['src', 'supabase/functions']) {
    for (const file of walk(join(process.cwd(), root))) {
      const rel = relative(process.cwd(), file).split('\\').join('/');
      if (rel.endsWith('_shared/flow-events.ts') || rel.includes('flowEventService')) continue;
      const src = strippedSource(file);
      for (const m of src.matchAll(emit)) {
        const args = balancedArgs(src, m.index! + m[0].length - 1);
        if (!/\btitle\s*:/.test(args) || !/\bbody\s*:/.test(args)) continue;
        const beforePayload = args.slice(0, args.search(/\{|=>/)).replace(/\[[^\]]*\]/g, '');
        for (const ev of beforePayload.matchAll(/['"`]([a-zA-Z_.]+)['"`]/g)) out.set(ev[1], rel);
      }
    }
  }
  return out;
}

describe.skipIf(!hasCreds)('notification links in the live database', () => {
  const load = async (): Promise<Target[]> => {
    const { data, error } = await serviceClient().rpc('lint_notification_targets');
    expect(error).toBeNull();
    return (data ?? []) as Target[];
  };

  it('every URL a SQL function writes lands on a route and a tab that renders', async () => {
    const rows = (await load()).filter((r) => r.kind === 'fn_url');
    expect(rows.length, 'no SQL notification links found — the lint stopped seeing them').toBeGreaterThan(10);
    const broken = rows.flatMap((r) => {
      const why = brokenLink(r.value);
      return why ? [`${r.value} — ${why} (${r.source})`] : [];
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('every link delivered in the last 30 days lands on a route and a tab that renders', async () => {
    const rows = (await load()).filter((r) => r.kind === 'row_url');
    const broken = rows.flatMap((r) => {
      const why = brokenLink(r.value);
      return why ? [`${r.value} — ${why} (${r.source} rows)`] : [];
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('every event that asks for a notification has an active flow to deliver it', async () => {
    const { data, error } = await serviceClient().from('flows').select('trigger_type').eq('status', 'active');
    expect(error).toBeNull();
    const listening = new Set((data ?? []).map((f: { trigger_type: string }) => f.trigger_type));
    expect(listening.size).toBeGreaterThan(50);

    const emitted = emittedNotificationEvents();
    expect(emitted.size, 'no notification-shaped emits found — the call shape changed').toBeGreaterThan(30);
    for (const r of (await load()).filter((t) => t.kind === 'fn_event')) emitted.set(r.value, `SQL ${r.source}`);

    const orphans = [...emitted]
      .filter(([event]) => !listening.has(event) && !NO_FLOW_BY_DESIGN[event])
      .map(([event, where]) => `${event} — ${where}`);
    expect(orphans, `these events ring nobody:\n${orphans.join('\n')}`).toEqual([]);
  });
});
