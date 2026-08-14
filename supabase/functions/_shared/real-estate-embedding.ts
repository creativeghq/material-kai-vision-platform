// deno-lint-ignore-file no-explicit-any
// Semantic-search embedding for listings (Voyage 1024D halfvec via the MIVAA gateway —
// the same `/api/embeddings/clip-text` path kb-generate-embedding uses, so query and
// document vectors always come from the same model generation).
//
// Never throws: publishing a listing must not fail because the embedding service is down.
// A missing embedding only means the listing is invisible to the SEMANTIC query in
// Discovery until the next publish/save refreshes it — facet search still finds it.

/** Flatten the searchable facts of a listing into one embedding document. */
export function buildEmbeddingText(p: any): string {
  const i18n = p.description_i18n ?? {};
  const arr = (v: any) => (Array.isArray(v) ? v.join(', ') : '');
  const parts = [
    p.title,
    [p.property_type, p.subtype, p.transaction_type ? `for ${String(p.transaction_type).replace('_', ' ')}` : null].filter(Boolean).join(' '),
    [p.town, p.municipality, p.region, p.prefecture, p.country_code].filter(Boolean).join(', '),
    p.bedrooms != null ? `${p.bedrooms} bedrooms` : null,
    p.bathrooms != null ? `${p.bathrooms} bathrooms` : null,
    (p.area_built ?? p.plot_area) != null ? `${p.area_built ?? p.plot_area} m2` : null,
    p.energy_class ? `energy class ${p.energy_class}` : null,
    p.year_built ? `built ${p.year_built}` : null,
    arr(p.features),
    arr(p.amenities),
    arr(p.view_types),
    i18n.en,
    i18n.el,
  ].filter(Boolean);
  return parts.join('\n').trim().substring(0, 8000);
}

/** Embed `text` through the MIVAA gateway. `inputType` must be 'document' for stored
 *  listings and 'query' for search queries (Voyage asymmetric-retrieval contract). */
export async function embedText(text: string, inputType: 'document' | 'query'): Promise<number[] | null> {
  // Read env at call time — the secrets bootstrap populates env at handler entry.
  const mivaaUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
  const res = await fetch(`${mivaaUrl}/api/embeddings/clip-text`, {
    method: 'POST',
    // MIVAA's /api/embeddings/* is excluded from the JWT middleware (no user
    // JWT exists on this path) and, until audit #12, had no route gate either --
    // an unauthenticated, uncapped Voyage spend reachable from the internet. It
    // now requires verify_internal_access; x-cron-secret is the branch that is a
    // plain string compare, so it works where a service-role Bearer would not
    // (_validate_supabase_jwt rejects aud="service_role").
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') || '' },
    body: JSON.stringify({ text, model: 'voyage-4', input_type: inputType, dimensions: 1024 }),
  });
  if (!res.ok) throw new Error(`MIVAA embedding API ${res.status}: ${(await res.text().catch(() => '')).substring(0, 200)}`);
  const result = await res.json();
  if (!result?.success || !Array.isArray(result.embedding)) throw new Error(`MIVAA embedding failed: ${result?.error ?? 'no embedding returned'}`);
  return result.embedding as number[];
}

/** Recompute and store `properties.text_embedding` for one listing. Best-effort by design. */
export async function refreshListingEmbedding(supabase: any, property: any): Promise<void> {
  try {
    const text = buildEmbeddingText(property);
    if (!text) return;
    const embedding = await embedText(text, 'document');
    if (!embedding) return;
    const { error } = await supabase.from('properties')
      .update({ text_embedding: embedding }).eq('id', property.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`[real-estate-api] listing embedding refresh failed for ${property?.id}:`, e);
  }
}
