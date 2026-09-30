
export const VISIT_PURPOSES = [
  { key: 'showroom', label: 'Showroom visit', hint: 'See materials, tiles and finishes in person' },
  { key: 'selection', label: 'Material selection', hint: 'Choose and sign off tiles, surfaces, fittings' },
  { key: 'presentation', label: 'Design presentation', hint: 'Walk through the kitchen or room design' },
  { key: 'survey', label: 'Site survey & measurement', hint: 'Measure the space on site' },
  { key: 'delivery', label: 'Delivery / installation', hint: 'Goods arrive or fitters on site' },
  { key: 'call', label: 'Call', hint: 'A phone or video call' },
] as const;

export type VisitPurposeKey = (typeof VISIT_PURPOSES)[number]['key'];

