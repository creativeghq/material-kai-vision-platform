/**
 * The bell's read-time repair of `action_url`.
 *
 * `user_notifications.action_url` is a free string written by four runtimes that cannot see the
 * router, and rows outlive every one of them. The bell used to call `navigate(n.action_url)`, and
 * `navigate()` reads ANY string as a PATH — so `https://app.materialshub.gr/agent-hub?…`, which is
 * what MIVAA stamped on every job-research digest, became the path
 * `/https://app.materialshub.gr/agent-hub` and landed on the 404 catch-all.
 *
 * Producers are fixed and guarded separately (deepLinkTargets.test.ts). This covers the half a
 * producer fix cannot reach: what the bell does with the rows already in the table.
 */
import { describe, it, expect } from 'vitest';
import { resolveNotificationTarget } from '../../src/utils/notificationLink';

const ORIGINS = ['https://app.materialshub.gr', 'http://localhost:8080'];

describe('resolveNotificationTarget', () => {
  it('routes an app-relative path unchanged', () => {
    expect(resolveNotificationTarget('/inbox?thread=abc', ORIGINS))
      .toEqual({ kind: 'route', to: '/inbox?thread=abc' });
  });

  it('routes an absolute URL on one of our own origins — the job-digest 404', () => {
    expect(resolveNotificationTarget(
      'https://app.materialshub.gr/agent-hub?agent=kai&conversation=c1', ORIGINS,
    )).toEqual({ kind: 'route', to: '/agent-hub?agent=kai&conversation=c1' });
  });

  it('keeps the query AND the hash when stripping the origin', () => {
    expect(resolveNotificationTarget('https://app.materialshub.gr/docs?doc=7#section', ORIGINS))
      .toEqual({ kind: 'route', to: '/docs?doc=7#section' });
  });

  it('opens a genuinely external URL instead of routing to it', () => {
    // The moodboard dormancy warning points at an edge-function endpoint, not a route here.
    const t = resolveNotificationTarget(
      'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/moodboard-keep-active?token=t1', ORIGINS,
    );
    expect(t.kind).toBe('external');
  });

  it('treats a protocol-relative URL as external, never as a path', () => {
    // `navigate('//evil.example/x')` would read `evil.example` as the first path segment.
    expect(resolveNotificationTarget('//evil.example/x', ORIGINS).kind).toBe('external');
  });

  it('refuses a non-http scheme — a click handler never dereferences javascript:', () => {
    expect(resolveNotificationTarget('javascript:alert(1)', ORIGINS)).toEqual({ kind: 'none' });
    expect(resolveNotificationTarget('data:text/html,<b>x', ORIGINS)).toEqual({ kind: 'none' });
  });

  it('has no destination for an empty or absent action_url', () => {
    expect(resolveNotificationTarget(null, ORIGINS)).toEqual({ kind: 'none' });
    expect(resolveNotificationTarget('   ', ORIGINS)).toEqual({ kind: 'none' });
  });

  it('resolves against the first origin when the app is served somewhere else', () => {
    // A row stamped with PUBLIC_APP_URL, read from a preview deployment: still ours, still a route.
    expect(resolveNotificationTarget('https://app.materialshub.gr/finance', ['http://localhost:8080', 'https://app.materialshub.gr']))
      .toEqual({ kind: 'route', to: '/finance' });
  });
});
