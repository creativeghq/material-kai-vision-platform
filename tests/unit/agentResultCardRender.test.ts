/**
 * What the agent's result card ACTUALLY renders.
 *
 * AgentResultCard is the only renderer for all 127 result types in AGENT_RESULT_TITLES, so its
 * shape handling is the Agent Hub's presentation layer. Every other guard in this repo scans
 * source; this one renders the component to HTML with a real payload and asserts the output,
 * because the defects it exists to catch are invisible in source:
 *
 *   • `{ flows: [...] }` came out as one grey chip per row with `Name: x  Status: y` inside it —
 *     fine at one row, a wall at twenty, unscannable down a column.
 *   • a timestamp printed verbatim as `2026-08-18T20:02:46.275904+00:00`, which is the single
 *     most "this is a debug view" detail on the screen.
 *   • a stored enum printed as `quote_approved`.
 *
 * The payload below is the real one from conversation daf3efb3, with rows added to make it a list.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentResultCard } from '@/components/features/ai/AgentResultCard';

const FLOWS = {
  flows: [
    { id: '6b0af518-ffad-49ec-b498-94a0893afc61', name: 'New automation', status: 'draft', trigger_type: 'manual', created_at: '2026-08-18T20:02:46.275904+00:00', runs: 0 },
    { id: '7c1bf629-aabc-49ec-b498-94a0893afc62', name: 'Quote follow-up', status: 'active', trigger_type: 'quote_approved', created_at: '2026-08-10T09:00:00+00:00', runs: 42 },
    { id: '8d2cf73a-bbcd-49ec-b498-94a0893afc63', name: 'Stale lead nudge', status: 'paused', trigger_type: 'scheduled', created_at: '2026-07-02T09:00:00+00:00', runs: 7 },
  ],
};

const render = (data: Record<string, unknown>, resultType = 'flows_list', title = 'Workspace flows') =>
  renderToStaticMarkup(React.createElement(AgentResultCard, { title, data, resultType, onAsk: () => {} }));

describe('AgentResultCard renders a record list as a table', () => {
  const html = render(FLOWS);

  it('produces a real table, not a stack of chips', () => {
    expect(html).toContain('<table');
    expect((html.match(/<tr /g) || []).length).toBe(4); // header + 3 rows
  });

  it('derives its columns from the rows and drops the join key', () => {
    for (const h of ['Name', 'Status', 'Trigger Type', 'Runs']) expect(html).toContain(`>${h}<`);
    // A raw UUID under an id-shaped key is a join key, not information.
    expect(html).not.toContain('6b0af518');
  });

  it('right-aligns the numeric column with tabular figures', () => {
    expect(html).toContain('text-right tabular-nums');
    // …and only the numeric one: a text column aligned right reads as a broken table.
    expect((html.match(/tabular-nums/g) || []).length).toBe(3); // one per row, the `runs` cell
  });

  it('renders status as a tinted badge, mapped to meaning', () => {
    expect(html).toMatch(/success-bg[\s\S]*?active/);   // active  → success
    expect(html).toMatch(/warning-bg[\s\S]*?draft/);    // draft   → warning
    expect(html).toMatch(/surface-sunken[\s\S]*?paused/); // paused → neutral
  });

  it('never shows a raw ISO timestamp', () => {
    expect(html).not.toContain('2026-08-18T20:02:46');
    expect(html).toContain('Aug 18, 2026');
  });

  it('labelises a stored enum value', () => {
    expect(html).not.toContain('>quote_approved<');
    expect(html).toContain('Quote Approved');
  });

  it('does not repeat the list key as a heading above its own table', () => {
    // The card is titled "Workspace flows"; a field label "Flows" directly under it is the
    // payload's shape leaking through as a heading nobody needs.
    expect(html).not.toMatch(/>Flows</);
  });
});

describe('AgentResultCard leaves non-tabular payloads alone', () => {
  it('a single record still renders as labelled key/values', () => {
    const html = render({ name: 'Fabryka Mebli Wersal', city: 'Poznań', verified: true }, 'company_enrichment', 'Company');
    expect(html).not.toContain('<table');
    expect(html).toContain('Fabryka Mebli Wersal');
    expect(html).toContain('Yes'); // boolean rendered for a reader, not as `true`
  });

  it('a ragged array falls back rather than forcing a table', () => {
    const html = render({ items: [{ a: 1 }, { totally: 'different', shape: [1, 2] }] }, 'x', 'Items');
    expect(html).not.toContain('<table');
  });

  it('an absent value reads as an em dash', () => {
    const html = render({ note: null }, 'x', 'Thing');
    expect(html).toContain('—');
  });
});

/**
 * The commonest real payload on this platform is an EMPTY list.
 *
 * Measured across saved agent result messages: `{contracts: []}`, `{appointments: [], days: 7}`,
 * `{threads: []}`, `{channels: []}`. It rendered as the card title, then the same word again as a
 * field label, then "None" — three sayings of nothing, and no way forward. CLAUDE.md's rule is
 * that an empty surface must offer the way out of being empty, and this card already has one: the
 * "Open in {Hub}" handoff.
 */
describe('AgentResultCard handles the empty result properly', () => {
  it('an empty list is an empty STATE, not the word None', () => {
    const html = render({ contracts: [], workspace_id: 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e' }, 'contracts_list', 'Contracts');
    expect(html).not.toContain('>None<');
    expect(html).toContain('No contracts yet');
    // The way out survives — that is what makes it an empty state rather than a dead end.
    expect(html).toContain('Open in');
  });

  it('says the run was clean, so an empty card does not read as a failure', () => {
    const html = render({ threads: [] }, 'inbox_threads_list', 'Inbox');
    expect(html).toMatch(/nothing to show|nothing here yet/i);
  });

  it('does not repeat the list name as a field label above nothing', () => {
    const html = render({ contracts: [] }, 'contracts_list', 'Contracts');
    // The defect is the KEY/VALUE ROW — the card title says "Contracts", and the old render put a
    // field label "Contracts" directly under it with "None" beside it. Counting the word is the
    // wrong instrument: it also appears legitimately in the hub button and the description.
    expect(html).not.toContain('grid grid-cols-[140px_1fr]');
  });

  it('a scalar beside the list is context, and reads under the table', () => {
    const html = render(
      { days: 7, appointments: [{ id: 'a1b2c3d4-1111-2222-3333-444455556666', title: 'Site visit', status: 'confirmed', starts_at: '2026-08-20T09:00:00+00:00' },
                                { id: 'a1b2c3d4-1111-2222-3333-444455556667', title: 'Handover', status: 'pending', starts_at: '2026-08-21T14:00:00+00:00' }] },
      'appointments_list', 'Appointments',
    );
    expect(html).toContain('<table');
    // `days: 7` is the window searched — context for the table, so it must come after it.
    expect(html.indexOf('</table>')).toBeLessThan(html.indexOf('Days'));
  });
});

/**
 * A list you cannot act on is a report, not a product surface. "Show me my contacts" should be one
 * click from "add another" — but NOT by deep-linking a create page: a CRM party has to go through
 * the duplicate search before it exists, which is why `crm_company` is deliberately unbuilt as a
 * template type. The action hands the intent back to the agent, which runs the real flow.
 */
describe('AgentResultCard offers the next action', () => {
  it('offers a create action under a list, named from the list itself', () => {
    const html = render(FLOWS);
    expect(html).toContain('Add flow');
  });

  it('offers it on an empty list too — that is where it matters most', () => {
    const html = render({ contacts: [] }, 'crm_contact_created', 'Contacts');
    expect(html).toContain('No contacts yet');
    expect(html).toContain('Add contact');
  });

  it('singularises properly rather than hacking off an s', () => {
    expect(render({ companies: [] }, 'x', 'Companies')).toContain('Add company');
    expect(render({ addresses: [] }, 'x', 'Addresses')).toContain('Add address');
  });

  it('does NOT offer create under a single record — "add another" means nothing there', () => {
    const html = render({ name: 'Fabryka Mebli Wersal', city: 'Poznań' }, 'company_enrichment', 'Company');
    expect(html).not.toContain('Add ');
  });

  it('renders nothing clickable when the host gives it no way to ask', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentResultCard, { title: 'Contacts', data: { contacts: [] }, resultType: 'x' }),
    );
    expect(html).not.toContain('Add contact');
  });
});
