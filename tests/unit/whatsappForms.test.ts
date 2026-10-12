import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import {
  WHATSAPP_FORM_SCREEN, buildWhatsAppFlowJson, fieldKeyFrom, formIdFromToken, renderWhatsAppFormSubmission,
  validateWhatsAppForm, whatsAppFormToken, type WhatsAppFormField,
} from '@/modules/messaging/whatsappForms';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

const FIELDS: WhatsAppFormField[] = [
  { key: 'product', label: 'Product', kind: 'text', required: true },
  { key: 'qty', label: 'Quantity', kind: 'number', required: true },
  { key: 'finish', label: 'Finish', kind: 'dropdown', required: false, options: ['Matt', 'Gloss'] },
];

describe('#369 WhatsApp forms — the Flow JSON', () => {
  it('is one terminal screen whose footer completes with every field', () => {
    const json = buildWhatsAppFlowJson({ title: 'Order', fields: FIELDS }) as any;
    const screen = json.screens[0];
    expect(json.screens).toHaveLength(1);
    expect(screen.id).toBe(WHATSAPP_FORM_SCREEN);
    expect(screen.terminal).toBe(true);
    const children = screen.layout.children;
    const footer = children[children.length - 1];
    expect(footer.type).toBe('Footer');
    expect(footer['on-click-action']).toEqual({
      name: 'complete',
      payload: { product: '${form.product}', qty: '${form.qty}', finish: '${form.finish}' },
    });
    expect(children[1]).toMatchObject({ type: 'TextInput', 'input-type': 'number' });
    expect(children[2]['data-source']).toEqual([{ id: 'opt_1', title: 'Matt' }, { id: 'opt_2', title: 'Gloss' }]);
  });

  it('refuses what Meta would refuse, in words', () => {
    expect(validateWhatsAppForm({ title: 'Order', fields: FIELDS })).toEqual([]);
    expect(validateWhatsAppForm({ title: '', fields: [] })).toHaveLength(2);
    const long = validateWhatsAppForm({ title: 'Order', fields: [{ key: 'a', label: 'x'.repeat(21), kind: 'text', required: false }] });
    expect(long.join(' ')).toMatch(/longer than 20/);
    const noOpts = validateWhatsAppForm({ title: 'Order', fields: [{ key: 'a', label: 'Pick', kind: 'dropdown', required: false, options: [] }] });
    expect(noOpts.join(' ')).toMatch(/at least one option/);
  });

  it('derives unique keys Meta accepts from any label', () => {
    const taken = new Set(['quantity']);
    expect(fieldKeyFrom('Quantity', taken)).toBe('quantity_2');
    expect(fieldKeyFrom('Ποσότητα', new Set())).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(fieldKeyFrom('2nd line', new Set())).toBe('field_2nd_line');
  });
});

describe('#369 WhatsApp forms — a submission', () => {
  const formId = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';

  it('names its form through the flow token we sent', () => {
    expect(formIdFromToken(whatsAppFormToken('1234567890', formId))).toBe(formId);
    expect(formIdFromToken('1234567890:not-a-uuid')).toBeNull();
    expect(formIdFromToken(undefined)).toBeNull();
  });

  it('reads as the labelled answers, option ids turned back into words', () => {
    const text = renderWhatsAppFormSubmission({ name: 'Order request', fields: FIELDS }, { qty: '12', product: 'Oak plank', finish: 'opt_2' });
    expect(text.split('\n')).toEqual(['📋 Order request — submitted', 'Product: Oak plank', 'Quantity: 12', 'Finish: Gloss']);
  });

  it('is filed as the message body BEFORE the insert, so order intake reads it like a typed order', () => {
    const hook = read('supabase/functions/zernio-webhook-handler/index.ts');
    const inbound = hook.slice(hook.indexOf('async function handleInboundMessage('));
    const read_ = inbound.indexOf('await readFormSubmission(');
    const insert = inbound.indexOf('sender_participant_id: senderParticipantId,');
    expect(read_).toBeGreaterThan(-1);
    expect(read_).toBeLessThan(insert);
    expect(inbound.slice(insert, insert + 400)).toContain('body: bodyText');
    const reader = hook.slice(hook.indexOf('async function readFormSubmission('));
    expect(reader).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(reader).toContain("m.nfmReplyName === 'address_message'");
  });
});

describe('#369 WhatsApp forms — sending and managing', () => {
  it('a form is sent only inside the window, from its own number, after the opt-out check', () => {
    const api = read('supabase/functions/inbox-api/index.ts');
    const send = api.slice(api.indexOf("case 'send_whatsapp_form'"), api.indexOf("case 'send_whatsapp_template'"));
    const gate = send.indexOf('whyNotSendable(db, { workspaceId, to, isTemplate: false })');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(send.indexOf("'/whatsapp/flows/send'"));
    expect(send).toContain('form.zernio_account_id !== accountId');
    expect(send).toMatch(/\.eq\('workspace_id', workspaceId\)/);
  });

  it('building, publishing and retiring a form is an owner/admin act', () => {
    const api = read('supabase/functions/messaging-api/index.ts');
    for (const action of ['whatsapp-form-save', 'whatsapp-form-publish', 'whatsapp-form-retire']) {
      const start = api.indexOf(`case '${action}'`);
      const body = api.slice(start, api.indexOf('case ', start + 10));
      expect(body, action).toContain('await requireWorkspaceManager(');
    }
  });
});
