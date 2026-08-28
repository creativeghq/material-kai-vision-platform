/**
 * A variable offered for pasting into an email says what kind of thing it is (#357 AE-14).
 *
 * The flow builder's helper listed ninety `{{trigger.data.*}}` tokens as one undifferentiated
 * set. Among them: one-click URLs that ACT on possession (`keep_active_url` clears a deletion
 * schedule, `invite_url` enrols whoever opens it), other people's email addresses, and internal
 * UUIDs. On screen, none of those looked any different from a title or a count.
 *
 * That is where the mistake gets made — an operator building a "notify the account manager" flow
 * pastes the keep-active link into a body that goes to somebody else, and hands them the
 * capability. The flow saves cleanly, the send succeeds, and nothing anywhere says so.
 *
 * The classification is DERIVED from the key, not hand-labelled per variable: ninety hand-kept
 * flags is the "a rule written N times" shape, and the ninety-first variable would arrive
 * unlabelled and read as safe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  variableSensitivity,
  riskyVariablesIn,
  getTriggerVariables,
  getAllTriggerGroups,
  SENSITIVITY_PRESENTATION,
  RISKY_SENSITIVITIES,
  TRIGGER_VARIABLES,
} from '../../src/services/flows/triggerVariables';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

describe('#357 AE-14 — the classifier', () => {
  it('marks the two links that act without a session', () => {
    // These are the ones that matter: following either does something, signed in or not.
    expect(variableSensitivity('keep_active_url')).toBe('capability');
    expect(variableSensitivity('invite_url')).toBe('capability');
  });

  it('does NOT cry wolf over an ordinary deep link', () => {
    // `action_url` lands on the login wall. Calling it a capability would put a red badge on the
    // commonest variable in the catalog, and a badge everywhere is a badge nowhere.
    expect(variableSensitivity('action_url')).toBe('link');
    expect(variableSensitivity('listing_url')).toBe('link');
  });

  it('catches token-shaped keys by shape, so a new one is covered on arrival', () => {
    for (const k of ['share_token', 'reset_code', 'api_secret', 'signature', 'password']) {
      expect(variableSensitivity(k), k).toBe('capability');
    }
  });

  it('separates personal detail, internal ids and prebuilt markup', () => {
    expect(variableSensitivity('owner_email')).toBe('personal');
    expect(variableSensitivity('from_email')).toBe('personal');
    expect(variableSensitivity('quote_request_id')).toBe('internal');
    expect(variableSensitivity('email_html')).toBe('markup');
  });

  it('leaves ordinary values alone', () => {
    for (const k of ['title', 'body', 'catalog_title', 'sent_count', 'target_keyword']) {
      expect(variableSensitivity(k), k).toBe('plain');
    }
  });

  it('reads the more dangerous meaning when a key matches twice', () => {
    // `_token` beats `_url`: what the thing DOES outranks what it looks like.
    expect(variableSensitivity('share_url_token')).toBe('capability');
  });

  it('every class has wording, and only plain is silent', () => {
    for (const [cls, p] of Object.entries(SENSITIVITY_PRESENTATION)) {
      if (cls === 'plain') { expect(p.label).toBe(''); continue; }
      expect(p.label, cls).toBeTruthy();
      expect(p.note, cls).toBeTruthy();
    }
  });
});

describe('#357 AE-14 — reading the risk out of composed text', () => {
  it('finds a capability variable in a body', () => {
    const found = riskyVariablesIn('Hi {{trigger.data.owner_name}}, keep it: {{trigger.data.keep_active_url}}');
    expect(found).toEqual([{ key: 'keep_active_url', sensitivity: 'capability' }]);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(riskyVariablesIn('{{ trigger.data.invite_url }}')).toHaveLength(1);
  });

  it('reports each key once however often it appears', () => {
    const text = '{{trigger.data.invite_url}} and again {{trigger.data.invite_url}}';
    expect(riskyVariablesIn(text)).toHaveLength(1);
  });

  it('says nothing about ordinary text', () => {
    expect(riskyVariablesIn('Hello {{trigger.data.title}} — {{trigger.data.action_url}}')).toEqual([]);
    expect(riskyVariablesIn('')).toEqual([]);
    expect(riskyVariablesIn(undefined as unknown as string)).toEqual([]);
  });

  it('warns on a personal address, which is the quieter half of the finding', () => {
    // Forwarding somebody's email address to a third party is a disclosure, not a formatting bug.
    expect(riskyVariablesIn('reply to {{trigger.data.from_email}}')).toEqual([
      { key: 'from_email', sensitivity: 'personal' },
    ]);
    expect(RISKY_SENSITIVITIES).toContain('personal');
  });
});

describe('#357 AE-14 — every catalog surface carries the class', () => {
  it('getTriggerVariables classifies what it returns', () => {
    const vars = getTriggerVariables('moodboard_dormancy_warning');
    const keepActive = vars.find((v) => v.key === 'keep_active_url');
    expect(keepActive?.sensitivity).toBe('capability');
    expect(vars.every((v) => typeof v.sensitivity === 'string')).toBe(true);
  });

  it('the template builder groups carry it too', () => {
    const groups = getAllTriggerGroups();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.variables.every((v) => typeof v.sensitivity === 'string'))).toBe(true);
  });

  it('the whole catalog classifies without throwing, and finds real capabilities in it', () => {
    // A regression that made everything `plain` would pass every test above; this one would not.
    const all = Object.values(TRIGGER_VARIABLES).flat();
    expect(all.length).toBeGreaterThan(50);
    const capabilities = all.filter((v) => variableSensitivity(v.key) === 'capability');
    expect(capabilities.length).toBeGreaterThan(0);
  });
});

describe('#357 AE-14 — the surfaces show it', () => {
  it('the variables helper badges each token and explains the classes present', () => {
    const src = read('src/components/Admin/FlowsManagement/panels/VariablesHelper.tsx');
    expect(src).toMatch(/<SensitivityBadge sensitivity=\{v\.sensitivity\} \/>/);
    // The legend lists only what is on screen — explaining a badge nobody can see is noise.
    expect(src).toMatch(/classesShown/);
    expect(src).toMatch(/filter\(\(c\) => c !== 'plain'\)/);
  });

  it('the email action warns about what THIS message will send', () => {
    const src = read('src/components/Admin/FlowsManagement/panels/configs/ActionConfigForm.tsx');
    expect(src).toMatch(/const OutboundVariableWarning/);
    expect(src).toMatch(/riskyVariablesIn\(text \|\| ''\)/);
    // Subject and body together: a capability link is no safer in a subject line.
    expect(src).toMatch(/OutboundVariableWarning text=\{`\$\{cfg\.subject \|\| ''\}/);
    // And the template variables map into the same email.
    expect(src).toMatch(/OutboundVariableWarning text=\{cfg\.variables\}/);
  });

  it('the warning reads the text, not what was clicked', () => {
    // A config can be typed, pasted, or restored from a saved flow. Tracking insertions would
    // miss every one of those, while looking clean.
    const src = read('src/components/Admin/FlowsManagement/panels/configs/ActionConfigForm.tsx');
    expect(src, 'the warning is driven by a click handler again').not.toMatch(/onInsertVariable|lastInserted/);
  });

  it('the template builder tag reference carries the class in its note', () => {
    const src = read('src/modules/email/pages/EmailTemplateBuilderPage.tsx');
    expect(src).toMatch(/SENSITIVITY_PRESENTATION\[v\.sensitivity\]/);
  });
});
