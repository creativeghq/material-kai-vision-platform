/**
 * A post that reached 3 of 4 networks does not look like one that reached 4 (#384 A).
 *
 * We subscribed to `post.platform.published` and `post.platform.failed`, Zernio delivered them,
 * the dispatcher had no branch, and it answered 200 and binned them. The aggregate events that DO
 * have branches cannot substitute: `post.partial` sets the status to `published` and records
 * `firstPlatformError` — whichever error happens to come first — so the failing network was never
 * named anywhere, and the post read as fully published.
 *
 * Both halves are needed and each is silent alone. Recording the leg with nothing rendering it
 * moves the silence one table over; rendering with nothing recorded shows an empty list that
 * looks like "all fine".
 */
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
    expect(panel).toMatch(/\{platformLabel\(leg\.platform\)\} failed/);
    // Read from the leg record, not inferred from the aggregate status — which says `published`
    // for exactly the case this exists to show.
    expect(panel).toMatch(/leg\?\.status === 'failed'/);
  });
});
