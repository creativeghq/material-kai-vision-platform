
export const VISIT_PURPOSES = [
  { key: 'showroom', label: 'Showroom Visit', hint: 'See materials, tiles and finishes in person' },
  { key: 'selection', label: 'Material Selection', hint: 'Choose and sign off tiles, surfaces, fittings' },
  { key: 'presentation', label: 'Design Presentation', hint: 'Walk through the kitchen or room design' },
  { key: 'survey', label: 'Site Survey & Measurement', hint: 'Measure the space on site' },
  { key: 'delivery', label: 'Delivery / Installation', hint: 'Goods arrive or fitters on site' },
  { key: 'call', label: 'Call', hint: 'A phone or video call' },
] as const;

export type VisitPurposeKey = (typeof VISIT_PURPOSES)[number]['key'];

