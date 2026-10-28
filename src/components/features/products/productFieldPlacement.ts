const RULES: Array<[string, RegExp]> = [
  ['compliance', /(^|_)(standard|certif\w*|compliant|compliance|approval|approved|norm|en|din|iso|ce|rohs|fire|reaction)($|_)/],
  ['packaging', /(^|_)(pack\w*|carton|pallet|box|boxes|crate|per_box|per_pallet)($|_)/],
  ['care', /(^|_)(clean\w*|maintenance|care|wash\w*)($|_)/],
  ['installation', /(^|_)(install\w*|mount\w*|bracket\w*|fix\w*|fitting|fittings|hang\w*|anchor\w*|screw\w*|clearance|spacing|connection\w*|pipe|supports?|plug)($|_)/],
  ['electrical_specs', /(^|_)(volt\w*|current|amp\w*|frequency|hz|ip|element|elements|electric\w*|phase|wattage)($|_)/],
  ['water_performance', /(^|_)(water|flow|drain\w*|absorption|bar|litres?|liters?|permeab\w*)($|_)/],
  ['thermal_performance', /(^|_)(heat\w*|thermal|temperature|temp|exponent|insulat\w*|conductiv\w*|delta|kw|u_value|r_value|lambda)($|_)/],
  ['performance', /(^|_)(load|strength|capacity|rating|class|hardness|slip|wear|force|torque|pressure|resist\w*|durab\w*)($|_)/],
  ['dimensions', /(^|_)(width|height|depth|length|thickness|diameter|weight|size|sizes|dimension\w*|volume|area)($|_)/],
  ['appearance', /(^|_)(colou?rs?|finish\w*|gloss\w*|textures?|pattern\w*|shades?|look|surface|ral)($|_)/],
  ['material_properties', /(^|_)(material\w*|composition|steel|alloy|coating|density|aluminium|aluminum|wood|glass|ceramic)($|_)/],
  ['application', /(^|_)(use|uses|suitable|suitability|application\w*|rooms?|indoor|outdoor|environment|area_of_use)($|_)/],
  ['commercial', /(^|_)(warranty|guarantee|price|brand|collection|series|origin|supplier|manufacturer|lead_time|moq)($|_)/],
  ['features', /(^|_)(included|includes|has|with|feature\w*|option\w*|optional|available|supports?)($|_)/],
];

/** Which Details section a field no importer declared belongs in, from the words of its key alone. */
export function inferSection(...hints: string[]): string {
  const text = hints.join('_').toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/g, '_');
  for (const [section, re] of RULES) if (re.test(text)) return section;
  return 'other';
}

export interface PlacedField {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** Buckets leftover fields by inferred section; `other` collects what no rule recognises. */
export function placeFields(fields: PlacedField[]): Map<string, PlacedField[]> {
  const out = new Map<string, PlacedField[]>();
  for (const f of fields) {
    const section = inferSection(f.key, f.hint ?? '');
    const list = out.get(section);
    if (list) list.push(f);
    else out.set(section, [f]);
  }
  return out;
}
