import { describe, it, expect } from 'vitest';
import { htmlToText, isOwnSite, quoteIsOnPage, verifyEvidenceQuotes, type FetchedPage } from '../../supabase/functions/_shared/b2b-quote-check.ts';

describe('quoteIsOnPage', () => {
  const page = htmlToText('<html><style>.a{}</style><body><h1>About us</h1><p>We are the exclusive distributor for Greece &amp; Cyprus of several European brands.</p><script>secretToken()</script></body></html>');
  it('finds an exact quote ignoring case, punctuation and entities', () => {
    expect(quoteIsOnPage('We are the EXCLUSIVE distributor for Greece & Cyprus', page)).toBe(true);
  });
  it('accepts a quote with one altered word via six-word windows', () => {
    expect(quoteIsOnPage('We are the exclusive distributor for Greece & Cyprus of several European labels', page)).toBe(true);
  });
  it('rejects an absent or invented quote', () => {
    expect(quoteIsOnPage('Official representative of Acme for the Balkans region', page)).toBe(false);
    expect(quoteIsOnPage('', page)).toBe(false);
  });
  it('ignores script and style content', () => {
    expect(quoteIsOnPage('secretToken()', page)).toBe(false);
  });
  it('decodes numeric and named entities', () => {
    expect(htmlToText('caf&#233; &eacute;&nbsp;&#x41;')).toContain('café');
    expect(quoteIsOnPage('café A', htmlToText('<p>Caf&#233;&nbsp;A</p>'))).toBe(true);
  });
  it('handles Greek with accents and final sigma', () => {
    const p = htmlToText('<p>Είμαστε ΕΠΙΣΗΜΟΣ ΑΝΤΙΠΡΌΣΩΠΟΣ του οίκου για την Ελλάδα</p>');
    expect(quoteIsOnPage('επίσημος αντιπρόσωπος του οίκου', p)).toBe(true);
    expect(quoteIsOnPage('αποκλειστική αντιπροσωπεία του οίκου', p)).toBe(false);
  });
  it('handles Cyrillic', () => {
    const p = htmlToText('<div>Мы являемся официальным представителем завода в России</div>');
    expect(quoteIsOnPage('официальным представителем завода', p)).toBe(true);
    expect(quoteIsOnPage('эксклюзивный дистрибьютор', p)).toBe(false);
  });
  it('handles CJK without spaces', () => {
    const p = htmlToText('<p>我们是该品牌在中国大陆地区的独家代理商，负责销售与售后服务。</p>');
    expect(quoteIsOnPage('该品牌在中国大陆地区的独家代理商', p)).toBe(true);
    expect(quoteIsOnPage('我们是该品牌在日本地区的独家代理商负责销售', p)).toBe(false);
  });
});

const FILLER = ' Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'.repeat(5);
const html = (body: string, over: Partial<FetchedPage> = {}): FetchedPage => ({
  text: `<html><body><p>${body}</p><p>${FILLER}</p></body></html>`, contentType: 'text/html; charset=utf-8', truncated: false, ...over,
});
const Q = 'official representative for Greece and Cyprus';
const row = (url: string | null, q = Q, domain: string | null = 'acme.gr') => ({ company_name: 'X', domain, website: null, type_evidence: q, type_evidence_url: url });

describe('verifyEvidenceQuotes', () => {
  const run = async (rows: ReturnType<typeof row>[], pages: Record<string, FetchedPage>) => verifyEvidenceQuotes(rows, [], {
    fetchPage: async (u) => {
      if (!pages[u]) throw new Error('boom');
      return pages[u];
    },
  });
  it('verifies a present quote and demotes an absent one from a readable page', async () => {
    const out = await run(
      [row('https://acme.gr/ok'), row('https://www.acme.gr/no')],
      { 'https://acme.gr/ok': html(Q), 'https://www.acme.gr/no': html('Nothing relevant here') },
    );
    expect(out.matches.map((m) => m.evidence_verified)).toEqual([true]);
    expect(out.unverified[0]).toMatchObject({ evidence_verified: false, unverified_reason: 'quote not found on the cited page' });
  });
  it('keeps the match with null on a fetch failure or missing URL', async () => {
    const out = await run([row('https://acme.gr/dead'), row(null)], {});
    expect(out.matches.map((m) => m.evidence_verified)).toEqual([null, null]);
    expect(out.unverified).toHaveLength(0);
  });
  it.each([
    ['a near-empty page', { ...html('x'), text: '<html><body>Loading</body></html>' }],
    ['a PDF', html('Nothing relevant here', { contentType: 'application/pdf' })],
    ['a missing content type', html('Nothing relevant here', { contentType: null })],
    ['a body cut at the byte cap', html('Nothing relevant here', { truncated: true })],
  ])('does not demote on %s', async (_name, fetched) => {
    const out = await run([row('https://acme.gr/p')], { 'https://acme.gr/p': fetched });
    expect(out.unverified).toHaveLength(0);
    expect(out.matches[0].evidence_verified).toBeNull();
  });
  it('does not demote a short quote that is not an exact substring', async () => {
    const out = await run([row('https://acme.gr/p', 'sole agent greece')], { 'https://acme.gr/p': html('Nothing relevant here') });
    expect(out.unverified).toHaveLength(0);
    expect(out.matches[0].evidence_verified).toBeNull();
  });
  it('still verifies a short exact quote', async () => {
    const out = await run([row('https://acme.gr/p', 'sole agent greece')], { 'https://acme.gr/p': html('We are the Sole Agent, Greece.') });
    expect(out.matches[0].evidence_verified).toBe(true);
  });
  it('never marks true when the evidence is on another host', async () => {
    let fetched = 0;
    const out = await verifyEvidenceQuotes([row('https://directory.example/acme'), row('https://acme.gr.evil.test/x')], [], {
      fetchPage: async () => {
        fetched++;
        return html(Q);
      },
    });
    expect(fetched).toBe(0);
    expect(out.matches.map((m) => m.evidence_verified)).toEqual([null, null]);
    expect(out.matches[0]).toHaveProperty('evidence_note');
  });
  it('treats a row with no domain or website as unverifiable', async () => {
    const out = await run([row('https://acme.gr/p', Q, null)], { 'https://acme.gr/p': html(Q) });
    expect(out.matches[0].evidence_verified).toBeNull();
  });
  it('fetches each URL once and checks at most eight rows', async () => {
    let calls = 0;
    const rows = Array.from({ length: 10 }, () => row('https://acme.gr/x'));
    const out = await verifyEvidenceQuotes(rows, [], {
      fetchPage: async () => {
        calls++;
        return html(Q);
      },
    });
    expect(calls).toBe(1);
    expect(out.matches.filter((m) => m.evidence_verified === null)).toHaveLength(2);
  });
});

describe('isOwnSite', () => {
  it('accepts the host, www and subdomains, and rejects look-alikes', () => {
    const r = { domain: 'acme.gr', website: null };
    expect(isOwnSite('https://www.acme.gr/a', r)).toBe(true);
    expect(isOwnSite('https://shop.acme.gr/a', r)).toBe(true);
    expect(isOwnSite('https://notacme.gr/a', r)).toBe(false);
    expect(isOwnSite('https://acme.gr/a', { domain: null, website: 'https://www.acme.gr' })).toBe(true);
  });
});
