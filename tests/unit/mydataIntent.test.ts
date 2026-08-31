/**
 * "Expenses" means our books. The myDATA feed is reached only by naming it.
 *
 * Two sets answer to the same word and they are not the same size: 6 recorded expenses against
 * 1,866 documents ΑΑΔΕ has sent, 1,864 of them never booked. Answering either question with the
 * other set is a valid-looking list that is wrong by three orders of magnitude — the shape that
 * produced "2" for the whole feed, and then, once the feed tool existed, produced the feed for a
 * plain question about our own spending.
 *
 * That second direction was MEASURED, not feared. claude-opus-5, real tool descriptions, one call
 * per prompt: "What expenses do we have?" and "List the last 10 expenses by supplier" fired BOTH
 * tools, and "Give me the first 5 expenses by supplier" fired the feed and never touched the
 * ledger. 6 of 9 prompts routed correctly, which is what a description alone buys you.
 *
 * So the rule is enforced in code and this file holds the vocabulary honest. A description is
 * advice to a model; `mentionsMyDataFeed` is the gate `list_mydata_expenses` fails closed on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  mentionsMyDataFeed,
  userTurnText,
} from '../../supabase/functions/_shared/finance/mydata-intent';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('naming the myDATA feed', () => {
  it('recognises how people actually write it', () => {
    for (const q of [
      'Show me the expenses from myDATA.',
      'expenses from myaade please',
      'What did we get from my AADE this month?',
      'anything in AADE for August?',
      'τι έχει η ΑΑΔΕ για τον Αύγουστο;',
      'what is in the expenses inbox',
      'which suppliers have filed against us',
      'show me the received documents',
    ]) {
      expect(mentionsMyDataFeed(q), q).toBe(true);
    }
  });

  it('matches the Greek spelling as well as the Latin one', () => {
    // ΑΑΔΕ is Greek capitals that look like Latin ones (U+0391/0394/0395). Someone on a Latin
    // keyboard types AADE and someone on a Greek one types ΑΑΔΕ; matching one silently refuses
    // half the people who ask.
    expect(mentionsMyDataFeed('δώσε μου τα έξοδα από την ΑΑΔΕ')).toBe(true);
    expect(mentionsMyDataFeed('give me the AADE expenses')).toBe(true);
    // Accents must not defeat it either.
    expect(mentionsMyDataFeed('τα έξοδα της ΑΑΔΈ')).toBe(true);
  });

  it('does NOT fire on a plain question about our expenses', () => {
    // Every one of these is a question about the ledger. This is the list that regressed.
    for (const q of [
      'Show me my recent expenses.',
      'What expenses do we have?',
      'List the last 10 expenses by supplier, the top 5 in that list.',
      'Give me the first 5 expenses by supplier.',
      'Show me unpaid expenses.',
      'How much have we spent this month?',
      'what do we owe our suppliers',
      '',
    ]) {
      expect(mentionsMyDataFeed(q), q).toBe(false);
    }
  });

  it('reads the turn from the USER side only', () => {
    const messages = [
      { role: 'user', content: 'Show me my expenses.' },
      // The agent says "myDATA" whenever it explains where a number came from. Counting that
      // would let the gate open itself on the next turn.
      { role: 'assistant', content: 'Two of these came from myDATA.' },
      { role: 'user', content: 'and the unpaid ones?' },
    ];
    expect(mentionsMyDataFeed(userTurnText(messages))).toBe(false);
  });

  it('carries the mention across a follow-up, because that is one request', () => {
    const messages = [
      { role: 'user', content: 'Show me the expenses from myDATA.' },
      { role: 'assistant', content: 'Here they are.' },
      { role: 'user', content: 'only the ones we have not booked' },
    ];
    expect(mentionsMyDataFeed(userTurnText(messages))).toBe(true);
  });

  it('handles the content-block shape and a null turn', () => {
    expect(userTurnText([{ role: 'user', content: [{ type: 'text', text: 'from myaade' }] }]))
      .toContain('myaade');
    expect(mentionsMyDataFeed(userTurnText(null, null))).toBe(false);
    expect(userTurnText(undefined, 'latest only')).toBe('latest only');
  });
});

describe('the gate is in the tool, not only in the description', () => {
  const tools = read('supabase/functions/_shared/tools/expense-tools.ts');
  const chat = read('supabase/functions/agent-chat/index.ts');

  it('refuses the feed when the request did not name it', () => {
    expect(tools).toContain('mentionsMyDataFeed');
    // Fail closed: the refusal is BEFORE any query runs, and it names the tool to use instead so
    // the model corrects inside the same turn rather than answering from the wrong table.
    const body = tools.slice(tools.indexOf('createMydataExpensesTool'));
    const gateAt = body.indexOf('mentionsMyDataFeed(turnText)');
    const queryAt = body.indexOf("from('inbound_documents')");
    expect(gateAt, 'the gate must exist').toBeGreaterThan(-1);
    expect(gateAt, 'the gate must run BEFORE the query').toBeLessThan(queryAt);
    expect(body.slice(gateAt, gateAt + 700)).toContain('list_recent_expenses');
  });

  it('exempts the status check and the quick-start click', () => {
    const body = tools.slice(tools.indexOf('createMydataExpensesTool'));
    // `status` returns no expense data — refusing it would only add a round trip.
    expect(body).toContain("act !== 'status'");
    // Clicking "From myDATA" IS naming it; the button says so.
    expect(body).toContain('explicitlyRequested');
  });

  it('is decided from what the person wrote, in agent-chat', () => {
    expect(chat).toContain('userTurnText(messages, userInput)');
    expect(chat).toContain("directTool?.name === 'list_mydata_expenses'");
  });

  it('says the rule in both descriptions, so selection agrees with the gate', () => {
    // A tool that is offered and then refuses is a worse experience than one that was never
    // chosen. The descriptions have to point the same way the gate does.
    const feed = tools.slice(tools.indexOf("name: 'list_mydata_expenses'"), tools.indexOf("name: 'list_mydata_expenses'") + 1400);
    expect(feed, 'the feed tool must state it is conditional').toMatch(/ONLY when/);
    expect(feed, 'and name the tool that handles the rest').toContain('list_recent_expenses');

    const ledger = tools.slice(tools.indexOf("name: 'list_recent_expenses'"), tools.indexOf("name: 'list_recent_expenses'") + 1400);
    expect(ledger, 'the ledger tool must claim the default').toMatch(/THE tool for expenses/);
    // "expenses from myDATA" that ARE in our books is a `source` filter here, not the feed.
    expect(ledger).toContain('source');
  });
});
