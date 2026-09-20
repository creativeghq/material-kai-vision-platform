export interface Carrier {
  code: string;
  name: string;
  urlTemplate: string;
}

export const CARRIERS: Carrier[] = [
  { code: 'acs', name: 'ACS Courier', urlTemplate: 'https://www.acscourier.net/el/track-and-trace?tracking_number={tracking}' },
  { code: 'geniki', name: 'Geniki Taxydromiki', urlTemplate: 'https://www.taxydromiki.com/track/{tracking}' },
  { code: 'speedex', name: 'Speedex', urlTemplate: 'https://www.speedex.gr/speedex/NewTrackAndTrace.aspx?number={tracking}' },
  { code: 'elta_courier', name: 'ELTA Courier', urlTemplate: 'https://www.elta-courier.gr/search?br={tracking}' },
  { code: 'courier_center', name: 'Courier Center', urlTemplate: 'https://www.courier.gr/track/result?tracking_number={tracking}' },
  { code: 'boxnow', name: 'BOX NOW', urlTemplate: 'https://boxnow.gr/track/{tracking}' },
  { code: 'dhl', name: 'DHL', urlTemplate: 'https://www.dhl.com/gr-en/home/tracking.html?tracking-id={tracking}' },
  { code: 'ups', name: 'UPS', urlTemplate: 'https://www.ups.com/track?tracknum={tracking}' },
  { code: 'fedex', name: 'FedEx', urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={tracking}' },
  { code: 'own_fleet', name: 'Our own vehicle', urlTemplate: '' },
  { code: 'customer_pickup', name: 'Customer collects', urlTemplate: '' },
  { code: 'other', name: 'Other carrier', urlTemplate: '' },
];

export const CARRIER_CODES = CARRIERS.map((c) => c.code);

export function carrierName(code: string | null | undefined): string {
  return CARRIERS.find((c) => c.code === code)?.name ?? (code ?? '—');
}

export function trackingUrlFor(code: string | null | undefined, tracking: string | null | undefined, stored?: string | null): string | null {
  if (stored && stored.trim()) return stored.trim();
  const t = String(tracking ?? '').trim();
  const tpl = CARRIERS.find((c) => c.code === code)?.urlTemplate;
  if (!t || !tpl) return null;
  return tpl.replace('{tracking}', encodeURIComponent(t));
}
