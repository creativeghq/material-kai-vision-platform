/** A post that reached 3 of 4 networks does not look like one that reached 4 (#384 A). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const EVENTS = 'supabase/functions/_shared/zernio.ts';
const HANDLER = 'supabase/functions/zernio-webhook-handler/index.ts';
const PANEL = 'src/modules/social-media/components/SocialAnalyticsPanel.tsx';

describe('#384 A — every event we ask for has somewhere to go', () => {
  it('the dispatcher branches on both per-platform events', () => {
    const handler = src(HANDLER);
    expect(handler).toMatch(/event === 'post\.platform\.published' \|\| event === 'post\.platform\.failed'/);
  });

  it('no subscribed post event is left without a branch', () => {
    // The general rule, checked rather than the two names: subscribing is what makes Zernio
    // deliver, so an event in the list with no branch is a payload we ask for and discard.
    const events = src(EVENTS);
    const list = events.slice(events.indexOf('ZERNIO_WEBHOOK_EVENTS = ['));
    const subscribed = [...list.slice(0, list.indexOf(']')).matchAll(/'(post\.[a-z.]+)'/g)].map((m) => m[1]);
    expect(subscribed.length).toBeGreaterThanOrEqual(7);

    const handler = src(HANDLER);
    const unhandled = subscribed.filter((e) => !handler.includes(`'${e}'`));
    expect(unhandled,
      `These post events are subscribed and the dispatcher never names them, so Zernio delivers `
      + `them and we answer 200 and bin them:\n${unhandled.join('\n')}`,
    ).toEqual([]);
  });

  it('a published leg keeps its public link, read from the field the spec names', () => {
    expect(src(HANDLER)).toMatch(/platform\?\.publishedUrl/);
  });

  it('the leg is keyed by platform, not appended to a list', () => {
    // The same leg can report twice (a retry, a redelivery). A list would show one network as two
    // outcomes with no way to tell which is current.
    const handler = src(HANDLER);
    const fn = handler.slice(handler.indexOf('async function recordPlatformLeg'));
    expect(fn.slice(0, 1800)).toMatch(/\[platform\]: \{/);
    expect(fn.slice(0, 1800)).toMatch(/platforms: \{[\s\S]{0,80}\.\.\.platforms,/);
  });

  it('a per-leg event never rewrites the aggregate status', () => {
    // The leg and the post are different facts, and the two arrive in no guaranteed order — a
    // leg event flipping `status` could undo the aggregate that already landed.
    const handler = src(HANDLER);
    const fn = handler.slice(handler.indexOf('async function recordPlatformLeg'),
      handler.indexOf('const accountIdOf'));
    expect(fn, 'recordPlatformLeg writes the post status').not.toMatch(/status: '(published|failed)'\s*,\s*$/m);
    expect(fn).toMatch(/metadata: \{/);
  });

  it('only a FAILED leg raises a notification', () => {
    // A bell per successful network would make a four-platform post ring five times, counting the
    // aggregate. The failure is the part nobody would otherwise learn.
    const handler = src(HANDLER);
    const branch = handler.slice(handler.indexOf("event === 'post.platform.published'"));
    const body = branch.slice(0, branch.indexOf("if (event === 'post.published'"));
    expect(body).toMatch(/if \(failed && sp\)/);
  });

  it('the panel names the network that failed', () => {
    // Recording it with nothing rendering it just moves the silence.
    const panel = src(PANEL);
    expect(panel).toMatch(/const failedLegs =/);
    expect(panel).toMatch(/\{platformLabel\(leg\.platform\)\} \{leg\.deleted \? 'deleted' : 'failed'\}/);
    // Read from the leg record, not inferred from the aggregate status — which says `published`
    // for exactly the case this exists to show.
    expect(panel).toMatch(/leg\?\.status === 'failed'/);
  });
});

describe('#384 B — leads, calls and referrals are subscribed and land somewhere a person sees', () => {
  const events = src(EVENTS);
  const list = events.slice(events.indexOf('ZERNIO_WEBHOOK_EVENTS = ['), events.indexOf('] as const'));
  const handler = src(HANDLER);

  it.each(['lead.received', 'call.ended', 'call.failed', 'call.permission_request', 'referral.received',
    'post.platform.deleted', 'post.tiktok.url_resolved'])('%s is subscribed and dispatched', (event) => {
    expect(list).toContain(`'${event}'`);
    expect(handler).toContain(`event === '${event}'`);
  });

  it('webhook.test is answered but never subscribed: Zernio rejects the whole settings PUT when it is listed', () => {
    expect(list).not.toContain("'webhook.test'");
    expect(handler).toContain("event === 'webhook.test'");
  });

  it('a lead becomes an Inbox thread holding the answers, de-duplicated by its lead id, never a silent CRM row', () => {
    const fn = handler.slice(handler.indexOf('async function handleLeadReceived('));
    const body = fn.slice(0, fn.indexOf('\nasync function ') > 0 ? fn.indexOf('\nasync function ') : 4000);
    expect(body).toContain('findOrCreateSocialThread(');
    expect(body).toContain("social_kind: 'lead'");
    expect(body).toContain(".eq('metadata->>leadgen_id', leadgenId)");
    expect(body).not.toMatch(/from\('crm_contacts'\)\.insert/);
  });

  it('a lead is customer content, so a transient fault asks Zernio to resend it', () => {
    expect(handler).toMatch(/\|\| event === 'review\.new' \|\| event === 'review\.updated' \|\| event === 'lead\.received'\)/);
  });

  it('a lead thread cannot be replied into, on the server as well as in the composer', () => {
    const api = src('supabase/functions/inbox-api/index.ts');
    expect(api).toMatch(/meta\.social_kind === 'lead' && messageType !== 'note'/);
    expect((api.match(/assertReplyable\(thread, /g) ?? []).length).toBe(2);
    expect(src('src/pages/Inbox/components/InboxComposer.tsx')).toMatch(/!leadBlocked && hasContent/);
  });
});
