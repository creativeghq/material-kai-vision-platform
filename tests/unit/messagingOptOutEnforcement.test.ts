/**
 * A WhatsApp send checks the opt-out list and the 24-hour window (#359 CM-1 / CM-2 / CM-5).
 *
 * `messaging-api` contained zero occurrences of `optout`, `opt_out`, `opted`, `suppress` or
 * `unsubscrib`. The module ships a 330-line opt-outs tab to collect them and
 * `zernio-webhook-handler` records every STOP keyword the customer sends — and the direct send
 * path never looked at either. Only the campaign cron did, and it compared raw strings.
 *
 * WhatsApp opt-out is stricter than email: it is a legal requirement AND a Meta platform-policy
 * one, and repeated violations degrade the number's quality rating up to a ban.
 *
 * Underneath it was a shape problem. FOUR phone normalizers with three behaviours:
 *
 *   • `messaging-api` prefixed a bare `+`, so `0030691…` became `+0030691…`
 *   • the two frontend copies defaulted to country code **+1**, so a Greek mobile typed as
 *     `6912345678` became `+16912345678` — a real US number, billed, in violation, and it looks
 *     exactly like a clean send
 *   • the webhook stored whatever the provider sent
 *
 * An opt-out written in one shape and checked in another is a guard that cannot see. It never
 * matches, nothing raises, and the message goes out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { normalizeToE164, msisdnKey } from '../../src/modules/messaging/phoneNumber';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const api = read('supabase/functions/messaging-api/index.ts');
const processor = read('supabase/functions/messaging-processor/index.ts');
const webhook = read('supabase/functions/zernio-webhook-handler/index.ts');
const service = read('src/modules/messaging/services/messagingService.ts');
const campaignService = read('src/modules/messaging/services/messagingCampaignService.ts');

describe('#359 CM-1 — one normalizer, and it refuses to guess', () => {
  it('accepts both international spellings and produces the same answer', () => {
    expect(normalizeToE164('+30 691 234 5678')).toBe('+306912345678');
    expect(normalizeToE164('00306912345678')).toBe('+306912345678');
    expect(normalizeToE164('+30-691-234-5678')).toBe('+306912345678');
  });

  it('REFUSES a bare local number instead of inventing a country', () => {
    // This is the whole defect. `6912345678` under the old `+1` default became `+16912345678`:
    // a real US number, a paid message to a stranger, and a Meta violation.
    expect(normalizeToE164('6912345678')).toBeNull();
    expect(normalizeToE164('069 1234 5678')).toBeNull();
  });

  it('refuses lengths and shapes that are not phone numbers', () => {
    for (const bad of ['', '   ', '+123', '+1234567890123456', 'not a phone', null, undefined]) {
      expect(normalizeToE164(bad as string), String(bad)).toBeNull();
    }
    // A country code never starts with 0 — `+0030…` was what the old edge normalizer produced.
    expect(normalizeToE164('+00306912345678')).toBeNull();
  });

  it('the comparison key is the digits, matching SQL normalize_msisdn', () => {
    expect(msisdnKey('+30 691 234 5678')).toBe('306912345678');
    expect(msisdnKey('00306912345678')).toBe('306912345678');
    expect(msisdnKey('6912345678')).toBeNull();
  });

  it('the two frontend copies are gone, not merely edited', () => {
    // `defaultCountryCode = '+1'` in a Greek platform, written twice.
    expect(service, 'a private normalizer came back').not.toMatch(/defaultCountryCode/);
    expect(campaignService, 'a private normalizer came back').not.toMatch(/defaultCountryCode/);
    expect(campaignService).toMatch(/normalizeToE164\(phoneNumber\)/);
  });
});

describe('#359 CM-1 — the send path asks', () => {
  it('the direct send refuses an opted-out number', () => {
    expect(api).toMatch(/messaging_number_is_opted_out/);
    expect(api).toMatch(/async function whyNotSendable/);
  });

  it('the check runs BEFORE the credit debit and before the provider call', () => {
    // Charging for a message that must not go out, then refunding it, is a worse shape than not
    // charging: the refund is the step that gets skipped when something else fails first.
    const send = api.slice(api.indexOf("case 'send':"), api.indexOf("case 'send-bulk':"));
    const guard = send.indexOf('whyNotSendable');
    const debit = send.indexOf('debitExternalServiceCredits');
    const provider = send.indexOf('sendWhatsAppMessage');
    expect(guard).toBeGreaterThan(-1);
    expect(guard < debit, 'the recipient is charged before the compliance check').toBe(true);
    expect(guard < provider, 'the message is sent before the compliance check').toBe(true);
  });

  it('the bulk send asks per recipient, not once per run', () => {
    // A STOP that arrives mid-run has to stop the rest of it, and a bulk run is where one breach
    // becomes many — Meta rates the NUMBER, not the message.
    const bulk = api.slice(api.indexOf("case 'send-bulk':"), api.indexOf("case 'connect-whatsapp':"));
    expect(bulk).toMatch(/whyNotSendable/);
    const guard = bulk.indexOf('whyNotSendable');
    const debit = bulk.indexOf('debitExternalServiceCredits');
    expect(guard < debit).toBe(true);
  });

  it('an unusable number is refused rather than sent to whoever it resolves to', () => {
    expect(api).toMatch(/function toE164/);
    expect(api).toMatch(/international form/);
    expect(api, 'the old prefix-a-plus normalizer is back').not.toMatch(/function normalizePhoneNumber/);
  });

  it('a failed check blocks the send — it does not fall through', () => {
    const fn = api.slice(api.indexOf('async function whyNotSendable'), api.indexOf("case 'send':"));
    expect(fn).toMatch(/if \(optErr\) return/);
    expect(fn).toMatch(/if \(winErr\) return/);
  });
});

describe('#359 CM-2 — the 24-hour window is computed, not commented', () => {
  it('a freeform send is bounded by the window', () => {
    const fn = api.slice(api.indexOf('async function whyNotSendable'), api.indexOf("case 'send':"));
    expect(fn).toMatch(/whatsapp_service_window_open/);
    expect(fn).toMatch(/Outside the 24-hour window/);
  });

  it('a template is NOT bounded by it — that is what templates are for', () => {
    const fn = api.slice(api.indexOf('async function whyNotSendable'), api.indexOf("case 'send':"));
    const templateShortCircuit = fn.indexOf('if (opts.isTemplate) return null;');
    const windowCheck = fn.indexOf('whatsapp_service_window_open');
    expect(templateShortCircuit).toBeGreaterThan(-1);
    expect(templateShortCircuit < windowCheck, 'templates are being blocked outside the window').toBe(true);
  });

  it('the opt-out check is NOT short-circuited by the template branch', () => {
    // An approved template does not buy consent. This ordering is the whole point: opt-out first,
    // window second, and only the second one exempts templates.
    const fn = api.slice(api.indexOf('async function whyNotSendable'), api.indexOf("case 'send':"));
    const optout = fn.indexOf('messaging_number_is_opted_out');
    const templateShortCircuit = fn.indexOf('if (opts.isTemplate) return null;');
    expect(optout < templateShortCircuit, 'a template skips the opt-out check').toBe(true);
  });
});

describe('#359 CM-1 — the campaign cron and the webhook agree with the send path', () => {
  it('the cron asks the same SQL verdict, per recipient', () => {
    expect(processor).toMatch(/messaging_number_is_opted_out/);
    // Prefetching a Set once per campaign cannot see a STOP that arrives mid-run.
    expect(processor, 'the prefetched Set is back').not.toMatch(/const optedOut = new Set/);
  });

  it('a failed check re-queues rather than sending or failing the recipient', () => {
    expect(processor).toMatch(/if \(optErr\)[\s\S]{0,300}status: 'pending'/);
  });

  it('the webhook records STOP against the business it was said to', () => {
    expect(webhook).toMatch(/messaging_record_optout/);
    expect(webhook).toMatch(/p_workspace_id: optoutWs \?\? null/);
  });

  it('START lifts only that business opt-out', () => {
    // A raw delete on (phone, channel) would clear every other shop's suppression, and a
    // platform-wide one somebody set deliberately.
    expect(webhook).toMatch(/messaging_clear_optout/);
    expect(webhook, 'the unscoped delete is back').not.toMatch(
      /from\('messaging_optouts'\)\s*\.delete\(\)/,
    );
  });

  it('a STOP that fails to record is logged loudly', () => {
    // The alternative is carrying on messaging somebody who said stop, silently.
    expect(webhook).toMatch(/STOP received but the opt-out was NOT recorded/);
  });
});

describe('#359 CM-1 — the compliance screen can see its own table', () => {
  it('checkOptOut asks the SQL verdict instead of building a filter', () => {
    // The old filter was `.or('phone_number.eq.X, channel_type.eq.whatsapp, channel_type.eq.all')`
    // — three OR'd conditions, so ANY whatsapp opt-out anywhere satisfied it whatever number was
    // asked about. The phone was also interpolated into a PostgREST filter unescaped.
    expect(service).toMatch(/rpc\('messaging_number_is_opted_out'/);
    expect(service, 'the OR-filter is back').not.toMatch(/phone_number\.eq\.\$\{/);
  });

  it('it throws on error rather than answering "go ahead"', () => {
    const fn = service.slice(service.indexOf('async checkOptOut'), service.indexOf('async addOptOut'));
    expect(fn).toMatch(/if \(error\) throw/);
    expect(fn, 'a failed check returns false again').not.toMatch(/return false;/);
  });

  it('reads and writes are workspace-scoped', () => {
    expect(service).toMatch(/async getOptOuts\(workspaceId: string/);
    expect(service).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(service).toMatch(/rpc\('messaging_record_optout'/);
    expect(service).toMatch(/rpc\('messaging_clear_optout'/);
  });
});

describe('#359 CM-5 — a bulk run reports what actually happened', () => {
  it('success is no longer hardcoded true', () => {
    const bulk = api.slice(api.indexOf("case 'send-bulk':"), api.indexOf("case 'connect-whatsapp':"));
    expect(bulk, 'success: true is hardcoded again').not.toMatch(/success: true, sent,/);
    expect(bulk).toMatch(/success: failed === 0 && untouched === 0/);
  });

  it('recipients the run never reached are counted separately from failures', () => {
    // The credits `break` leaves recipients untouched. They are still sendable, so retrying them
    // is safe — retrying a failure may not be, and collapsing the two loses that.
    const bulk = api.slice(api.indexOf("case 'send-bulk':"), api.indexOf("case 'connect-whatsapp':"));
    expect(bulk).toMatch(/not_attempted: untouched/);
  });
});
