import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '@/utils/escapeHtml';
import { hasEmailMarkup, renderEmailMarkup } from '@/utils/emailMarkup';
import { stripComments } from '../helpers/stripComments';

const r = (t: string) => renderEmailMarkup(t, escapeHtml);

describe('renderEmailMarkup', () => {
  it('renders the supported formatting', () => {
    expect(r('Hello **Maria**, see *this*.')).toBe('<p>Hello <strong>Maria</strong>, see <em>this</em>.</p>');
    expect(r('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(r('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
    expect(r('> quoted\n> more')).toBe('<blockquote>quoted<br>more</blockquote>');
    expect(r('a\nb\n\nc')).toBe('<p>a<br>b</p>\n<p>c</p>');
  });

  it('links only http(s) and mailto, and autolinks a bare URL', () => {
    expect(r('[Keros](https://keros.com/a?b=1&c=2)')).toBe('<p><a href="https://keros.com/a?b=1&amp;c=2">Keros</a></p>');
    expect(r('see https://keros.com.')).toBe('<p>see <a href="https://keros.com">https://keros.com</a>.</p>');
    expect(r('[x](javascript:alert(1))')).not.toContain('<a');
  });

  it('escapes everything the member typed before adding a tag', () => {
    const out = r('<img src=x onerror=alert(1)> **<b>"hi"</b>** [<i>a</i>](https://x.io/"onmouseover=1)');
    expect(out).not.toMatch(/<img|<b>|<i>|"onmouseover/);
    expect(out).toContain('&lt;img');
  });

  it('knows plain text is plain', () => {
    expect(hasEmailMarkup('Thanks, see you at 5 * 2 = 10')).toBe(false);
    expect(hasEmailMarkup('**urgent**')).toBe(true);
    expect(hasEmailMarkup('- item')).toBe(true);
  });
});

describe('an email reply sends that HTML only through the escaping builders', () => {
  const api = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/inbox-api/index.ts'), 'utf8'));
  it('renders the member body with the canonical escaper', () => {
    expect(api).toContain('renderEmailMarkup(String(body), escapeHtml)');
    expect(api).toContain("from '../_shared/emailMarkup.generated.ts'");
  });
});
