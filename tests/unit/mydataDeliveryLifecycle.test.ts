import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeliveryRequest, deliveryRequestProblems, matchHistoryEvent, parseDeliveryResponse,
  parseDeliveryStatus, type DeliveryEventForFiling,
} from '../../supabase/functions/_shared/fiscal/delivery-lifecycle';
import { MYDATA_DELIVERY_EVENT_METHODS } from '../../supabase/functions/_shared/fiscal/fiscalVocabulary.generated';
import { deliveryFilingState } from '../../src/modules/finance/deliveryLifecycleRules';
import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const note = { fiscal_mark: '400001234567890', fiscal_aade_qr_url: 'https://mydata.aade.gr/qr?x=1&y=2' };
const OUR_VAT = '802349569';

const leg = (over: Partial<DeliveryEventForFiling> = {}): DeliveryEventForFiling => ({
  event_type: 'RegisterTransfer',
  event_timestamp: '2026-10-12T08:30:00.123Z',
  actor_vat: 'EL802349569',
  actor_role: 'carrier',
  vehicle_number: 'ΙΚΥ-1234',
  transport_type: 2,
  carrier_vat_number: null,
  p_number: null,
  location_longitude: null,
  location_latitude: null,
  outcome: null,
  delivered_without_recipient: null,
  rejection_reason: null,
  packaging: [],
  ...over,
});

/** Element names in document order, attributes and text dropped. */
const tags = (xml: string) => [...xml.replace(/^<\?xml[^>]*\?>/, '').matchAll(/<([A-Za-z]+)[\s>]/g)].map((m) => m[1]);

describe('the ΨΔΑ lifecycle requests match the v2.0.2 XSDs', () => {
  it('RegisterTransfer is a Transport element with TransportDetailType in schema order', () => {
    const r = buildDeliveryRequest(leg({
      p_number: 'Ρ-55', location_longitude: '23.72', location_latitude: '37.98',
      packaging: [{ packagingType: 1, quantity: 3 }],
    }), note);
    expect(r.method).toBe('RegisterTransfer');
    expect(r.markField).toBe('transferMark');
    expect(tags(r.body)).toEqual([
      'Transport', 'qrUrl', 'transportDetail', 'vehicleNumber', 'transportType', 'timeStamp',
      'carrierVatNumber', 'pNumber', 'location', 'longitude', 'latitude',
      'packingsDeclaration', 'packagingType', 'quantity',
    ]);
    expect(r.body).not.toMatch(/transferMark|xmlns/);
    expect(r.body).toContain('<carrierVatNumber>802349569</carrierVatNumber>');
    expect(r.body).toContain('<timeStamp>2026-10-12T08:30:00Z</timeStamp>');
    expect(r.body).toContain('x=1&amp;y=2');
  });

  it('the return leg uses the same method', () => {
    expect(buildDeliveryRequest(leg({ event_type: 'RegisterTransferReturn' }), note).method).toBe('RegisterTransfer');
  });

  it('ConfirmDeliveryOutcome carries outcome, the no-recipient flag and deliveredPackaging', () => {
    const r = buildDeliveryRequest(leg({
      event_type: 'ConfirmOutcome', outcome: 'PARTIAL', delivered_without_recipient: false,
      packaging: [{ packagingType: 6, quantity: 2, otherPackagingTypeTitle: 'Κιβώτια πλακιδίων' }],
    }), note);
    expect(r).toMatchObject({ method: 'ConfirmDeliveryOutcome', markField: 'deliveryOutcomeMark' });
    expect(tags(r.body)).toEqual([
      'ConfirmDeliveryOutcomeRequest', 'qrUrl', 'outcome', 'deliveredWithoutRecipient',
      'deliveredPackaging', 'packagingType', 'quantity', 'otherPackagingTypeTitle',
    ]);
  });

  it('RejectDeliveryNote sends exactly one of qrUrl / invoiceMark', () => {
    const withQr = buildDeliveryRequest(leg({ event_type: 'Rejection', actor_role: 'recipient', rejection_reason: 'Λάθος είδος' }), note);
    expect(withQr).toMatchObject({ method: 'RejectDeliveryNote', markField: 'rejectMark' });
    expect(tags(withQr.body)).toEqual(['RejectDeliveryNoteRequest', 'qrUrl', 'rejectionReason']);
    const byMark = buildDeliveryRequest(leg({ event_type: 'Rejection' }), { ...note, fiscal_aade_qr_url: null });
    expect(tags(byMark.body)).toEqual(['RejectDeliveryNoteRequest', 'invoiceMark']);
  });

  it('ConfirmDeliveryReturn is the QR alone', () => {
    const r = buildDeliveryRequest(leg({ event_type: 'ConfirmReturn', actor_role: 'sender' }), note);
    expect(r).toMatchObject({ method: 'ConfirmDeliveryReturn', markField: 'deliveryReturnMark' });
    expect(tags(r.body)).toEqual(['ConfirmDeliveryReturnRequest', 'qrUrl']);
  });

  it('every root and element name is declared in the XSD the method binds to', () => {
    const xsdDir = join(ROOT, 'src/modules/myaade/AadeSpec/v2.0.2/xsd');
    let transport = '';
    try { transport = readFileSync(join(xsdDir, 'TransportTypes-v2.0.2.xsd'), 'utf8'); } catch { return; }
    const files: Record<string, string> = {
      RegisterTransfer: 'RegisterTransfer', ConfirmDeliveryOutcome: 'ConfirmDeliveryOutcome',
      RejectDeliveryNote: 'RejectDeliveryNote', ConfirmDeliveryReturn: 'ConfirmDeliveryReturn',
    };
    const samples = [
      leg({ p_number: 'P', location_longitude: 1, location_latitude: 2, packaging: [{ packagingType: 6, quantity: 1, otherPackagingTypeTitle: 'x' }] }),
      leg({ event_type: 'ConfirmOutcome', outcome: 'FULL', delivered_without_recipient: true, packaging: [{ packagingType: 1, quantity: 1 }] }),
      leg({ event_type: 'Rejection', rejection_reason: 'r' }),
      leg({ event_type: 'ConfirmReturn' }),
    ];
    for (const s of samples) {
      const r = buildDeliveryRequest(s, note);
      const xsd = readFileSync(join(xsdDir, `${files[r.method]}-v2.0.2.xsd`), 'utf8') + transport;
      const declared = new Set([...xsd.matchAll(/<xs:element name="([^"]+)"/g)].map((m) => m[1]));
      for (const t of tags(r.body)) expect(declared.has(t), `${r.method}: <${t}> is not in the XSD`).toBe(true);
    }
  });

  it('the event→method table covers exactly the five AADE event types', () => {
    expect(Object.keys(MYDATA_DELIVERY_EVENT_METHODS).sort()).toEqual(
      ['ConfirmOutcome', 'ConfirmReturn', 'RegisterTransfer', 'RegisterTransferReturn', 'Rejection'],
    );
  });
});

describe('what is refused before anything is claimed', () => {
  it('a leg declared by another party is not filed under our credentials', () => {
    const p = deliveryRequestProblems(leg({ event_type: 'ConfirmOutcome', outcome: 'FULL', actor_vat: '094014201', actor_role: 'recipient' }), note, OUR_VAT);
    expect(p.join(' ')).toMatch(/only that party can file it/);
  });
  it('a movement with no MARK has nothing to attach to', () => {
    expect(deliveryRequestProblems(leg(), { fiscal_mark: null, fiscal_aade_qr_url: null }, OUR_VAT).join(' ')).toMatch(/no MARK/);
  });
  it('RegisterTransfer needs vehicle, a 1–7 type and a carrier', () => {
    const p = deliveryRequestProblems(leg({ vehicle_number: null, transport_type: 9, actor_role: 'sender' }), note, OUR_VAT).join(' ');
    expect(p).toMatch(/vehicle number/);
    expect(p).toMatch(/1–7/);
    expect(p).toMatch(/carrier ΑΦΜ/);
  });
  it('PARTIAL without delivered packages is AADE error 814', () => {
    expect(deliveryRequestProblems(leg({ event_type: 'ConfirmOutcome', outcome: 'PARTIAL' }), note, OUR_VAT).join(' ')).toMatch(/814/);
  });
  it('a clean leg has no problems', () => {
    expect(deliveryRequestProblems(leg(), note, OUR_VAT)).toEqual([]);
  });
});

describe('the ResponseDoc verdict', () => {
  const doc = (inner: string) => `<?xml version="1.0"?><ResponseDoc xmlns:xsi="x"><response><index>1</index>${inner}</response></ResponseDoc>`;

  it('reads the MARK from the method\'s own field, never a neighbour', () => {
    const body = doc('<transferMark>400000000000123</transferMark><statusCode>Success</statusCode>');
    expect(parseDeliveryResponse(200, body, 'transferMark')).toEqual({ kind: 'accepted', mark: '400000000000123', statusCode: 'Success' });
    expect(parseDeliveryResponse(200, body, 'deliveryOutcomeMark').kind).toBe('indeterminate');
  });
  it('ValidationError is a definite refusal that may be corrected and resent', () => {
    const r = parseDeliveryResponse(200, doc('<errors><error><message>Not Found QR!</message><code>806</code></error></errors><statusCode>ValidationError</statusCode>'), 'transferMark');
    expect(r).toEqual({ kind: 'refused', statusCode: 'ValidationError', errors: ['806: Not Found QR!'] });
  });
  it('TechnicalError, 5xx and unreadable bodies are indeterminate — never "not sent"', () => {
    expect(parseDeliveryResponse(200, doc('<errors><error><message>Unexpected</message><code>-</code></error></errors><statusCode>TechnicalError</statusCode>'), 'rejectMark').kind).toBe('indeterminate');
    expect(parseDeliveryResponse(502, 'Bad gateway', 'rejectMark').kind).toBe('indeterminate');
    expect(parseDeliveryResponse(200, '', 'rejectMark').kind).toBe('indeterminate');
  });
  it('401 is a refusal of the credentials', () => {
    const r = parseDeliveryResponse(401, 'Access Key does not correspond to given User Id', 'transferMark');
    expect(r.kind).toBe('refused');
  });
});

describe('GetDeliveryNoteStatus and reconciliation', () => {
  const status = `<GetDeliveryNoteStatusResponse><invoiceMark>400001234567890</invoiceMark><status>InTransit</status>
    <dispatchTimestamp>2026-10-12T08:31:00</dispatchTimestamp>
    <lifecycleHistory><eventType>RegisterTransferReturn</eventType><eventTimestamp>2026-10-12T08:31:00Z</eventTimestamp>
      <actorVat>EL802349569</actorVat><mark>400000000000999</mark>
      <transportDetails><vehicleNumber>X</vehicleNumber><transportType>2</transportType><carrierVatNumber>802349569</carrierVatNumber></transportDetails>
    </lifecycleHistory></GetDeliveryNoteStatusResponse>`;

  it('parses the status and each history event\'s own fields', () => {
    const s = parseDeliveryStatus(status);
    expect(s.statusCode).toBe(3);
    expect(s.history).toEqual([{ eventType: 'RegisterTransferReturn', eventTimestamp: '2026-10-12T08:31:00Z', actorVat: OUR_VAT, mark: '400000000000999' }]);
    expect(parseDeliveryStatus('<status>InTransit (Return)</status>').statusCode).toBe(9);
    expect(parseDeliveryStatus('<status>6</status>').statusCode).toBeNull();
  });

  it('a lost transfer matches either transfer name, once, and only for our VAT', () => {
    const { history } = parseDeliveryStatus(status);
    const lost = { event_type: 'RegisterTransfer', claimed_at: '2026-10-12T08:30:59Z' };
    expect(matchHistoryEvent(lost, OUR_VAT, history, new Set())?.mark).toBe('400000000000999');
    expect(matchHistoryEvent(lost, OUR_VAT, history, new Set(['400000000000999']))).toBeNull();
    expect(matchHistoryEvent(lost, '094014201', history, new Set())).toBeNull();
    expect(matchHistoryEvent({ ...lost, event_type: 'Rejection' }, OUR_VAT, history, new Set())).toBeNull();
    expect(matchHistoryEvent({ ...lost, claimed_at: '2026-10-12T10:00:00Z' }, OUR_VAT, history, new Set())).toBeNull();
  });
});

describe('the filing state the UI shows', () => {
  const base = { mark: null, transmitted_at: null, transmission_claim_token: null, transmission_claimed_at: null, transmission_indeterminate_at: null, transmission_error: null };
  const now = Date.parse('2026-10-12T09:00:00Z');
  it('a claim without a MARK is never "not filed"', () => {
    expect(deliveryFilingState({ ...base, transmission_claim_token: 't', transmission_claimed_at: '2026-10-12T08:59:30Z' }, now)).toBe('sending');
    expect(deliveryFilingState({ ...base, transmission_claim_token: 't', transmission_claimed_at: '2026-10-12T08:00:00Z' }, now)).toBe('unknown');
    expect(deliveryFilingState({ ...base, transmission_claim_token: 't', transmission_claimed_at: '2026-10-12T08:59:30Z', transmission_indeterminate_at: '2026-10-12T08:59:40Z' }, now)).toBe('unknown');
  });
  it('filed, refused and never sent are distinct', () => {
    expect(deliveryFilingState({ ...base, mark: '1', transmitted_at: 'x' }, now)).toBe('filed');
    expect(deliveryFilingState({ ...base, transmission_error: '806: Not Found QR!' }, now)).toBe('refused');
    expect(deliveryFilingState(base, now)).toBe('not_sent');
  });
});

describe('the edge function', () => {
  const src = blankComments(readFileSync(join(ROOT, 'supabase/functions/finance-mydata-delivery/index.ts'), 'utf8'));
  it('claims the leg before the AADE call, and the claim is conditional', () => {
    const claim = src.indexOf("transmission_claim_token: token");
    const call = src.indexOf('fetch(`${baseOf(creds)}/${request.method}`');
    expect(claim).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(claim);
    expect(src.slice(claim, call)).toMatch(/\.is\('transmitted_at', null\)\.is\('transmission_claim_token', null\)/);
  });
  it('derives the workspace from the row and checks access', () => {
    expect(src).toMatch(/const workspaceId = note\.workspace_id;/);
    expect(src).not.toMatch(/body\?\.workspace_id/);
    expect(src).toMatch(/userCanAccessWorkspace\(service, auth\.userId, workspaceId\)/);
  });
  it('uses only the workspace\'s own credentials', () => {
    expect(src).toMatch(/workspace_inbound_credentials/);
    expect(src).not.toMatch(/resolveSecret|Deno\.env/);
  });
});
