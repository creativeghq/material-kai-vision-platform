// deno-lint-ignore-file no-explicit-any
// ShipsGo container-tracking adapter for inbound shipments (W4).
//
// ⚠️ VERIFY BEFORE ACTIVATION: ShipsGo exposes several tracking products and API versions. The exact
// endpoint paths + JSON field names below are a best-effort against ShipsGo v2 and MUST be confirmed
// against your live ShipsGo API docs/plan before go-live. To make that a one-file change, the base URL
// and the two paths are env-overridable, and the response parser is defensive (it reads whichever of
// several common field names is present) so it degrades gracefully rather than throwing on shape drift.
//
// Contract this module exposes to the rest of the platform (stable, provider-agnostic):
//   trackShipment(key, { reference, tracking_type, carrier? }) -> NormalizedShipment
// The stock-api shipment actions only ever see NormalizedShipment, so swapping ShipsGo for Vizion/
// Terminal49 later is a new adapter file, not a rewrite.

export interface NormalizedMilestone {
  code: string | null;
  name: string;
  date: string | null;      // ISO date/datetime if known
  location: string | null;
  status: 'past' | 'current' | 'future' | 'unknown';
}

export interface NormalizedShipment {
  status: string;            // normalized milestone key (see NORMALIZED_STATUSES)
  eta: string | null;        // ISO date
  carrier: string | null;
  origin: string | null;
  destination: string | null;
  last_event: string | null;
  provider_ref: string | null;
  milestones: NormalizedMilestone[];
  raw: any;
}

export const NORMALIZED_STATUSES = [
  'pending', 'booked', 'gate_in', 'loaded', 'departed', 'in_transit',
  'arrived', 'discharged', 'gate_out', 'delivered', 'unknown',
] as const;

const BASE = () => Deno.env.get('SHIPSGO_BASE_URL') || 'https://api.shipsgo.com/v2';
// Endpoint paths — override via env if your ShipsGo plan differs.
const ADD_PATH = () => Deno.env.get('SHIPSGO_ADD_PATH') || '/ocean/shipments';
const GET_PATH = () => Deno.env.get('SHIPSGO_GET_PATH') || '/ocean/shipments';

function authHeaders(key: string): Record<string, string> {
  // ShipsGo uses a user-token header; some plans accept a Bearer token. Send both defensively.
  return {
    'content-type': 'application/json',
    'X-Shipsgo-User-Token': key,
    'Authorization': `Bearer ${key}`,
  };
}

/** Map a provider status string onto our normalized milestone vocabulary. */
export function normalizeStatus(raw: string | null | undefined): string {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (/deliver/.test(s)) return 'delivered';
  if (/gate\s*out|empty\s*return|available/.test(s)) return 'gate_out';
  if (/discharg|unload/.test(s)) return 'discharged';
  if (/arriv|at\s*(pod|destination)|berth/.test(s)) return 'arrived';
  if (/sail|depart|vessel\s*depart/.test(s)) return 'departed';
  if (/load|on\s*board/.test(s)) return 'loaded';
  if (/gate\s*in|received/.test(s)) return 'gate_in';
  if (/transit|sea/.test(s)) return 'in_transit';
  if (/book/.test(s)) return 'booked';
  return 'unknown';
}

function firstOf(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return null;
}

function parseShipment(payload: any): NormalizedShipment {
  // ShipsGo responses vary (array vs { data } vs { shipment }); unwrap to a single record.
  let rec: any = payload;
  if (Array.isArray(payload)) rec = payload[0] ?? {};
  else rec = firstOf(payload, ['data', 'shipment', 'result']) ?? payload;
  if (Array.isArray(rec)) rec = rec[0] ?? {};

  const rawStatus = firstOf(rec, ['status', 'statusName', 'shipmentStatus', 'currentStatus']);
  const eta = firstOf(rec, ['eta', 'estimatedArrival', 'estimatedTimeOfArrival', 'podEta', 'arrivalDate']);
  const carrier = firstOf(rec, ['carrier', 'shippingLine', 'carrierName', 'line']);
  const origin = firstOf(rec, ['origin', 'pol', 'portOfLoading', 'from']);
  const destination = firstOf(rec, ['destination', 'pod', 'portOfDischarge', 'to']);
  const providerRef = firstOf(rec, ['id', 'shipmentId', 'referenceId', 'trackingId']);

  const rawMs: any[] = firstOf(rec, ['movements', 'milestones', 'events', 'tsevents', 'route']) ?? [];
  const milestones: NormalizedMilestone[] = (Array.isArray(rawMs) ? rawMs : []).map((m: any) => ({
    code: firstOf(m, ['code', 'eventCode', 'type']) as string | null,
    name: String(firstOf(m, ['name', 'event', 'description', 'status', 'eventName']) ?? 'Event'),
    date: firstOf(m, ['date', 'eventDate', 'timestamp', 'time', 'actualDate', 'plannedDate']) as string | null,
    location: firstOf(m, ['location', 'port', 'place', 'locationName']) as string | null,
    status: (() => {
      const st = String(firstOf(m, ['status', 'state']) ?? '').toLowerCase();
      if (/actual|past|complete|done/.test(st)) return 'past' as const;
      if (/current|now/.test(st)) return 'current' as const;
      if (/planned|estimate|future|expected/.test(st)) return 'future' as const;
      return 'unknown' as const;
    })(),
  }));

  const lastEvent = milestones.length ? milestones[milestones.length - 1].name : (rawStatus ? String(rawStatus) : null);

  return {
    status: normalizeStatus(rawStatus),
    eta: eta ? String(eta).slice(0, 10) : null,
    carrier: carrier ? String(carrier) : null,
    origin: origin ? String(origin) : null,
    destination: destination ? String(destination) : null,
    last_event: lastEvent,
    provider_ref: providerRef ? String(providerRef) : null,
    milestones,
    raw: rec,
  };
}

export interface TrackInput {
  reference: string;
  tracking_type: 'container' | 'bl' | 'booking';
  carrier?: string | null;
}

/**
 * Register + fetch a shipment from ShipsGo. Returns normalized data. Throws on transport / auth error.
 * The `register` POST is the billable step (ShipsGo charges per container tracked); on a duplicate
 * container ShipsGo returns the existing record, so re-adding is idempotent on their side.
 */
export async function trackShipment(key: string, input: TrackInput): Promise<NormalizedShipment> {
  const refKey = input.tracking_type === 'bl' ? 'blNumber'
    : input.tracking_type === 'booking' ? 'bookingNumber' : 'containerNumber';
  const body: Record<string, unknown> = { [refKey]: input.reference };
  if (input.carrier) body.shippingLine = input.carrier;

  // 1) register for tracking (idempotent on ShipsGo; returns existing if already tracked)
  const addRes = await fetch(`${BASE()}${ADD_PATH()}`, { method: 'POST', headers: authHeaders(key), body: JSON.stringify(body) });
  // 200/201 = created/exists. 409 = already tracked (fine — fall through to GET).
  if (!addRes.ok && addRes.status !== 409) {
    const txt = await addRes.text().catch(() => '');
    throw new Error(`ShipsGo add failed (${addRes.status})${txt ? `: ${txt.slice(0, 200)}` : ''}`);
  }
  let payload: any = null;
  try { payload = await addRes.json(); } catch { /* some plans return empty on add */ }

  // 2) fetch current status (query by the same reference)
  const q = new URLSearchParams({ [refKey]: input.reference });
  const getRes = await fetch(`${BASE()}${GET_PATH()}?${q.toString()}`, { headers: authHeaders(key) });
  if (getRes.ok) {
    try { payload = await getRes.json(); } catch { /* keep add payload */ }
  }
  if (!payload) throw new Error('ShipsGo returned no shipment data');
  return parseShipment(payload);
}

/** Re-fetch an already-tracked shipment (free — no new container registered). */
export async function refreshShipment(key: string, input: TrackInput): Promise<NormalizedShipment> {
  const refKey = input.tracking_type === 'bl' ? 'blNumber'
    : input.tracking_type === 'booking' ? 'bookingNumber' : 'containerNumber';
  const q = new URLSearchParams({ [refKey]: input.reference });
  const getRes = await fetch(`${BASE()}${GET_PATH()}?${q.toString()}`, { headers: authHeaders(key) });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => '');
    throw new Error(`ShipsGo refresh failed (${getRes.status})${txt ? `: ${txt.slice(0, 200)}` : ''}`);
  }
  const payload = await getRes.json();
  return parseShipment(payload);
}
