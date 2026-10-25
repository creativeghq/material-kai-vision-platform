import { describe, it, expect } from 'vitest';
import { htmlToText, quoteIsOnPage, verifyEvidenceQuotes } from '../../supabase/functions/_shared/b2b-quote-check.ts';

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

describe('verifyEvidenceQuotes', () => {
  const row = (url: string | null, q = 'official representative for Greece') => ({ company_name: 'X', type_evidence: q, type_evidence_url: url });
  it('verifies, moves, and tolerates fetch failures', async () => {
    const pages: Record<string, string> = {
      'https://a.test/ok': '<p>Official representative for Greece</p>',
      'https://a.test/no': '<p>Nothing relevant here at all</p>',
    };
    const fetchPage = async (u: string) => {
      if (!pages[u]) throw new Error('boom');
      return pages[u];
    };
    const out = await verifyEvidenceQuotes(
      [row('https://a.test/ok'), row('https://a.test/no'), row('https://a.test/dead'), row(null)],
      [],
      { fetchPage },
    );
    expect(out.matches.map((m) => m.evidence_verified)).toEqual([true, null, null]);
    expect(out.unverified).toHaveLength(1);
    expect(out.unverified[0]).toMatchObject({ evidence_verified: false, unverified_reason: 'quote not found on the cited page' });
  });
  it('checks at most eight rows', async () => {
    let calls = 0;
    const fetchPage = async () => {
      calls++;
      return 'official representative for Greece';
    };
    const rows = Array.from({ length: 10 }, () => row('https://a.test/x'));
    const out = await verifyEvidenceQuotes(rows, [], { fetchPage });
    expect(calls).toBe(8);
    expect(out.matches.filter((m) => m.evidence_verified === null)).toHaveLength(2);
  });
});
