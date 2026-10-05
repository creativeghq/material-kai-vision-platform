// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeEmailHtml } from '@/utils/sanitizeEmailHtml';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

describe('sanitizeEmailHtml', () => {
  it('drops scripts, handlers, forms, frames and javascript: links', () => {
    const { html } = sanitizeEmailHtml(
      '<p onclick="x()">Hi</p><script>alert(1)</script><img src="x" onerror="steal()"><form><input name="p"></form>' +
      '<iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">go</a>',
      true,
    );
    expect(html).not.toMatch(/<script|onclick|onerror|<form|<input|<iframe|javascript:/i);
    expect(html).toContain('Hi');
  });

  it('opens every link in a new tab without an opener', () => {
    const { html } = sanitizeEmailHtml('<a href="https://keros.com">Keros</a>', false);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('holds remote images back until allowed, and counts them', () => {
    const raw = '<img src="https://track.example/p.gif"><div style="background:url(https://track.example/b.png)">x</div>' +
      '<style>@import url(https://track.example/a.css); .h{background:url("//track.example/c.png")}</style>';
    const blocked = sanitizeEmailHtml(raw, false);
    expect(blocked.html).not.toMatch(/\ssrc="https:/);
    expect(blocked.html).not.toMatch(/url\(|@import/);
    expect(blocked.html).toContain('data-blocked-src="https://track.example/p.gif"');
    expect(blocked.blockedImages).toBeGreaterThanOrEqual(4);
    const allowed = sanitizeEmailHtml(raw, true);
    expect(allowed.blockedImages).toBe(0);
    expect(allowed.html).toContain('src="https://track.example/p.gif"');
  });

  it('keeps a leading <style> block, which is where emails put their styling', () => {
    const { html } = sanitizeEmailHtml('<style>.a{color:red}</style><p class="a">x</p>', false);
    expect(html).toContain('.a{color:red}');
  });
});

describe('the inbox shows the formatted email through that sanitiser', () => {
  const view = read('src/pages/Inbox/components/EmailHtmlView.tsx');
  const bubble = read('src/pages/Inbox/components/MessageBubble.tsx');

  it('frames it without script', () => {
    const sandbox = view.match(/sandbox="([^"]*)"/)?.[1] ?? '';
    expect(sandbox, 'the email frame must be sandboxed').not.toBe('');
    expect(sandbox).not.toContain('allow-scripts');
    expect(view).toContain('sanitizeEmailHtml(');
    expect(view).not.toContain('dangerouslySetInnerHTML');
  });

  it('is what the message bubble renders for an email with HTML', () => {
    expect(bubble).toContain('meta.email_html');
    expect(bubble).toContain('<EmailHtmlView');
  });
});
