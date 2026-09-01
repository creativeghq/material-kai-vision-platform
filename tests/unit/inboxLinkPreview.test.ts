/**
 * A pasted link is a LINK, and where we can say so, it is the page it points at.
 *
 * The inbox rendered `{m.body}` as plain text, so a customer's product URL arrived as 180
 * characters of percent-encoded slug that could not even be clicked — while the question being
 * asked ("is your decking like this one?") had its answer in that page's own photograph.
 *
 * Two halves with different failure modes, so both are pinned here: the LINK must work with no
 * network at all, and the CARD must be absent honestly — a page that states no metadata, a page
 * we could not read and an address the SSRF guard refused are three different facts and only one
 * of them is worth retrying.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitMessageLinks, messageUrls, shortenUrlForDisplay } from '../../src/utils/messageLinks';
import { extractLinkPreview } from '../../supabase/functions/_shared/link-preview';

const INBOX_API = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'inbox-api', 'index.ts'), 'utf8');
const INBOX_PAGE = readFileSync(
  join(process.cwd(), 'src', 'pages', 'Inbox', 'InboxPage.tsx'), 'utf8');
const FETCH_GUARD = readFileSync(
  join(process.cwd(), 'supabase', 'functions', '_shared', 'fetch-image.ts'), 'utf8');

/** The message from the screenshot, verbatim. */
const REAL_BODY =
  'https://showood.gr/products/wpc-dapedo-periphraxe-ependyseis/wpc--patoma/1456/'
  + '%CF%84%CE%B1%CE%B2%CE%BB%CE%B1-deck-wpc-25-x-15-x-360'
  + '\n\nOur decking is similar to this one, but our price to you is €5.73 per linear meter.';

describe('finding the links in a message', () => {
  it('splits the real message into a link and the sentence that follows it', () => {
    const segments = splitMessageLinks(REAL_BODY);
    const links = segments.filter((s) => s.kind === 'link');
    expect(links).toHaveLength(1);
    expect(links[0].kind === 'link' && links[0].href).toContain('showood.gr/products');
    // The words after it are still words. A link that swallowed the rest of the message would
    // hide the only sentence in it.
    expect(segments.map((s) => s.value).join('')).toBe(REAL_BODY);
    expect(segments.some((s) => s.kind === 'text' && s.value.includes('€5.73'))).toBe(true);
  });

  it('leaves the sentence its punctuation', () => {
    // `…/a.` is a full stop, not a path. A link that keeps it 404s, and the operator blames us.
    const [link] = messageUrls('Have a look at https://example.com/a.');
    expect(link).toBe('https://example.com/a');
    expect(messageUrls('(see https://example.com/x)')[0]).toBe('https://example.com/x');
    // ...but a bracket the URL itself opened is part of the URL.
    expect(messageUrls('https://en.wikipedia.org/wiki/Deck_(building)')[0])
      .toBe('https://en.wikipedia.org/wiki/Deck_(building)');
  });

  it('never invents a scheme for something that merely looks domain-shaped', () => {
    // "call me at 12.30pm" and a price are not links, and a wrong link in a customer
    // conversation is worse than a URL somebody has to copy.
    expect(messageUrls('call me at 12.30pm about the showood.gr order')).toEqual([]);
    expect(messageUrls('that is 5.73 per m')).toEqual([]);
  });

  it('asks for one page per distinct URL, not one per mention', () => {
    const body = 'https://a.example/x and again https://A.EXAMPLE/x plus https://b.example/y';
    expect(messageUrls(body)).toEqual(['https://a.example/x', 'https://b.example/y']);
    expect(messageUrls('https://a.example/1 https://b.example/2 https://c.example/3', 2)).toHaveLength(2);
  });

  it('shortens the LABEL and never the destination', () => {
    const long = 'https://showood.gr/products/wpc-dapedo-periphraxe-ependyseis/wpc--patoma/1456/tavla-deck';
    const shown = shortenUrlForDisplay(long);
    expect(shown.length).toBeLessThanOrEqual(48);
    expect(shown.startsWith('showood.gr')).toBe(true);
    // The END of a path is what identifies the page — truncating from the right makes every
    // link on one site look like the same link.
    expect(shown.endsWith('tavla-deck')).toBe(true);
    // The href is untouched: only `value` is display.
    const [seg] = splitMessageLinks(long);
    expect(seg.kind === 'link' && seg.href).toBe(long);
  });
});

describe('reading a page’s own description of itself', () => {
  const page = (head: string) => `<!doctype html><html><head>${head}</head><body>x</body></html>`;

  it('prefers what the page wrote FOR a card over what it wrote for a tab', () => {
    const html = page(`
      <title>Tab title</title>
      <meta name="description" content="Generic blurb">
      <meta property="og:title" content="WPC Decking 25 x 15 x 360">
      <meta property="og:description" content="Composite decking board">
      <meta property="og:image" content="https://cdn.showood.gr/deck.jpg">
      <meta property="og:site_name" content="Showood">
    `);
    expect(extractLinkPreview(html, 'https://showood.gr/p/1')).toEqual({
      title: 'WPC Decking 25 x 15 x 360',
      description: 'Composite decking board',
      imageUrl: 'https://cdn.showood.gr/deck.jpg',
      siteName: 'Showood',
    });
  });

  it('does not care which order the attributes were written in', () => {
    // `<meta content="…" property="og:title">` is as valid as the other way round, and a
    // per-field regex that assumes one order silently misses every page written the other —
    // which reads as "that site has no preview" rather than as a bug in here.
    const html = page('<meta content="Reversed" property="og:title">');
    expect(extractLinkPreview(html, 'https://x.example/').title).toBe('Reversed');
  });

  it('decodes entities, because the value goes into a text node', () => {
    const html = page('<title>Deck &amp; Fence &#8212; 25&nbsp;x&nbsp;15</title>');
    expect(extractLinkPreview(html, 'https://x.example/').title).toBe('Deck & Fence — 25 x 15');
  });

  it('resolves a relative image against the page it was found on', () => {
    // `og:image` is regularly a site-root path, and resolving it against the URL that was PASTED
    // rather than the one we ended up on points it at the wrong host after a redirect.
    const html = page('<meta property="og:image" content="/img/hero.jpg">');
    expect(extractLinkPreview(html, 'https://www.showood.gr/en/p/1').imageUrl)
      .toBe('https://www.showood.gr/img/hero.jpg');
  });

  it('drops an http image rather than upgrading it', () => {
    // The card renders over TLS, so an http image is mixed content the browser blocks. Rewriting
    // it to https is a guess that produces a BROKEN image where null produces no image.
    const html = page('<meta property="og:image" content="http://cdn.example/x.jpg">');
    expect(extractLinkPreview(html, 'https://x.example/').imageUrl).toBeNull();
  });

  it('says nothing rather than something, for a page that states nothing', () => {
    const p = extractLinkPreview(page(''), 'https://www.showood.gr/p/1');
    expect(p.title).toBeNull();
    expect(p.description).toBeNull();
    expect(p.imageUrl).toBeNull();
    // ...except the host, which is the one thing we always know and the first thing a reader
    // wants from a link.
    expect(p.siteName).toBe('showood.gr');
  });

  it('survives markup written to break it', () => {
    // Third-party HTML is untrusted input. A malformed entity or an unterminated tag produces a
    // null field, never a throw that takes the whole preview request with it.
    expect(() => extractLinkPreview('<meta property=og:title content=', 'https://x.example/')).not.toThrow();
    expect(extractLinkPreview(page('<title>&#xZZZZ; &#999999999;</title>'), 'https://x.example/').title)
      .toBe('&#xZZZZ; &#999999999;');
  });
});

describe('fetching one is a guarded fetch, and a narrow one', () => {
  it('re-validates EVERY redirect hop instead of following blindly', () => {
    // `fetchBinaryGuarded` refuses redirects outright and says why: the guard checked the host it
    // was handed, and a followed redirect moves the request somewhere nothing checked. A link
    // someone pastes redirects constantly (http→https, apex→www, every shortener), so the hops
    // are followed here — with `assertSafeUrl` run again on each `Location`, which is the
    // condition that file states for following one at all.
    expect(FETCH_GUARD).toMatch(/export async function fetchTextGuarded/);
    const body = FETCH_GUARD.slice(FETCH_GUARD.indexOf('export async function fetchTextGuarded'));
    const fn = body.slice(0, body.indexOf('/** `fetchImageGuarded`'));
    expect(fn).toMatch(/redirect: 'manual'/);
    // Two calls: the URL we were given, and every hop after it.
    expect(fn.match(/assertSafeUrl\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(fn).toMatch(/new URL\(location, current\)/);
    expect(fn).toMatch(/Too many redirects/);
    // Bounded in bytes as well as hops — `text/html` is not a promise about size.
    expect(fn).toMatch(/readCapped\(res, maxBytes\)/);
  });

  it('will only resolve a URL the caller’s own thread contains', () => {
    // This is a server-side fetch primitive. The SSRF guard is the control that matters, but the
    // reachable SET is narrowed too, and with the SAME parser the bubble segments with — so
    // "the client made it a link" and "the server will fetch it" cannot disagree.
    const block = INBOX_API.slice(INBOX_API.indexOf("case 'link_preview'"));
    const fn = block.slice(0, block.indexOf("case 'list_labels'"));
    expect(fn).toMatch(/resolveThreadAccess/);
    expect(fn).toMatch(/if \(!access\.canRead\) throw new HttpError\(404/);
    expect(fn).toMatch(/messageUrls\(/);
    expect(fn).toMatch(/not in this conversation/);
    expect(fn).toMatch(/contentTypePrefix: 'text\/html'/);
  });

  it('caches the REASON there is no card, not a blank row', () => {
    // "The page states no metadata", "we could not read it" and "the guard refused the address"
    // all render as no card and are not the same fact — without the column they are the same
    // row, and a fetcher that has been broken for a month looks exactly like a plain page.
    const block = INBOX_API.slice(INBOX_API.indexOf("case 'link_preview'"));
    const fn = block.slice(0, block.indexOf("case 'list_labels'"));
    for (const status of ['no_metadata', 'fetch_failed', 'blocked']) {
      expect(fn, `cache_status ${status} is never written`).toContain(status);
    }
    // A failure is retried; a page that genuinely says nothing is not re-fetched every render.
    expect(fn).toMatch(/cache_status === 'fetch_failed' \? 60 \* 60 \* 1000/);
  });
});

describe('rendering it', () => {
  it('builds nodes, never HTML', () => {
    // A message body is customer-written text (invariant 11). It is segmented into JSX text and
    // anchor nodes; the moment any of this becomes an HTML string, a message is an injection.
    // The ATTRIBUTE form, so the file's own comment saying it is never used does not
    // satisfy the test that it is never used.
    expect(INBOX_PAGE).not.toMatch(/dangerouslySetInnerHTML\s*=/);
    expect(INBOX_PAGE).toMatch(/splitMessageLinks\(body\)/);
  });

  it('opens a customer’s link safely and does not vouch for it', () => {
    const block = INBOX_PAGE.slice(INBOX_PAGE.indexOf('const MessageBody'));
    const fn = block.slice(0, block.indexOf('* Did the customer actually GET it?'));
    expect(fn.match(/rel="noopener noreferrer nofollow"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // The reader's page stays out of that site's logs, and a dead image removes itself rather
    // than leaving a broken frame in the middle of a conversation.
    expect(fn).toMatch(/referrerPolicy="no-referrer"/);
    expect(fn).toMatch(/onError=/);
  });

  it('shows a card only when the server said the fetch actually worked', () => {
    const block = INBOX_PAGE.slice(INBOX_PAGE.indexOf('const MessageBody'));
    const fn = block.slice(0, block.indexOf('* Did the customer actually GET it?'));
    // Not `preview.title != null` — a `fetch_failed` row carries a site_name and no title, and
    // reading presence instead of the verdict is how a failure renders as a plain page.
    expect(fn).toMatch(/cache_status === 'ok'/);
    // One card, for the first link. Five links is not five cards.
    expect(fn).toMatch(/messageUrls\(body, 1\)/);
  });
});
