/**
 * Which country a phone number was issued in — the only country signal a chat channel gives us,
 * since WhatsApp publishes a display name and nothing else.
 *
 * Longest prefix wins, which is the whole difficulty: +7 covers Russia and Kazakhstan, and +38 is
 * a prefix of +380. A shortest-match lookup answers Ukraine for a Serbian number.
 */

/** Dial code (no `+`) → ISO alpha-2. Trade partners first; extend rather than guess. */
const DIAL_CODES: Record<string, string> = {
  // North America (NANP — one code, many countries; the two we trade with)
  '1': 'US',
  // Europe
  '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR', '34': 'ES', '36': 'HU',
  '39': 'IT', '40': 'RO', '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK',
  '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE',
  '351': 'PT', '352': 'LU', '353': 'IE', '354': 'IS', '355': 'AL', '356': 'MT',
  '357': 'CY', '358': 'FI', '359': 'BG',
  '370': 'LT', '371': 'LV', '372': 'EE', '373': 'MD', '374': 'AM', '375': 'BY',
  '376': 'AD', '377': 'MC', '378': 'SM', '380': 'UA', '381': 'RS', '382': 'ME',
  '383': 'XK', '385': 'HR', '386': 'SI', '387': 'BA', '389': 'MK',
  '420': 'CZ', '421': 'SK', '423': 'LI',
  // Eurasia / Middle East / Africa
  '7': 'RU', '90': 'TR', '212': 'MA', '216': 'TN', '20': 'EG', '27': 'ZA',
  '234': 'NG', '254': 'KE', '971': 'AE', '966': 'SA', '972': 'IL', '974': 'QA',
  '965': 'KW', '968': 'OM', '973': 'BH', '962': 'JO', '961': 'LB', '995': 'GE',
  // Asia-Pacific
  '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN', '91': 'IN', '92': 'PK',
  '60': 'MY', '62': 'ID', '63': 'PH', '65': 'SG', '66': 'TH',
  '880': 'BD', '852': 'HK', '853': 'MO', '886': 'TW', '94': 'LK',
  '61': 'AU', '64': 'NZ',
  // Latin America
  '52': 'MX', '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO', '51': 'PE',
};

/** Longest dial code first, so '380' is tested before '38' and '3'. */
const SORTED_CODES = Object.keys(DIAL_CODES).sort((a, b) => b.length - a.length);

/**
 * ISO alpha-2 for a number in international form, or null when the prefix is one we have not
 * listed. Null means "we do not know", never a default country — a wrong country sends the
 * search to the wrong register and comes back confidently empty.
 */
export function countryFromPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  for (const code of SORTED_CODES) {
    if (digits.startsWith(code)) return DIAL_CODES[code];
  }
  return null;
}
