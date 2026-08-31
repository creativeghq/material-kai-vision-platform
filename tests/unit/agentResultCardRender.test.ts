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
    // The badge used to print the stored value verbatim, so `partially_paid` reached the screen
    // as `partially_paid` — the same enum leak this card fixes in every other cell. The word is
    // now humanised on the way in, so the tint and the label are asserted together.
    expect(html).toMatch(/success-bg[\s\S]*?Active/);   // active  → success
    expect(html).toMatch(/warning-bg[\s\S]*?Draft/);    // draft   → warning
    expect(html).toMatch(/surface-sunken[\s\S]*?Paused/); // paused → neutral
  });

  it('never shows a raw ISO timestamp', () => {
    expect(html).not.toContain('2026-08-18T20:02:46');
    expect(html).toContain('Aug 18, 2026');
  });

  it('labelises a stored enum value', () => {
    expect(html).not.toContain('>quote_approved<');
    // Sentence case, not Title Case: this is a VALUE, and "Partially paid" is how a person writes
    // it. Column HEADINGS keep Title Case — they are labels, not prose.
    expect(html).toContain('Quote approved');
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

/**
 * The record layer — conversation 46b837fb, "show me the first 5 expenses by supplier".
 *
 * The agent answered TWICE in that conversation: a prose table in the chat with a Supplier column
 * and real amounts, and this card on the canvas with the whole payload nested under a field
 * labelled "Data", a Notes column instead of a supplier, and `328` in one column next to `EUR` in
 * another. Same six expenses, two different answers depending on which half of the screen you
 * were looking at — and nothing on the canvas was clickable.
 *
 * The payload below is the real one, plus the identity columns `list_recent_expenses` now selects.
 */
const EXPENSES = {
  data: {
    count: 2,
    expenses: [
      {
        id: 'e3f10239-c2d5-436f-b3ac-58d547dd223f',
        supplier_bill_number: 'IN-400014625258038',
        supplier_company_id: '0d2ec35e-2721-405b-89b7-657f763195c7',
        supplier_name: 'ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ',
        total: 322.44,
        amount_due: 322.44,
        currency: 'EUR',
        status: 'received',
        issued_at: '2026-07-29',
      },
      {
        id: '829c1d38-a21c-48ef-9505-2d78c8821a1a',
        supplier_bill_number: 'IN-400014633955947',
        supplier_company_id: '1d2ec35e-2721-405b-89b7-657f763195c8',
        supplier_name: 'TEMA SALES ΑΝΤΙΠΡΟΣΩΠΕΙΕΣ Α.Ε.',
        total: 90.87,
        amount_due: 90.87,
        currency: 'EUR',
        status: 'received',
        issued_at: '2026-07-29',
      },
    ],
  },
};

const FULL_ACCESS = {
  route: { isPlatformOperator: false, isWorkspaceManager: true },
  gate: { can: () => true, isModuleAvailable: () => true, isWorkspaceManager: true },
};

describe('AgentResultCard makes the records reachable', () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentResultCard, {
      title: 'Recent expenses',
      data: EXPENSES,
      resultType: 'expenses_list',
      access: FULL_ACCESS,
    }),
  );

  it('unwraps the single `data` envelope instead of labelling it', () => {
    // `{data: {count, expenses}}` used to render as a field called "Data" with the answer nested
    // inside — the shape of the JSON leaking through as a heading. On the canvas that IS the
    // whole artifact, so the leak was the entire screen.
    expect(html).not.toMatch(/>Data</);
    expect(html).toContain('<table');
    expect(html).toContain('>Supplier Name<');
  });

  it('links the supplier to its CRM entry, in a new tab', () => {
    // "link to the crm name entry (new window)" — following it is LEAVING, and the conversation
    // has to still be there afterwards.
    expect(html).toContain('href="/crm/companies/0d2ec35e-2721-405b-89b7-657f763195c7"');
    expect(html).toMatch(/href="\/crm\/companies\/[^"]+"[^>]*target="_blank"/);
    expect(html).toContain('ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ');
  });

  it('makes the row itself open its own record', () => {
    // The expense has no page of its own, so the bill number is a button (the peek dialog), not
    // an anchor to a list pretending to be the record.
    expect(html).toMatch(/<button[^>]*>[\s\S]{0,120}IN-400014625258038/);
  });

  it('reads money with its currency instead of beside it', () => {
    expect(html).toContain('€322.44');
    expect(html).not.toContain('>Currency<');
  });

  it('offers no links at all when it was given no reader', () => {
    // Gates come from the persona, and a card rendered without one must not guess. This is also
    // what keeps the component renderable outside every provider.
    const bare = renderToStaticMarkup(
      React.createElement(AgentResultCard, { title: 'Recent expenses', data: EXPENSES, resultType: 'expenses_list' }),
    );
    expect(bare).toContain('<table');
    expect(bare).not.toContain('/crm/companies/');
  });

  it('withholds a link the persona cannot open', () => {
    const walled = renderToStaticMarkup(
      React.createElement(AgentResultCard, {
        title: 'Recent expenses',
        data: EXPENSES,
        resultType: 'expenses_list',
        access: {
          route: { isPlatformOperator: false, isWorkspaceManager: false },
          gate: { can: () => false, isModuleAvailable: () => false, isWorkspaceManager: false },
        },
      }),
    );
    // The name is still readable; it is simply not a door onto a permission wall.
    expect(walled).toContain('ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ');
    expect(walled).not.toContain('/crm/companies/');
  });
});

describe('AgentResultCard sends a record where its detail actually lives', () => {
  it('links a kind the peek does not model straight to its page', () => {
    // `get_record_peek` models twelve kinds. An inbox thread is not one of them, and it has a
    // page — so opening a dialog for it would say "this record is no longer available" about a
    // thread that is perfectly fine. The row is an anchor instead.
    const html = renderToStaticMarkup(
      React.createElement(AgentResultCard, {
        title: 'Inbox',
        resultType: 'inbox_threads_list',
        access: FULL_ACCESS,
        data: {
          threads: [
            { id: 'aaaaaaaa-1111-2222-3333-444444444444', subject: 'Quote request', status: 'open' },
            { id: 'bbbbbbbb-1111-2222-3333-444444444444', subject: 'Delivery question', status: 'closed' },
          ],
        },
      }),
    );
    expect(html).toContain('href="/inbox?thread=aaaaaaaa-1111-2222-3333-444444444444"');
  });
});
