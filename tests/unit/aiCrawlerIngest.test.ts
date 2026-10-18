import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AI_REFERRAL_SOURCE_REGEX, ipInCidr, parseIngestBody, signIngestBody, verifyCrawlerIp, verifyIngestSignature,
} from '../../supabase/functions/_shared/ai-crawler';
import { FORWARD_UA_PATTERN, ingestUrl, workerScript } from '../../src/components/core/Profile/seo/aiCrawlers';
import { stripComments } from '../helpers/stripComments';

const SECRET = 'kcw_' + 'a'.repeat(48);
const NOW = 1_800_000_000;

describe('crawler ingest signature (#487 B1, invariant 6)', () => {
  it('accepts its own signature inside the window', async () => {
    const body = '{"events":[]}';
    const sig = await signIngestBody(SECRET, String(NOW), body);
    expect(await verifyIngestSignature(SECRET, String(NOW), sig, body, NOW + 299)).toBe(true);
  });

  it('fails closed: wrong secret, edited body, stale or missing timestamp, no secret', async () => {
    const body = '{"events":[]}';
    const sig = await signIngestBody(SECRET, String(NOW), body);
    expect(await verifyIngestSignature('kcw_other' + 'b'.repeat(40), String(NOW), sig, body, NOW)).toBe(false);
    expect(await verifyIngestSignature(SECRET, String(NOW), sig, body + ' ', NOW)).toBe(false);
    expect(await verifyIngestSignature(SECRET, String(NOW), sig, body, NOW + 301)).toBe(false);
    expect(await verifyIngestSignature(SECRET, null, sig, body, NOW)).toBe(false);
    expect(await verifyIngestSignature(null, String(NOW), sig, body, NOW)).toBe(false);
    expect(await verifyIngestSignature(SECRET, String(NOW), null, body, NOW)).toBe(false);
  });

  it('the function checks the signature before it parses the body', () => {
    const src = stripComments(readFileSync('supabase/functions/ai-crawler-ingest/index.ts', 'utf8'));
    const verify = src.indexOf('verifyIngestSignature(');
    const parse = src.indexOf('JSON.parse(');
    expect(verify).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(verify);
  });
});

describe('ingest payload', () => {
  it('keeps well-formed events and drops the rest, never repairing them', () => {
    const rows = parseIngestBody({
      events: [
        { ts: '2026-10-17T10:00:00Z', path: '/a', ua: 'GPTBot/1.2', ip: '20.171.1.1', status: 200 },
        { ts: 'not a date', path: '/b', ua: 'GPTBot' },
        { ts: '2026-10-17T10:00:00Z', ua: 'GPTBot' },
        { ts: '2026-10-17T10:00:00Z', path: '/c', ua: 'ClaudeBot', ip: '1.2.3.4; drop', status: 999 },
        'junk',
      ],
    });
    expect(rows).toEqual([
      { ts: '2026-10-17T10:00:00.000Z', path: '/a', ua: 'GPTBot/1.2', ip: '20.171.1.1', status: 200 },
      { ts: '2026-10-17T10:00:00.000Z', path: '/c', ua: 'ClaudeBot', ip: null, status: null },
    ]);
  });
});

describe('vendor IP-range verification', () => {
  it('matches v4, v6 and v4-mapped v6, and never across families', () => {
    expect(ipInCidr('20.171.206.5', '20.171.206.0/24')).toBe(true);
    expect(ipInCidr('20.171.207.5', '20.171.206.0/24')).toBe(false);
    expect(ipInCidr('2a01:4f8::1', '2a01:4f8::/32')).toBe(true);
    expect(ipInCidr('2a02::1', '2a01:4f8::/32')).toBe(false);
    expect(ipInCidr('::ffff:20.171.206.5', '::ffff:20.171.206.0/120')).toBe(true);
    expect(ipInCidr('20.171.206.5', '::/0')).toBe(false);
    expect(ipInCidr('999.1.1.1', '0.0.0.0/0')).toBe(false);
  });

  const ranges = (prefixes: string[]) => (async () => new Response(JSON.stringify({ prefixes: prefixes.map((p) => ({ ipv4Prefix: p })) }))) as unknown as typeof fetch;

  it('true inside, false outside, null when the vendor publishes nothing or the list is unreachable', async () => {
    expect(await verifyCrawlerIp('Mozilla/5.0; compatible; GPTBot/1.2', '20.171.206.5', ranges(['20.171.206.0/24']))).toBe(true);
    expect(await verifyCrawlerIp('Mozilla/5.0; compatible; PerplexityBot/1.0', '8.8.8.8', ranges(['20.171.206.0/24']))).toBe(false);
    expect(await verifyCrawlerIp('ClaudeBot/1.0', '8.8.8.8', ranges(['0.0.0.0/0']))).toBeNull();
    expect(await verifyCrawlerIp('GPTBot', null, ranges(['0.0.0.0/0']))).toBeNull();
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await verifyCrawlerIp('ChatGPT-User/1.0', '1.1.1.1', down)).toBeNull();
  });
});

const SQL_BOT_UAS = [
  'OAI-SearchBot/1.0', 'ChatGPT-User/1.0', 'GPTBot/1.2', 'Claude-SearchBot/1.0', 'Claude-User/1.0', 'Claude-Web/1.0',
  'ClaudeBot/1.0', 'anthropic-ai', 'Perplexity-User/1.0', 'PerplexityBot/1.0', 'Google-CloudVertexBot',
  'Gemini-Deep-Research', 'meta-externalfetcher/1.1', 'meta-externalagent/1.1', 'FacebookBot', 'MistralAI-User/1.0',
  'DuckAssistBot/1.2', 'Amazonbot/0.1', 'Applebot/0.1', 'Bytespider', 'CCBot/2.0', 'cohere-training-data-crawler',
  'cohere-ai', 'YouBot/1.0', 'Diffbot/0.1',
];

describe('the Worker forwards everything the SQL classifier can store', () => {
  it('matches every ai_crawler_bot() needle, plus ordinary bots for the heartbeat', () => {
    const re = new RegExp(FORWARD_UA_PATTERN, 'i');
    for (const ua of [...SQL_BOT_UAS, 'Mozilla/5.0 (compatible; Googlebot/2.1)']) expect(re.test(ua), ua).toBe(true);
    expect(re.test('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0')).toBe(false);
  });

  it('signs with the headers and message shape the function verifies', () => {
    const url = ingestUrl('https://x.supabase.co/', 'dc0d71e9-bb0d-4862-80ff-f512588cf2a7');
    expect(url).toBe('https://x.supabase.co/functions/v1/ai-crawler-ingest?website=dc0d71e9-bb0d-4862-80ff-f512588cf2a7');
    const script = workerScript(url);
    expect(script).toContain(JSON.stringify(url));
    expect(script).toContain("'x-kai-timestamp': ts");
    expect(script).toContain("'x-kai-signature': sig");
    expect(script).toContain("sign(env.KAI_CRAWLER_SECRET, ts + '.' + body)");
    expect(script).toContain("hash: 'SHA-256'");
  });
});

describe('GA4 assistant pre-filter', () => {
  it('admits every referrer host ai_referral_platform() classifies', () => {
    const re = new RegExp(AI_REFERRAL_SOURCE_REGEX, 'i');
    for (const host of [
      'chatgpt.com', 'chat.openai.com', 'searchgpt.com', 'perplexity.ai', 'copilot.microsoft.com', 'edgeservices.bing.com',
      'gemini.google.com', 'bard.google.com', 'claude.ai', 'chat.deepseek.com', 'grok.com', 'x.ai', 'meta.ai',
      'chat.mistral.ai', 'you.com', 'phind.com',
    ]) expect(re.test(host), host).toBe(true);
  });
});
