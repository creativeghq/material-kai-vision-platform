---
name: B2B Manufacturer Research
slug: b2b-manufacturer-research
description: Research a specific manufacturer or supplier — verify legitimacy, extract certifications, MOQ, lead time, regions served, and return a structured sourcing report with verifiable sources. Use when the user asks to "research", "verify", "check", or "find info about" a specific company, brand, or factory.
agents: [kai, product-business]
tags: [b2b, sourcing, research, procurement]
---

# B2B Manufacturer Research

Follow this procedure exactly when the user asks you to research a specific manufacturer, supplier, or brand. Do NOT use this for consumer product searches — use `material_search` instead.

## Recipe

1. **Identify the target.** Extract the company name, any known website, country, and material category from the user's message. If ambiguous (e.g. "Marazzi" — Italian tile vs. US distributor), ask one clarifying question before proceeding.

2. **Run `b2b_manufacturer_search`** with the company name as the primary query. This hits the live web-search tool with a B2B-biased prompt and returns initial hits.

3. **If a website is surfaced, run `analyze_inspiration_url`** on the official domain. This scrapes the site and extracts what materials/categories they actually produce — a sanity check against the web-search summary.

4. **Verify certifications.** For every certification claimed (ISO 9001, ISO 14001, Greenguard, CE, LEED, Declare, EPD, etc.):
   - Look up the cert number on the **issuing body's website**, not the manufacturer's own PDF
   - If you can't verify on the issuing body, mark it as `claimed: true, verified: false` — never present unverified certs as verified
   - Never invent certification numbers. If a cert is mentioned without a number, record it as `{name, number: null, verified: false}`.

5. **Extract sourcing data.** Pull MOQ, lead time in days, sample availability, export countries, and pricing tier (if disclosed). Missing fields should be `null`, not guessed.

6. **Classify tier:**
   - **tier-1** = verified factory with audited compliance (ISO + traceable address + physical production footprint)
   - **tier-2** = verified importer or authorized distributor
   - **tier-3** = broker / unverified reseller — red-flag indicators: no VAT/tax ID, Gmail/Yahoo contact only, no physical address, stock photos on the whole site
   - If fewer than 3 independent sources agree on basic facts (name, country, category), mark `confidence: low`

7. **Return output in this exact schema** (embed as JSON in your final reply):

```json
{
  "company": "string",
  "official_site": "url or null",
  "country": "ISO-2 code",
  "tier": "tier-1 | tier-2 | tier-3",
  "confidence": "high | medium | low",
  "material_categories": ["..."],
  "certifications": [
    { "name": "ISO 9001", "number": "string or null", "verified": true, "issuer_confirmed": true }
  ],
  "moq": "string or null",
  "lead_time_days": 30,
  "sample_available": true,
  "regions_served": ["EU", "NA"],
  "red_flags": ["..."],
  "sources": ["url1", "url2", "url3"]
}
```

## Guardrails

- **Never** cite LinkedIn or Instagram as a source for pricing, certifications, or MOQ — use only the manufacturer site, an industry body, or a trade registry.
- **Never** fabricate a certification number, VAT number, or address. `null` is always an acceptable value.
- **Always** include at least 2 source URLs. If you have fewer than 2, say so explicitly and set `confidence: low`.
- If the manufacturer appears on a known-scam list or has no verifiable physical presence, set `tier: tier-3` and add `"unverifiable operator"` to `red_flags`.

## Trusted regional directories

Use these as secondary verification when relevant to the material category:
- **Italian tile**: Assopiastrelle (`confindustriaceramica.it`)
- **German steel/metalwork**: Bauforumstahl (`bauforumstahl.de`)
- **UK timber**: Timber Trade Federation (`ttf.co.uk`)
- **Global certifications**: `declare.living-future.org`, `epd-international.com`, `ul.com/greenguard`
