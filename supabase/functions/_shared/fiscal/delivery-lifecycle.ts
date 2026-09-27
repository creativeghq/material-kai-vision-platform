import { MYDATA_DELIVERY_EVENT_METHODS, MYDATA_DELIVERY_STATUSES } from './fiscalVocabulary.generated.ts';

export const MYDATA_PRODUCTION_BASE = 'https://mydatapi.aade.gr/myDATA';

export interface DeliveryEventForFiling {
  event_type: string;
  event_timestamp: string;
  actor_vat: string | null;
  actor_role: string | null;
  vehicle_number: string | null;
  transport_type: number | null;
  carrier_vat_number: string | null;
  p_number: string | null;
  location_longitude: number | string | null;
  location_latitude: number | string | null;
  outcome: string | null;
  delivered_without_recipient: boolean | null;
  rejection_reason: string | null;
  packaging: { packagingType?: number; quantity?: number; otherPackagingTypeTitle?: string | null }[] | null;
}

export interface DeliveryNoteForFiling {
  fiscal_mark: string | null;
  fiscal_aade_qr_url: string | null;
}

export interface DeliveryRequest {
  method: string;
  markField: string;
  body: string;
}

function xmlText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const el = (name: string, value: string | number | boolean) => `<${name}>${xmlText(String(value))}</${name}>`;

export function normalizeVat(v: string | null | undefined): string {
  const s = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  return /^(EL|GR)\d+$/.test(s) ? s.slice(2) : s;
}

function xsDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function packagingXml(tag: string, rows: DeliveryEventForFiling['packaging']): string {
  return (rows ?? []).map((p) =>
    `<${tag}>${el('packagingType', Number(p.packagingType))}${el('quantity', Number(p.quantity))}`
    + (p.otherPackagingTypeTitle ? el('otherPackagingTypeTitle', p.otherPackagingTypeTitle) : '')
    + `</${tag}>`).join('');
}

export function deliveryRequestProblems(
  e: DeliveryEventForFiling, note: DeliveryNoteForFiling, ourVat: string,
): string[] {
  const out: string[] = [];
  const route = MYDATA_DELIVERY_EVENT_METHODS[e.event_type];
  if (!route) return [`"${e.event_type}" is not an AADE delivery event.`];
  if (!note.fiscal_mark) out.push('The movement itself has no MARK yet, so AADE has nothing to attach this leg to. Transmit the delivery note first.');
  const needsQr = route.method !== 'RejectDeliveryNote';
  if (needsQr && !note.fiscal_aade_qr_url) out.push('The movement has no AADE QR URL, which this call identifies it by.');

  const actor = normalizeVat(e.actor_vat);
  if (!ourVat) out.push('Your own ΑΦΜ is not set in Finance → Settings.');
  else if (actor && actor !== ourVat) {
    out.push(`This leg was declared by ΑΦΜ ${actor}. AADE identifies the caller by its own credentials, so only that party can file it.`);
  }

  for (const p of e.packaging ?? []) {
    const t = Number(p.packagingType);
    if (!Number.isInteger(t) || t < 1 || t > 6) out.push(`Packaging type ${p.packagingType} is not one of AADE's 1–6.`);
    if (!(Number(p.quantity) > 0)) out.push('A packaging quantity must be greater than 0.');
    if (t === 6 && !p.otherPackagingTypeTitle) out.push('Packaging type 6 (Other) needs a title.');
  }

  if (route.method === 'RegisterTransfer') {
    const carrier = normalizeVat(e.carrier_vat_number) || (e.actor_role === 'carrier' ? actor : '');
    if (!e.vehicle_number) out.push('The vehicle number is required to start or tranship a movement.');
    else if (e.vehicle_number.length > 50) out.push('The vehicle number is longer than AADE accepts (50).');
    const tt = Number(e.transport_type);
    if (!Number.isInteger(tt) || tt < 1 || tt > 7) out.push('The vehicle type must be one of AADE\'s 1–7.');
    if (!carrier) out.push('The carrier ΑΦΜ is required to start or tranship a movement.');
    else if (carrier.length > 20) out.push('The carrier ΑΦΜ is longer than AADE accepts (20).');
    if (e.p_number && e.p_number.length > 50) out.push('The trailer («Ρ») plate is longer than AADE accepts (50).');
  }
  if (route.method === 'ConfirmDeliveryOutcome') {
    if (!['FULL', 'PARTIAL', 'NONE'].includes(String(e.outcome))) out.push('The outcome must be FULL, PARTIAL or NONE.');
    if (e.outcome === 'PARTIAL' && !(e.packaging ?? []).length) {
      out.push('A PARTIAL outcome must list the packages that were delivered (AADE error 814).');
    }
  }
  if (route.method === 'RejectDeliveryNote') {
    if (!note.fiscal_aade_qr_url && !note.fiscal_mark) out.push('Rejection needs the movement\'s QR URL or MARK.');
    if (e.rejection_reason && e.rejection_reason.length > 150) out.push('The rejection reason is longer than AADE accepts (150).');
  }
  return out;
}

export function buildDeliveryRequest(e: DeliveryEventForFiling, note: DeliveryNoteForFiling): DeliveryRequest {
  const route = MYDATA_DELIVERY_EVENT_METHODS[e.event_type];
  if (!route) throw new Error(`"${e.event_type}" is not an AADE delivery event`);
  const qr = String(note.fiscal_aade_qr_url ?? '');
  const head = '<?xml version="1.0" encoding="UTF-8"?>';
  let body: string;

  switch (route.method) {
    case 'RegisterTransfer': {
      const carrier = normalizeVat(e.carrier_vat_number) || normalizeVat(e.actor_vat);
      const hasLocation = e.location_longitude != null && e.location_latitude != null
        && e.location_longitude !== '' && e.location_latitude !== '';
      body = '<Transport>' + el('qrUrl', qr) + '<transportDetail>'
        + el('vehicleNumber', String(e.vehicle_number ?? ''))
        + el('transportType', Number(e.transport_type))
        + el('timeStamp', xsDateTime(e.event_timestamp))
        + el('carrierVatNumber', carrier)
        + (e.p_number ? el('pNumber', e.p_number) : '')
        + (hasLocation
          ? '<location>' + el('longitude', String(e.location_longitude)) + el('latitude', String(e.location_latitude)) + '</location>'
          : '')
        + packagingXml('packingsDeclaration', e.packaging)
        + '</transportDetail></Transport>';
      break;
    }
    case 'ConfirmDeliveryOutcome':
      body = '<ConfirmDeliveryOutcomeRequest>' + el('qrUrl', qr) + el('outcome', String(e.outcome))
        + (e.delivered_without_recipient != null ? el('deliveredWithoutRecipient', e.delivered_without_recipient) : '')
        + packagingXml('deliveredPackaging', e.packaging)
        + '</ConfirmDeliveryOutcomeRequest>';
      break;
    case 'RejectDeliveryNote':
      body = '<RejectDeliveryNoteRequest>'
        + (qr ? el('qrUrl', qr) : el('invoiceMark', String(note.fiscal_mark ?? '')))
        + (e.rejection_reason ? el('rejectionReason', e.rejection_reason) : '')
        + '</RejectDeliveryNoteRequest>';
      break;
    case 'ConfirmDeliveryReturn':
      body = '<ConfirmDeliveryReturnRequest>' + el('qrUrl', qr) + '</ConfirmDeliveryReturnRequest>';
      break;
    default:
      throw new Error(`no request shape for ${route.method}`);
  }
  return { method: route.method, markField: route.markField, body: head + body };
}

export type DeliveryOutcome =
  | { kind: 'accepted'; mark: string; statusCode: string }
  | { kind: 'refused'; statusCode: string; errors: string[] }
  | { kind: 'indeterminate'; statusCode: string; reason: string };

function tag(body: string, name: string): string | undefined {
  return body.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${name}>`, 'i'))?.[1]?.trim();
}

/** Only a DEFINITE refusal may be resent; anything else without a MARK may be registered at AADE. */
export function parseDeliveryResponse(httpStatus: number, body: string, markField: string): DeliveryOutcome {
  const statusCode = tag(body, 'statusCode') ?? `HTTP ${httpStatus}`;
  const messages = [...body.matchAll(/<(?:\w+:)?message>([^<]*)<\/(?:\w+:)?message>/gi)].map((m) => m[1].trim());
  const codes = [...body.matchAll(/<(?:\w+:)?code>([^<]*)<\/(?:\w+:)?code>/gi)].map((m) => m[1].trim());
  const errors = messages.map((m, i) => (codes[i] ? `${codes[i]}: ${m}` : m));

  if (httpStatus >= 200 && httpStatus < 300) {
    if (statusCode === 'Success') {
      const mark = tag(body, markField);
      return mark
        ? { kind: 'accepted', mark, statusCode }
        : { kind: 'indeterminate', statusCode, reason: `AADE answered Success with no ${markField}.` };
    }
    if (statusCode === 'ValidationError' || statusCode === 'XMLSyntaxError') {
      return { kind: 'refused', statusCode, errors: errors.length ? errors : [statusCode] };
    }
    return { kind: 'indeterminate', statusCode, reason: errors.join(' · ') || `AADE answered ${statusCode}.` };
  }
  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403) {
    const text = errors.length ? errors.join(' · ') : body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    return {
      kind: 'refused',
      statusCode,
      errors: [httpStatus === 400 ? (text || 'AADE refused the request (400).') : `AADE refused the credentials (${httpStatus}). ${text}`.trim()],
    };
  }
  return { kind: 'indeterminate', statusCode, reason: `AADE answered HTTP ${httpStatus}.` };
}

export interface DeliveryHistoryEvent {
  eventType: string;
  eventTimestamp: string;
  actorVat: string;
  mark: string | null;
}

export interface DeliveryNoteStatus {
  invoiceMark: string | null;
  statusCode: number | null;
  statusRaw: string | null;
  dispatchTimestamp: string | null;
  history: DeliveryHistoryEvent[];
}

export function parseDeliveryStatus(body: string): DeliveryNoteStatus {
  const statusRaw = tag(body, 'status') ?? null;
  let statusCode: number | null = null;
  if (statusRaw != null) {
    const n = Number(statusRaw);
    const norm = statusRaw.replace(/[\s()]/g, '').toLowerCase();
    const row = Number.isFinite(n) && statusRaw !== ''
      ? MYDATA_DELIVERY_STATUSES.find((s) => s.code === n)
      : MYDATA_DELIVERY_STATUSES.find((s) => s.key.toLowerCase() === norm);
    statusCode = row?.code ?? null;
  }
  const history = [...body.matchAll(/<(?:\w+:)?lifecycleHistory(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?lifecycleHistory>/gi)]
    .map((m) => {
      const own = m[1].replace(/<(?:\w+:)?(transportDetails|outcomeDetails|rejectionDetails)[\s\S]*?<\/(?:\w+:)?\1>/gi, '');
      return {
        eventType: tag(own, 'eventType') ?? '',
        eventTimestamp: tag(own, 'eventTimestamp') ?? '',
        actorVat: normalizeVat(tag(own, 'actorVat')),
        mark: tag(own, 'mark') ?? null,
      };
    });
  return {
    invoiceMark: tag(body, 'invoiceMark') ?? null,
    statusCode,
    statusRaw,
    dispatchTimestamp: tag(body, 'dispatchTimestamp') ?? null,
    history,
  };
}

const TRANSFER_EVENTS = new Set(['RegisterTransfer', 'RegisterTransferReturn']);

/** A transfer matches either transfer name: AADE, not the caller, decides whether it is a return. */
export function matchHistoryEvent(
  leg: { event_type: string; claimed_at: string; event_timestamp?: string | null },
  ourVat: string,
  history: DeliveryHistoryEvent[],
  marksInUse: ReadonlySet<string>,
  slackMs = 10 * 60_000,
): DeliveryHistoryEvent | null {
  // RegisterTransfer files the leg's own timestamp, which precedes the claim for a leg recorded offline.
  const since = Math.min(
    new Date(leg.claimed_at).getTime(),
    leg.event_timestamp ? new Date(leg.event_timestamp).getTime() : Number.POSITIVE_INFINITY,
  ) - slackMs;
  const sameEvent = (t: string) => t === leg.event_type || (TRANSFER_EVENTS.has(t) && TRANSFER_EVENTS.has(leg.event_type));
  return history.find((h) =>
    h.mark && !marksInUse.has(h.mark) && sameEvent(h.eventType) && h.actorVat === ourVat
    && new Date(h.eventTimestamp).getTime() >= since) ?? null;
}
