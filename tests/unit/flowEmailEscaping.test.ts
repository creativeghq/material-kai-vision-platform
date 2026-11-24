import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { resolveHtmlTemplate } from '../../supabase/functions/_shared/flow-html-template';
import { stripComments } from '../helpers/stripComments';

const ctx = { trigger: { data: { name: '<img src=x onerror=alert(1)>', link: 'https://a.b/?x=1&y="2"', html: '<p>built</p>', none: null } } };

describe('flow email bodies escape event data', () => {
  it('escapes every {{path}}', () => {
    const out = resolveHtmlTemplate('<p>Hi {{trigger.data.name}}</p><a href="{{trigger.data.link}}">x</a>', ctx, false);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&amp;y=&quot;2&quot;');
  });

  it('inserts {{{path}}} raw only when the trigger is server-only', () => {
    expect(resolveHtmlTemplate('{{{trigger.data.html}}}', ctx, true)).toBe('<p>built</p>');
    expect(resolveHtmlTemplate('{{{trigger.data.html}}}', ctx, false)).toBe('&lt;p&gt;built&lt;/p&gt;');
  });

  it('renders null as nothing and leaves an unknown path visible', () => {
    expect(resolveHtmlTemplate('a{{trigger.data.none}}b', ctx, false)).toBe('ab');
    expect(resolveHtmlTemplate('{{trigger.data.missing}}', ctx, false)).toBe('{{trigger.data.missing}}');
  });

  it('send_email builds its html through the escaping resolver, gated on a server-only trigger', () => {
    const src = stripComments(readFileSync('supabase/functions/flow-engine/index.ts', 'utf8'));
    const send = src.slice(src.indexOf("case 'send_email':"), src.indexOf("case 'send_campaign':"));
    expect(send).toMatch(/html:\s*typeof config\.body === 'string'\s*\?\s*resolveHtmlTemplate\(config\.body,[^)]*SERVER_ONLY_EVENTS\.has\(scope\?\.triggerType/);
    expect(send).not.toMatch(/html:\s*resolved\.body/);
    for (const ev of ['moodboard_dormancy_warning', 'moodboard_dormancy_reminder', 'workspace_access_requested']) {
      expect(src.slice(src.indexOf('const SERVER_ONLY_EVENTS'), src.indexOf(']);', src.indexOf('const SERVER_ONLY_EVENTS')))).toContain(`'${ev}'`);
    }
  });
});
