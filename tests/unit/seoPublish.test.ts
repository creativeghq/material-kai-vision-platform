import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { faqPairs, jsonLdScript, markdownToHtml } from '../../supabase/functions/_shared/seo/markdown-html';

const ROOT = join(__dirname, '..', '..');
const fn = blankComments(readFileSync(join(ROOT, 'supabase/functions/seo-publish/index.ts'), 'utf8'));

describe('#401 W3.1 — article markdown becomes HTML only through the escaper', () => {
  it('renders the shapes an article uses', () => {
    const html = markdownToHtml([
      '## Tiles', '', 'Use **porcelain** in a [wet room](https://example.com/wet).', '',
      '- one', '- two', '', '1. first', '2. second', '', '| Size | Price |', '|---|---|', '| 60x60 | €20 |',
    ].join('\n'));
    expect(html).toContain('<h2>Tiles</h2>');
    expect(html).toContain('<strong>porcelain</strong>');
    expect(html).toContain('<a href="https://example.com/wet">wet room</a>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<td>60x60</td>');
  });

  it('never passes raw HTML or a script URL through', () => {
    const html = markdownToHtml('Hello <script>alert(1)</script> [x](javascript:alert(1)) ![i](http://insecure/a.png) "q" & \'s\'');
    expect(html).not.toMatch(/<script|javascript:|src="http:/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;q&quot; &amp; &#39;s&#39;');
  });

  it('reads FAQ pairs for FAQPage data, and JSON-LD cannot close its own tag', () => {
    const md = ['# T', '## Frequently Asked Questions', '### Is it waterproof?', 'Yes, fully.', '### How thick?', '**10mm** thick.'].join('\n');
    expect(faqPairs(md)).toEqual([
      { question: 'Is it waterproof?', answer: 'Yes, fully.' },
      { question: 'How thick?', answer: '10mm thick.' },
    ]);
    expect(jsonLdScript({ a: '</script><script>x' })).not.toContain('</script><script>');
  });
});

describe('#401 W3.1 — publishing is one post, however often it is retried', () => {
  const publish = fn.slice(fn.indexOf('async function handlePublish('));

  it('claims the article before creating a post, and records the post id straight after', () => {
    const claim = publish.indexOf(".is('publish_external_id', null)");
    const create = publish.indexOf("wp(creds, 'POST', '/wp/v2/posts', payload)");
    const record = publish.indexOf('.update({ publish_external_id: externalId');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(create);
    expect(create).toBeLessThan(record);
    expect(publish.slice(create, record)).not.toMatch(/await (?!supabase)/);
  });

  it('a retry updates the post it already made', () => {
    expect(publish).toMatch(/if \(externalId\) \{\s*post = await wp\(creds, 'POST', `\/wp\/v2\/posts\/\$\{encodeURIComponent\(externalId\)\}`/);
  });

  it('every site request is SSRF-guarded, https only, and never follows a redirect', () => {
    const client = fn.slice(fn.indexOf('async function wp('), fn.indexOf('async function memberRole('));
    expect(client).toContain("assertSafeUrl(");
    expect(client).toContain("allowSchemes: ['https:']");
    expect(client).toContain("redirect: 'manual'");
  });

  it('the password is read from Vault through the service-role RPC, never a column', () => {
    expect(fn).toContain("rpc('wordpress_credentials'");
    expect(fn).toContain("rpc('wordpress_store_credentials'");
    expect(fn).not.toMatch(/from\('workspace_wordpress_credentials'\)\.(insert|upsert|update)/);
  });
});
