// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '@/utils/sanitizeEmailHtml';

describe('remote images stay blocked until "Show images" (#485 I-18)', () => {
  const cases: Array<[string, string]> = [
    ['img srcset without src', '<img srcset="https://t.example/p.gif 1x">'],
    ['picture source srcset', '<picture><source srcset="//t.example/p.webp"><img alt="x"></picture>'],
    ['video poster', '<video poster="https://t.example/p.jpg"></video>'],
    ['escaped url() in a style attribute', '<div style="background:u\\72l(https://t.example/p.gif)">x</div>'],
    ['escaped scheme inside url()', '<div style="background-image:url(\\68ttps://t.example/p.gif)">x</div>'],
    ['image-set with a bare string', '<div style="background-image:image-set(&quot;https://t.example/p.gif&quot; 1x)">x</div>'],
    ['escaped url() in a style element', '<style>.a{background:u\\72l(https://t.example/p.gif)}</style><p class="a">x</p>'],
  ];

  for (const [label, raw] of cases) {
    it(label, () => {
      const { html, blockedImages } = sanitizeEmailHtml(raw, false);
      expect(html).not.toMatch(/t\.example/);
      expect(blockedImages).toBeGreaterThan(0);
    });
  }

  it('the same references load once images are allowed', () => {
    const { html } = sanitizeEmailHtml('<img srcset="https://t.example/p.gif 1x">', true);
    expect(html).toContain('t.example');
  });

  it('a style with no remote reference is left exactly as written', () => {
    const raw = '<p style="content:&quot;\\201C&quot;;color:red">x</p>';
    expect(sanitizeEmailHtml(raw, false).html).toBe(sanitizeEmailHtml(raw, true).html);
  });
});
