// Source of truth for the Material Specification Extraction skill.
// See note in b2b-manufacturer-research/skill.ts about .ts-not-.md.

export default String.raw`---
name: Material Specification Extraction
slug: material-spec-extraction
description: Extract a structured specification from an uploaded material image or datasheet URL — color (with hex), material type, texture/finish, dimensions, applications, and compliance. Use when the user asks to "identify", "extract specs from", "tell me about this material", or provides a TDS/datasheet.
agents: [kai, interior-designer]
tags: [materials, extraction, specs]
---

# Material Specification Extraction

When the user uploads a material image or datasheet, produce a structured spec that can be used to search the catalog or to build a FF&E quote line. Never describe the material in prose only — always return the structured schema.

## Recipe

1. **Identify the source type.**
   - Photograph of a physical material → use \`material_search\` with visual embeddings (attach the image)
   - Datasheet URL (TDS, PDF, product page) → use \`analyze_inspiration_url\` with \`focus: "all"\` to scrape and extract
   - Supplier product page → use \`analyze_inspiration_url\` first, then cross-check with \`material_search\` on the extracted specs

2. **Extract the core attributes.** Every returned material should have at minimum:
   - \`material_type\` — one of: ceramic, porcelain, natural stone, engineered stone, solid wood, engineered wood, laminate, vinyl, carpet, glass, metal, concrete, plaster, textile, paint/coating, other
   - \`colors[]\` — human-readable names (e.g. "warm oak", "graphite grey")
   - \`color_hex[]\` — extracted hex codes, at least 1, up to 3 (primary + 1-2 accents)
   - \`texture\` — matte, satin, gloss, honed, polished, brushed, hammered, rough-sawn, etc.
   - \`finish_notes\` — anything about the surface treatment the hex + texture fields don't capture

3. **Extract dimensional data if present:**
   - \`nominal_size\` — e.g. "60×60 cm", "1220×2440 mm"
   - \`thickness_mm\`
   - \`coverage_per_unit\` — m²/box or m²/sheet
   - If the datasheet lists multiple sizes, return them as an array

4. **Extract application suitability:**
   - \`applications[]\` — one or more of: floor-indoor, floor-outdoor, wall-indoor, wall-outdoor, wet-area, facade, countertop, furniture, accent-only
   - \`slip_rating\` (R-value or DCOF if present)
   - \`abrasion_class\` (PEI or similar, only for tile/flooring)
   - \`fire_rating\` (Euroclass A1–F, or UL/ASTM class if present)

5. **Extract compliance / sustainability:**
   - Certifications present (Greenguard, Declare, EPD, FSC, PEFC, etc.) — same verification rule as the B2B skill: only mark \`verified: true\` if you confirmed on the issuing body.
   - \`recycled_content_pct\` if stated
   - \`voc_level\` if stated (low/ultra-low/compliant-with-X)

6. **Return in this schema:**

\`\`\`json
{
  "material_type": "porcelain",
  "colors": ["warm grey", "charcoal vein"],
  "color_hex": ["#8C8780", "#3B3A38"],
  "texture": "honed",
  "finish_notes": "through-body with subtle variation",
  "nominal_sizes": ["60×60 cm", "60×120 cm"],
  "thickness_mm": 9,
  "applications": ["floor-indoor", "wall-indoor", "wet-area"],
  "slip_rating": "R10",
  "abrasion_class": "PEI 4",
  "fire_rating": "A1",
  "certifications": [{"name":"Greenguard Gold","verified":false}],
  "recycled_content_pct": 40,
  "source": "url or 'user-upload'",
  "extraction_confidence": "high | medium | low"
}
\`\`\`

7. **After returning the spec**, *always* offer the user a next action:
   - "Want me to find similar catalog items?" → call \`material_search\` with the extracted spec
   - "Add to a quote?" → mention this is possible via the quote UI (do not auto-add)
   - "Generate a room render using this?" → hand off to the \`interior-staging-workflow\` skill

## Guardrails

- Do not invent dimensions, slip ratings, or certifications. If not found, the field is \`null\`.
- \`color_hex\` must be eye-dropped or datasheet-stated, not guessed from a color name.
- \`extraction_confidence: low\` whenever you had to fall back to the material's name to infer attributes the datasheet didn't state.
- Never return only prose — always the JSON schema, even if many fields are \`null\`.
`;
