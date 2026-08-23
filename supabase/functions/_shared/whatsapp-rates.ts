/**
 * What a WhatsApp message actually costs us, and therefore what to bill for it.
 *
 * Two different products wore one price. A reply inside the 24-hour customer-service window costs
 * nothing at all — Zernio does not bill it and neither does Meta. A TEMPLATE message is billed by
 * Meta straight to the WhatsApp Business Account, at a rate that varies by the recipient's country
 * AND the template's category, and never appears on Zernio's invoice or in any cost view here.
 *
 * The platform charged a flat $0.005 against both. On a free reply that is pure margin; on a
 * European marketing template it is roughly a tenth of the real cost, booked as a gain.
 *
 * The rate table is operator-editable data (`whatsapp_template_rates`), because Meta revises its
 * card and a redeploy is the wrong unit of change for a price. There is deliberately NO code
 * fallback list: an unpriced country falls back to the `*` wildcard row, which is set to the high
 * end of the card on purpose. An unknown country must over-charge the tenant slightly rather than
 * quietly eat Meta's bill — the true figure does not arrive until the WABA invoice does, by which
 * time the message is already sent.
 */
type SupabaseLike = { from: (t: string) => any };

export type TemplateCategory = 'marketing' | 'utility' | 'authentication' | 'service';

/** Service replies are free; everything else is a Meta-billed conversation. */
export const WHATSAPP_SERVICE_KEY = 'whatsapp-service';
export const WHATSAPP_TEMPLATE_KEY = 'whatsapp-template';

/**
 * ISO-3166 alpha-2 from an E.164 number, for the country half of the rate lookup.
 *
 * Prefix matching, longest first — +30 is Greece and +1 is North America, but +351 is Portugal and
 * would match +35 if the table were scanned in insertion order. Anything unrecognised returns null
 * and the caller falls through to the wildcard rate, which is the expensive one.
 */
const DIAL_PREFIXES: Array<[string, string]> = [
  ['+30', 'GR'], ['+357', 'CY'], ['+44', 'GB'], ['+49', 'DE'], ['+39', 'IT'],
  ['+34', 'ES'], ['+33', 'FR'], ['+31', 'NL'], ['+32', 'BE'], ['+48', 'PL'],
  ['+40', 'RO'], ['+359', 'BG'], ['+351', 'PT'], ['+353', 'IE'], ['+43', 'AT'],
  ['+41', 'CH'], ['+45', 'DK'], ['+46', 'SE'], ['+47', 'NO'], ['+358', 'FI'],
  ['+1', 'US'],
];

export function countryFromE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const n = phone.startsWith('+') ? phone : `+${phone}`;
  let best: [string, string] | null = null;
  for (const entry of DIAL_PREFIXES) {
    if (n.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

export interface WhatsAppCost {
  /** `ai_model_pricing.model_key` to debit against. */
  serviceKey: string;
  /** Real cost of this one message, in USD. `null` means "use the pricing row's own figure". */
  costPerUnit: number | null;
  category: TemplateCategory;
  country: string | null;
  /** True when the `*` wildcard supplied the rate — worth surfacing, it is the expensive row. */
  usedWildcard: boolean;
}

/**
 * Price ONE outbound WhatsApp message.
 *
 * `isTemplate` is the fact that decides everything: a template opens a paid Meta conversation, a
 * free-form reply inside the window does not. It is knowable at the call site — the send either
 * carries a template id or it does not — so it is a parameter rather than a guess.
 */
export async function priceWhatsAppMessage(
  supabase: SupabaseLike,
  params: { to: string; isTemplate: boolean; category?: TemplateCategory | null },
): Promise<WhatsAppCost> {
  if (!params.isTemplate) {
    return {
      serviceKey: WHATSAPP_SERVICE_KEY,
      costPerUnit: 0,
      category: 'service',
      country: countryFromE164(params.to),
      usedWildcard: false,
    };
  }

  const category: TemplateCategory = params.category ?? 'marketing';
  const country = countryFromE164(params.to);

  // The country row first, the wildcard only if there isn't one. Two reads rather than one `in`
  // query so the wildcard cannot win by sort order on a country we DO have a rate for.
  let rate: number | null = null;
  let usedWildcard = false;

  if (country) {
    const { data } = await supabase
      .from('whatsapp_template_rates')
      .select('cost_per_message_usd')
      .eq('country_code', country).eq('category', category).eq('active', true)
      .maybeSingle();
    if (data) rate = Number(data.cost_per_message_usd);
  }

  if (rate == null) {
    const { data } = await supabase
      .from('whatsapp_template_rates')
      .select('cost_per_message_usd')
      .eq('country_code', '*').eq('category', category).eq('active', true)
      .maybeSingle();
    if (data) { rate = Number(data.cost_per_message_usd); usedWildcard = true; }
  }

  return {
    serviceKey: WHATSAPP_TEMPLATE_KEY,
    // null hands the decision back to the pricing row's fallback rather than inventing a 0 —
    // a zero here would send the message free and log it as if it were.
    costPerUnit: rate,
    category,
    country,
    usedWildcard,
  };
}
