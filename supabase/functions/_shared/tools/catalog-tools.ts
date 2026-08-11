/**
 * Catalog Tools — admin-only (gated at agent-chat injection layer).
 *
 * 9 tools for the presentation_catalogs flow:
 *   create_catalog              — initialize a new catalog row
 *   attach_catalog_pdfs         — link uploaded source PDFs to a catalog
 *   extract_from_catalog_pdfs   — free-form Vision query over attached PDFs
 *   translate_pdf_to_catalog    — PDF-to-PDF whole-catalog translation pass
 *   add_material_to_catalog     — explicit add (with price/image source)
 *   find_image_for_material     — DB visual_search → web image fallback
 *   adjust_catalog_pricing      — proportional re-price to a target total / delta / %
 *   generate_catalog_pdf        — invokes generate-catalog-pdf edge function
 *   publish_catalog             — flips status, mints slug
 *
 * Every tool emits chunks for the AgentHub chat surface so candidate
 * extractions / image options / generated PDFs render inline.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

type ChunkSink = ((chunk: any) => void) | undefined;

function emit(onChunk: ChunkSink, chunk: any) {
  if (!onChunk) return;
  try { onChunk(chunk); } catch { /* stream closed */ }
}

/**
 * Workflow chunk helpers — every catalog tool emits these alongside its
 * per-tool chunks so the chat surface can render the live WorkflowTracker.
 *
 * `run_id = catalog_id` for catalog-build workflows. Deterministic, no extra
 * state needed; if the user resumes a half-built catalog the run_id resolves
 * to the same tracker.
 */
function emitWorkflowPlan(onChunk: ChunkSink, args: {
  catalog_id: string;
  title?: string;
  subtitle?: string;
  metadata?: Record<string, any>;
}) {
  emit(onChunk, {
    type: 'workflow_plan',
    run_id: args.catalog_id,
    definition_id: 'catalog-build',
    title: args.title,
    subtitle: args.subtitle,
    metadata: { catalog_id: args.catalog_id, ...(args.metadata || {}) },
  });
}

function emitWorkflowStep(onChunk: ChunkSink, args: {
  catalog_id: string;
  // NB: no 'send' step — sending to customers is UI-only (SendToCustomersModal), never an agent workflow step.
  step_id: 'create' | 'attach' | 'extract' | 'add_extra' | 'images' | 'generate' | 'publish';
  status: 'pending' | 'running' | 'awaiting_input' | 'done' | 'failed' | 'skipped';
  status_line?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error_message?: string;
}) {
  emit(onChunk, {
    type: 'workflow_step_progress',
    run_id: args.catalog_id,
    step_id: args.step_id,
    status: args.status,
    status_line: args.status_line,
    input: args.input,
    output: args.output,
    error_message: args.error_message,
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'catalog';
}

async function ensureUniqueSlug(supabase: any, base: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from('presentation_catalogs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return slug;
    slug = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  return `${base}-${Date.now()}`;
}

async function loadCatalog(supabase: any, catalogId: string, ownerId: string) {
  const { data, error } = await supabase
    .from('presentation_catalogs')
    .select('*')
    .eq('id', catalogId)
    .maybeSingle();
  if (error || !data) return { error: error?.message || 'Catalog not found' };
  if (data.owner_user_id !== ownerId) return { error: 'Not authorized for this catalog' };
  return { catalog: data };
}

async function persistBody(supabase: any, catalogId: string, body: any) {
  const { error } = await supabase
    .from('presentation_catalogs')
    .update({ body_data: body, updated_at: new Date().toISOString() })
    .eq('id', catalogId);
  if (error) throw new Error(`Failed to update body: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. create_catalog
// ─────────────────────────────────────────────────────────────────────────────
export const createCreateCatalogTool = (userId: string, workspaceId: string | null, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      title: string;
      subtitle?: string;
      description?: string;
      template_id?: string;
      cover_client_name?: string;
    }) => {
      try {
        let templateId = input.template_id;
        if (!templateId) {
          const { data: tpl } = await supabase
            .from('catalog_templates')
            .select('id')
            .eq('is_default', true)
            .eq('is_active', true)
            .maybeSingle();
          templateId = tpl?.id;
        }

        const { data: catalog, error } = await supabase
          .from('presentation_catalogs')
          .insert({
            owner_user_id: userId,
            workspace_id: workspaceId,
            template_id: templateId,
            title: input.title,
            subtitle: input.subtitle || null,
            description: input.description || null,
            cover_data: {
              title: input.title,
              subtitle: input.subtitle || null,
              client_name: input.cover_client_name || null,
              date: new Date().toISOString(),
            },
            body_data: { sections: [] },
            back_cover_data: {},
            status: 'draft',
          })
          .select('*')
          .single();

        if (error || !catalog) {
          return JSON.stringify({ error: error?.message || 'Failed to create catalog' });
        }

        emit(onChunk, {
          type: 'catalog_created',
          catalog_id: catalog.id,
          title: catalog.title,
          template_id: templateId,
        });

        // Workflow tracker — boot the plan + mark step 1 complete.
        emitWorkflowPlan(onChunk, {
          catalog_id: catalog.id,
          title: catalog.title,
          subtitle: catalog.subtitle,
        });
        emitWorkflowStep(onChunk, {
          catalog_id: catalog.id,
          step_id: 'create',
          status: 'done',
          status_line: 'Catalog created',
          input: { title: catalog.title, subtitle: catalog.subtitle, template_id: templateId },
          output: { catalog_id: catalog.id },
        });

        return JSON.stringify({
          success: true,
          catalog_id: catalog.id,
          title: catalog.title,
          template_id: templateId,
          status: 'draft',
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'create_catalog',
      description:
        'Create a new presentation catalog (admin-only). Returns the catalog_id used by every other catalog tool. ' +
        'Use this BEFORE attaching PDFs, extracting sections, or adding materials. ' +
        'COPY-ON-MODIFY: when the user asks to take an existing document, proforma (Προσφορά), or catalog and change ' +
        'it, ALWAYS create a NEW catalog here and COPY all of the source content into it (every section, material, ' +
        'price, spec and image) before applying the changes — never mutate or reference the original. The source must ' +
        'stay intact. If the source is a PDF, extract/translate it into the new catalog first, then modify. ' +
        'To change prices or hit a total ("+€400", "make the total €2,438", "raise everything 15%"), use ' +
        'adjust_catalog_pricing on the NEW catalog — never edit individual line prices by hand or invent numbers.',
      schema: z.object({
        title: z.string().describe('Catalog display title, e.g. "Spring 2026 — Porcelain Range"'),
        subtitle: z.string().optional().describe('Optional subtitle / tagline'),
        description: z.string().optional().describe('Long description shown on the cover page'),
        template_id: z.string().uuid().optional().describe('Catalog template ID. Omit to use the workspace default.'),
        cover_client_name: z.string().optional().describe('Client name to render on the cover'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. attach_catalog_pdfs
// ─────────────────────────────────────────────────────────────────────────────
export const createAttachCatalogPdfsTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: { catalog_id: string; source_pdf_ids: string[] }) => {
      try {
        emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'attach', status: 'running', status_line: 'Linking source PDFs…' });
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'attach', status: 'failed', error_message: error });
          return JSON.stringify({ error });
        }

        // Scope source PDFs to the catalog's workspace so another tenant's PDF cannot be
        // attached by uuid then extracted (BOLA guard — CLAUDE.md invariant 1).
        const { data: pdfs, error: pdfErr } = await supabase
          .from('catalog_source_pdfs')
          .select('id, original_filename, manufacturer_name, page_count, status')
          .eq('workspace_id', catalog.workspace_id)
          .in('id', input.source_pdf_ids);

        if (pdfErr) return JSON.stringify({ error: pdfErr.message });
        if (!pdfs || pdfs.length === 0) return JSON.stringify({ error: 'No PDFs found for those IDs' });

        const ownedIds = new Set(pdfs.map((p: any) => p.id));
        for (const reqId of input.source_pdf_ids) {
          if (!ownedIds.has(reqId)) {
            return JSON.stringify({ error: `Source PDF ${reqId} not found or not accessible` });
          }
        }

        const merged = Array.from(new Set([...(catalog.source_pdf_ids || []), ...input.source_pdf_ids]));
        const { error: upErr } = await supabase
          .from('presentation_catalogs')
          .update({ source_pdf_ids: merged, updated_at: new Date().toISOString() })
          .eq('id', input.catalog_id);

        if (upErr) return JSON.stringify({ error: upErr.message });

        emit(onChunk, {
          type: 'catalog_pdfs_attached',
          catalog_id: input.catalog_id,
          pdf_ids: input.source_pdf_ids,
          pdfs: pdfs.map((p: any) => ({
            id: p.id,
            filename: p.original_filename,
            manufacturer: p.manufacturer_name,
            pages: p.page_count,
            status: p.status,
          })),
        });

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'attach', status: 'done',
          status_line: `${input.source_pdf_ids.length} PDF${input.source_pdf_ids.length === 1 ? '' : 's'} linked`,
          output: { pdf_ids: input.source_pdf_ids, total_attached: merged.length },
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          attached_count: input.source_pdf_ids.length,
          total_attached: merged.length,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'attach_catalog_pdfs',
      description:
        'Attach one or more uploaded source PDFs to a catalog. The user uploads PDFs first — either via the admin ' +
        'UI (Sources tab / /admin/catalogs/sources) or by attaching a PDF directly in chat — which creates rows in ' +
        'catalog_source_pdfs and gives you a source_pdf_id. This tool links those ids to the catalog being built. ' +
        'When the user says they uploaded a PDF and gives a source_pdf_id, pass it here. Required before ' +
        'extract_from_catalog_pdfs / translate_pdf_to_catalog can run.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        source_pdf_ids: z.array(z.string().uuid()).min(1).max(20),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. extract_from_catalog_pdfs
// ─────────────────────────────────────────────────────────────────────────────
export const createExtractFromCatalogPdfsTool = (userId: string, userJwt: string | undefined, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      catalog_id: string;
      query: string;
      max_results?: number;
      auto_add?: boolean;
    }) => {
      const maxResults = input.max_results ?? 12;
      try {
        emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'extract', status: 'running', status_line: `Vision-extracting "${input.query}"…` });
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'extract', status: 'failed', error_message: error });
          return JSON.stringify({ error });
        }

        if (!catalog.source_pdf_ids || catalog.source_pdf_ids.length === 0) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'extract', status: 'failed', error_message: 'No source PDFs attached.' });
          return JSON.stringify({
            error: 'No source PDFs attached. Call attach_catalog_pdfs first.',
          });
        }

        // The real workspace binding is done in catalog-extract-from-pdfs via caller_user_id,
        // which it trusts ONLY at service-key ('secret') auth level (act-on-behalf-of pattern).
        // We also forward the user JWT as belt-and-braces, but note it's typically inert here:
        // supabase-js puts the service key on the `apikey` header, and authenticate() resolves
        // that to 'secret' before it would validate this Authorization token.
        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          'catalog-extract-from-pdfs',
          {
            ...(userJwt ? { headers: { Authorization: `Bearer ${userJwt}` } } : {}),
            body: {
              catalog_id: input.catalog_id,
              source_pdf_ids: catalog.source_pdf_ids,
              query: input.query,
              max_results: maxResults,
              caller_user_id: userId,
            },
          },
        );

        if (invokeErr || !invokeData?.success) {
          return JSON.stringify({
            error: invokeErr?.message || invokeData?.error || 'Extraction failed',
          });
        }

        // ── Canonicalize spec values (multilingual → canonical English) ──
        // Sonnet's extraction returns specs in whatever language the source PDF
        // uses. Route each candidate's specs through canonicalize-attributes so
        // both the review chunk and the auto-add catalog content carry canonical
        // English values for filterable facets (color, finish, material, …).
        // Non-canonicalizable specs (size, sku, brand, …) pass through unchanged.
        const candidates: any[] = Array.isArray(invokeData.candidates) ? invokeData.candidates : [];
        for (const c of candidates) {
          if (!c?.specs || typeof c.specs !== 'object') continue;
          try {
            const { data: canonResp, error: canonErr } = await supabase.functions.invoke(
              'canonicalize-attributes',
              {
                body: {
                  raw_attributes: c.specs,
                  source: 'catalog_extract_promote',
                },
              },
            );
            if (canonErr || !canonResp) continue;
            const canonicalSpecs = (canonResp.attributes && typeof canonResp.attributes === 'object')
              ? canonResp.attributes
              : {};
            const rawAudit = (canonResp.attributes_raw && typeof canonResp.attributes_raw === 'object')
              ? canonResp.attributes_raw
              : {};
            // Replace canonicalizable keys with their canonical English form;
            // every other key (size, sku, brand, etc.) keeps its original value.
            c.specs = { ...c.specs, ...canonicalSpecs };
            if (Object.keys(rawAudit).length > 0) {
              c.specs_raw = rawAudit;
            }
          } catch {
            // Best-effort. Leave specs as-is on failure.
          }
        }

        emit(onChunk, {
          type: 'catalog_extraction_candidates',
          catalog_id: input.catalog_id,
          query: input.query,
          candidates,
          auto_add: !!input.auto_add,
        });

        if (input.auto_add && candidates.length > 0) {
          const body = catalog.body_data || { sections: [] };
          const sections = Array.isArray(body.sections) ? body.sections : [];

          const sectionTitle = `Extracted: ${input.query.slice(0, 60)}`;
          const newSection = {
            id: crypto.randomUUID(),
            title: sectionTitle,
            intro: null,
            materials: candidates.map((c: any) => ({
              id: crypto.randomUUID(),
              name: c.name,
              description: c.description || null,
              image_url: c.image_url || null,
              image_source: c.image_url ? 'extracted_from_pdf' : null,
              image_source_ref: c.source_pdf_id ? `${c.source_pdf_id}#${c.page_no}` : null,
              price: c.price ?? null,
              currency: c.currency || null,
              price_source: c.price != null ? 'manual' : null,
              specs: c.specs || {},
              ...(c.specs_raw ? { specs_raw: c.specs_raw } : {}),
              provenance: {
                source_pdf_id: c.source_pdf_id,
                page_no: c.page_no,
                extracted_at: new Date().toISOString(),
              },
            })),
          };
          sections.push(newSection);
          await persistBody(supabase, input.catalog_id, { ...body, sections });
        }

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'extract', status: 'done',
          status_line: `${invokeData.candidates?.length || 0} candidate${(invokeData.candidates?.length || 0) === 1 ? '' : 's'} ready for approval`,
          output: { candidates_count: invokeData.candidates?.length || 0, query: input.query },
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          query: input.query,
          candidates_count: candidates.length,
          auto_added: !!input.auto_add,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'extract_from_catalog_pdfs',
      description:
        'Run a free-form Vision query over the source PDFs attached to a catalog. ' +
        'Example: "porcelain tiles in white finishes" — returns matched material candidates with ' +
        'page-cropped images, names, descriptions, and any visible price/spec info. The user reviews ' +
        'candidates in the chat (catalog_extraction_candidates chunk) and approves which to add. ' +
        'Pass auto_add:true to push every candidate into a new section without approval.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        query: z.string().describe('Free-form description of what to extract, e.g. "white porcelain tiles, large format"'),
        max_results: z.number().int().min(1).max(40).optional().describe('Max candidates returned. Default 12.'),
        auto_add: z.boolean().optional().describe('If true, every candidate is added to a new section in the catalog body without approval. Default false.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. translate_pdf_to_catalog
// ─────────────────────────────────────────────────────────────────────────────
export const createTranslatePdfToCatalogTool = (userId: string, workspaceId: string | null, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      source_pdf_id: string;
      target_catalog_id?: string;
      new_catalog_title?: string;
      preserve_original_layout?: boolean;
      template_id?: string;
    }) => {
      try {
        const { data: pdf, error: pdfErr } = await supabase
          .from('catalog_source_pdfs')
          .select('*')
          .eq('id', input.source_pdf_id)
          .maybeSingle();
        if (pdfErr || !pdf) return JSON.stringify({ error: pdfErr?.message || 'Source PDF not found' });
        if (pdf.uploaded_by !== userId) return JSON.stringify({ error: 'Not authorized for this PDF' });

        let catalogId = input.target_catalog_id;
        if (!catalogId) {
          if (!input.new_catalog_title) {
            return JSON.stringify({ error: 'Either target_catalog_id or new_catalog_title is required' });
          }
          let templateId = input.template_id;
          if (!templateId) {
            const { data: tpl } = await supabase
              .from('catalog_templates')
              .select('id').eq('is_default', true).eq('is_active', true).maybeSingle();
            templateId = tpl?.id;
          }
          const { data: created, error: createErr } = await supabase
            .from('presentation_catalogs')
            .insert({
              owner_user_id: userId,
              workspace_id: workspaceId,
              template_id: templateId,
              title: input.new_catalog_title,
              source_pdf_ids: [input.source_pdf_id],
              cover_data: {
                title: input.new_catalog_title,
                date: new Date().toISOString(),
              },
              status: 'draft',
            })
            .select('*').single();
          if (createErr || !created) return JSON.stringify({ error: createErr?.message || 'Failed to create target catalog' });
          catalogId = created.id;
        } else {
          const { catalog, error: loadErr } = await loadCatalog(supabase, catalogId, userId);
          if (loadErr || !catalog) return JSON.stringify({ error: loadErr });
          if (!catalog.source_pdf_ids?.includes(input.source_pdf_id)) {
            await supabase
              .from('presentation_catalogs')
              .update({
                source_pdf_ids: [...(catalog.source_pdf_ids || []), input.source_pdf_id],
              })
              .eq('id', catalogId);
          }
        }

        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          'catalog-translate-pdf',
          {
            body: {
              source_pdf_id: input.source_pdf_id,
              target_catalog_id: catalogId,
              preserve_original_layout: !!input.preserve_original_layout,
              caller_user_id: userId,
            },
          },
        );

        if (invokeErr || !invokeData?.success) {
          return JSON.stringify({
            error: invokeErr?.message || invokeData?.error || 'Translation failed',
            catalog_id: catalogId,
          });
        }

        emit(onChunk, {
          type: 'catalog_translation_ready',
          catalog_id: catalogId,
          source_pdf_id: input.source_pdf_id,
          sections_count: invokeData.sections_count,
          materials_count: invokeData.materials_count,
          preserve_original_layout: !!input.preserve_original_layout,
        });

        // catalog-translate workflow: emit plan + step done so the wizard
        // advances from "Translate PDF" → "Generate PDF" automatically.
        // run_id = catalog_id (the natural primary entity).
        emitWorkflowPlan(onChunk, {
          catalog_id: catalogId!,
          title: input.new_catalog_title,
          metadata: { workflow_def: 'catalog-translate' },
        });
        emitWorkflowStep(onChunk, {
          catalog_id: catalogId!,
          step_id: 'translate' as any,
          status: 'done',
          status_line: `${invokeData.sections_count ?? 0} sections · ${invokeData.materials_count ?? 0} materials`,
          input: {
            source_pdf_id: input.source_pdf_id,
            new_catalog_title: input.new_catalog_title,
            preserve_original_layout: !!input.preserve_original_layout,
          },
          output: {
            catalog_id: catalogId,
            sections_count: invokeData.sections_count,
            materials_count: invokeData.materials_count,
          },
        });

        return JSON.stringify({
          success: true,
          catalog_id: catalogId,
          sections_count: invokeData.sections_count,
          materials_count: invokeData.materials_count,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'translate_pdf_to_catalog',
      description:
        'Translate an entire source PDF into a catalog body in one pass. Faster than extract_from_catalog_pdfs ' +
        'when the admin wants the whole manufacturer catalog mirrored. Set preserve_original_layout:true to ' +
        'mirror page-by-page; false (default) restructures into clean sections by category. Either pass ' +
        'target_catalog_id to write into an existing draft, or new_catalog_title to spin up a fresh one.',
      schema: z.object({
        source_pdf_id: z.string().uuid(),
        target_catalog_id: z.string().uuid().optional(),
        new_catalog_title: z.string().optional(),
        preserve_original_layout: z.boolean().optional(),
        template_id: z.string().uuid().optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. add_material_to_catalog
// ─────────────────────────────────────────────────────────────────────────────
export const createAddMaterialToCatalogTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      catalog_id: string;
      section_title: string;
      material: {
        name: string;
        description?: string;
        image_url?: string;
        image_source?: 'catalog_product' | 'extracted_from_pdf' | 'uploaded' | 'web_search_approved';
        image_source_ref?: string;
        price?: number;
        currency?: string;
        price_source?: 'manual' | 'catalog_product' | 'price_monitoring' | 'market_check';
        price_source_ref?: string;
        specs?: Record<string, any>;
      };
    }) => {
      try {
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) return JSON.stringify({ error });

        const body = catalog.body_data || { sections: [] };
        const sections = Array.isArray(body.sections) ? body.sections : [];

        let section = sections.find((s: any) => s.title.toLowerCase() === input.section_title.toLowerCase());
        if (!section) {
          section = { id: crypto.randomUUID(), title: input.section_title, intro: null, materials: [] };
          sections.push(section);
        }

        let imageUrl = input.material.image_url || null;
        let imageSource = input.material.image_source || null;
        let imageSourceRef = input.material.image_source_ref || null;
        let priceSource = input.material.price_source || (input.material.price != null ? 'manual' : null);
        let priceSourceRef = input.material.price_source_ref || null;
        let price = input.material.price ?? null;
        let currency = input.material.currency || null;

        if (input.material.price_source === 'catalog_product' && input.material.price_source_ref) {
          const { data: prod } = await supabase
            .from('products')
            .select('name, description, base_price, currency')
            .eq('id', input.material.price_source_ref)
            .eq('workspace_id', catalog.workspace_id)
            .maybeSingle();
          if (prod) {
            if (price == null) price = prod.base_price ?? null;
            if (!currency) currency = prod.currency || null;
          }
        }
        if (input.material.price_source === 'price_monitoring' && input.material.price_source_ref) {
          const { data: tq } = await supabase
            .from('tracked_queries')
            .select('current_price, current_currency, current_price_updated_at')
            .eq('id', input.material.price_source_ref)
            .eq('workspace_id', catalog.workspace_id)
            .maybeSingle();
          if (tq) {
            if (price == null) price = tq.current_price ?? null;
            if (!currency) currency = tq.current_currency || null;
            priceSourceRef = input.material.price_source_ref;
          }
        }
        if (input.material.image_source === 'catalog_product' && input.material.image_source_ref && !imageUrl) {
          // `document_images` has neither `product_id` nor `storage_path` — the product→image
          // link is `image_product_associations`, and the image carries a ready `image_url`
          // (pdf-tiles is public-read, so no signing). The old query named both missing
          // columns, so PostgREST rejected it and catalog materials never picked up their
          // product photo. The workspace filter is kept, applied through the embed.
          const { data: prodImg, error: prodImgErr } = await supabase
            .from('image_product_associations')
            .select('overall_score, document_images!inner(image_url, workspace_id)')
            .eq('product_id', input.material.image_source_ref)
            .eq('document_images.workspace_id', catalog.workspace_id)
            .order('overall_score', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prodImgErr) {
            console.error('[catalog-tools] product→image lookup failed:', prodImgErr.message);
          } else {
            const found = (prodImg as { document_images?: { image_url?: string } } | null)?.document_images?.image_url;
            if (found) imageUrl = found;
          }
        }

        const materialId = crypto.randomUUID();
        section.materials.push({
          id: materialId,
          name: input.material.name,
          description: input.material.description || null,
          image_url: imageUrl,
          image_source: imageSource,
          image_source_ref: imageSourceRef,
          price,
          currency,
          price_source: priceSource,
          price_source_ref: priceSourceRef,
          specs: input.material.specs || {},
          provenance: { added_at: new Date().toISOString() },
        });

        await persistBody(supabase, input.catalog_id, { ...body, sections });

        emit(onChunk, {
          type: 'catalog_material_added',
          catalog_id: input.catalog_id,
          section_id: section.id,
          section_title: section.title,
          material_id: materialId,
          name: input.material.name,
          has_image: !!imageUrl,
          price,
          currency,
        });

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'add_extra', status: 'done',
          status_line: `"${input.material.name}" added to ${section.title}${imageUrl ? '' : ' (needs image)'}`,
          output: { material_id: materialId, has_image: !!imageUrl },
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          section_id: section.id,
          material_id: materialId,
          name: input.material.name,
          image_url: imageUrl,
          price,
          currency,
          needs_image: !imageUrl,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'add_material_to_catalog',
      description:
        'Add a single material to a catalog section. Creates the section if it does not exist. ' +
        'Use price_source="catalog_product" + price_source_ref=<product_id> to pull price from the catalog; ' +
        '"price_monitoring" + tracked_query_id to use the cheapest verified retailer; "market_check" for ' +
        'a one-shot market scan; "manual" for direct entry. Same pattern for image_source. If the response ' +
        'has needs_image:true, call find_image_for_material next.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        section_title: z.string().describe('Section name. Auto-creates if missing.'),
        material: z.object({
          name: z.string(),
          description: z.string().optional(),
          image_url: z.string().optional(),
          image_source: z.enum(['catalog_product', 'extracted_from_pdf', 'uploaded', 'web_search_approved']).optional(),
          image_source_ref: z.string().optional(),
          price: z.number().optional(),
          currency: z.string().optional().describe('ISO 4217 code, e.g. "EUR"'),
          price_source: z.enum(['manual', 'catalog_product', 'price_monitoring', 'market_check']).optional(),
          price_source_ref: z.string().optional().describe('product_id / tracked_query_id / market_check_run_id'),
          specs: z.record(z.any()).optional(),
        }),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. find_image_for_material
// ─────────────────────────────────────────────────────────────────────────────
export const createFindImageForMaterialTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: {
      catalog_id: string;
      section_id?: string;
      material_id?: string;
      material_name: string;
      search_db_first?: boolean;
      max_candidates?: number;
    }) => {
      const maxCandidates = input.max_candidates ?? 6;
      const searchDbFirst = input.search_db_first !== false;
      try {
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) return JSON.stringify({ error });

        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          'catalog-image-search',
          {
            body: {
              query: input.material_name,
              max_candidates: maxCandidates,
              search_db_first: searchDbFirst,
              caller_user_id: userId,
            },
          },
        );

        if (invokeErr || !invokeData?.success) {
          return JSON.stringify({
            error: invokeErr?.message || invokeData?.error || 'Image search failed',
          });
        }

        emit(onChunk, {
          type: 'catalog_image_candidates',
          catalog_id: input.catalog_id,
          section_id: input.section_id || null,
          material_id: input.material_id || null,
          material_name: input.material_name,
          candidates: invokeData.candidates || [],
        });

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'images', status: 'done',
          status_line: `${invokeData.candidates?.length || 0} image candidate${(invokeData.candidates?.length || 0) === 1 ? '' : 's'} for approval`,
          output: {
            candidates_count: invokeData.candidates?.length || 0,
            db_hits: invokeData.db_hits, web_hits: invokeData.web_hits,
          },
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          material_name: input.material_name,
          candidates_count: invokeData.candidates?.length || 0,
          db_hits: invokeData.db_hits || 0,
          web_hits: invokeData.web_hits || 0,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'find_image_for_material',
      description:
        'Find candidate images for a material that does not have one yet. Searches the platform DB first ' +
        '(visual_search across document_images), then falls back to web image search. Emits a ' +
        'catalog_image_candidates chunk with up to N options — the admin clicks ✓ in the UI to attach the ' +
        'chosen image to the material. Pass section_id + material_id when known so the UI can persist the ' +
        'attachment without another tool call.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        section_id: z.string().uuid().optional(),
        material_id: z.string().uuid().optional(),
        material_name: z.string().describe('Description used as the search query, e.g. "Crema Marfil porcelain 600x600 matt"'),
        search_db_first: z.boolean().optional().describe('Default true. Set to false to skip DB and go straight to web.'),
        max_candidates: z.number().int().min(1).max(12).optional().describe('Default 6'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. generate_catalog_pdf
// ─────────────────────────────────────────────────────────────────────────────
export const createGenerateCatalogPdfTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: { catalog_id: string; regenerate?: boolean; layout?: 'list' | 'grid'; proforma?: boolean; vat_rate?: number }) => {
      try {
        emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'generate', status: 'running', status_line: 'Rendering A4 PDF…' });
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'generate', status: 'failed', error_message: error });
          return JSON.stringify({ error });
        }

        const sections = catalog.body_data?.sections || [];
        const totalMaterials = sections.reduce((acc: number, s: any) => acc + (s.materials?.length || 0), 0);
        if (totalMaterials === 0) {
          return JSON.stringify({
            error: 'Catalog has no materials yet. Add at least one material before generating the PDF.',
          });
        }

        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          'generate-catalog-pdf',
          { body: {
            catalog_id: input.catalog_id,
            regenerate: !!input.regenerate,
            ...(input.layout ? { layout: input.layout } : {}),
            ...(input.proforma != null ? { proforma: input.proforma } : {}),
            ...(input.vat_rate != null ? { vat_rate: input.vat_rate } : {}),
          } },
        );

        if (invokeErr || !invokeData?.success) {
          return JSON.stringify({
            error: invokeErr?.message || invokeData?.error || 'PDF generation failed',
          });
        }

        emit(onChunk, {
          type: 'catalog_pdf_ready',
          catalog_id: input.catalog_id,
          title: catalog.title,
          pdf_url: invokeData.pdf_url,
          page_count: invokeData.page_count,
        });

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'generate', status: 'done',
          status_line: `${invokeData.page_count} page${invokeData.page_count === 1 ? '' : 's'} rendered`,
          output: { pdf_url: invokeData.pdf_url, page_count: invokeData.page_count },
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          pdf_url: invokeData.pdf_url,
          page_count: invokeData.page_count,
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'generate_catalog_pdf',
      description:
        'Render the catalog as a PDF using the workspace-branded design (same design/branding as quotes). ' +
        'layout: "list" = a compact quote-style table (default), "grid" = large image cards — ask the user which they want. ' +
        'proforma:true renders a Προσφορά/offer with a totals block (subtotal → VAT → final), computed from the ' +
        'material prices (VAT % from vat_rate or the workspace default); totals are shown only when materials are priced. ' +
        'Returns a signed URL (7-day expiry) + page count. Pass regenerate:true to force a fresh render.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        regenerate: z.boolean().optional(),
        layout: z.enum(['list', 'grid']).optional().describe('"list" = quote-style table (default), "grid" = image cards.'),
        proforma: z.boolean().optional().describe('Render as a Προσφορά/offer with a totals block (needs priced materials).'),
        vat_rate: z.number().optional().describe('VAT % for proforma totals; defaults to the workspace finance setting.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. adjust_catalog_pricing — proportional re-price to a target (no invented numbers)
// ─────────────────────────────────────────────────────────────────────────────
export const createAdjustCatalogPricingTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return tool(
    async (input: { catalog_id: string; mode: 'target_total' | 'delta' | 'percent' | 'per_item'; amount: number; basis?: 'payable' | 'net' }) => {
      try {
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) return JSON.stringify({ error: error || 'Catalog not found' });

        const body = catalog.body_data || {};
        const sections = Array.isArray(body.sections) ? body.sections : [];
        const mats: any[] = [];
        for (const s of sections) for (const m of (s.materials || [])) mats.push(m);
        // A line is "priced" if it carries a net value or a unit price we can scale.
        const priced = mats.filter((m) => m?.specs?.net_value != null || m?.price != null);
        if (priced.length === 0) return JSON.stringify({ error: 'No priced materials to adjust.' });

        const netOf = (m: any): number => {
          const sp = m.specs || {};
          if (sp.net_value != null) return Number(sp.net_value);
          const qty = Number(sp.quantity_tmet ?? sp.quantity_tem ?? sp.quantity ?? 1);
          return m.price != null ? Number(m.price) * qty : 0;
        };
        const vatMultOf = (m: any): number => 1 + (Number(m?.specs?.vat_pct ?? 0) / 100);

        const currentNet = r2(priced.reduce((a, m) => a + netOf(m), 0));
        const currentPayable = r2(priced.reduce((a, m) => a + netOf(m) * vatMultOf(m), 0));
        if (currentNet <= 0) return JSON.stringify({ error: 'Current net total is zero; cannot scale.' });

        // per_item is ADDITIVE, not proportional: add `amount` to every line's unit
        // price, so a line's value grows by amount x quantity. Each line keeps its
        // discount % (recomputed on the new gross) so Price / Discount / Net still
        // reconcile. Use for "add EUR25 per item" — unlike delta/target_total, the
        // increase does NOT depend on how expensive the line already is.
        if (input.mode === 'per_item') {
          for (const m of priced) {
            const sp = m.specs || (m.specs = {});
            const qty = Number(sp.quantity_tmet ?? sp.quantity_tem ?? sp.quantity ?? 1) || 1;
            const curUnit = m.price != null ? Number(m.price) : netOf(m) / qty;
            const newUnit = r2(curUnit + input.amount);
            if (newUnit < 0) return JSON.stringify({ error: `Line "${m.name}" would go negative (${newUnit}). Use a smaller reduction.` });
            m.price = newUnit;
            const gross = r2(newUnit * qty);
            const pct = Number(sp.discount_pct ?? 0);
            const disc = r2(gross * pct / 100);
            if (sp.discount_value != null || pct > 0) sp.discount_value = disc;
            sp.net_value = r2(gross - disc);
          }
          await persistBody(supabase, input.catalog_id, body);
          const perItemNet = r2(priced.reduce((a, m) => a + Number(m.specs.net_value), 0));
          const perItemPayable = r2(priced.reduce((a, m) => a + Number(m.specs.net_value) * vatMultOf(m), 0));
          return JSON.stringify({
            success: true,
            catalog_id: input.catalog_id,
            mode: 'per_item',
            amount_per_item: input.amount,
            lines_adjusted: priced.length,
            before: { net: currentNet, payable: currentPayable },
            after: { net: perItemNet, payable: perItemPayable },
            note: `Added ${input.amount} per unit to all ${priced.length} lines (discount % preserved). Now call generate_catalog_pdf to re-render.`,
          });
        }

        const basis = input.basis ?? 'payable';
        // Everything reduces to a target NET total; the scale factor comes from the
        // ACTUAL current totals so VAT (even mixed rates) stays proportional.
        let targetNet: number;
        if (input.mode === 'percent') {
          targetNet = r2(currentNet * (1 + input.amount / 100));
        } else if (input.mode === 'delta') {
          const base = basis === 'payable' ? currentPayable : currentNet;
          const targetBasis = base + input.amount;
          targetNet = basis === 'payable' ? r2(targetBasis * currentNet / currentPayable) : r2(targetBasis);
        } else {
          targetNet = basis === 'payable' ? r2(input.amount * currentNet / currentPayable) : r2(input.amount);
        }
        if (targetNet <= 0) return JSON.stringify({ error: 'Resulting total must be positive.' });

        const factor = targetNet / currentNet;

        // Scale every priced line by the SAME factor — unit price, net, and discount
        // value all move together, so each line keeps its discount % and it reads as a
        // genuine re-quote (never a single hand-edited line).
        for (const m of priced) {
          const sp = m.specs || (m.specs = {});
          if (m.price != null) m.price = r2(Number(m.price) * factor);
          sp.net_value = r2((sp.net_value != null ? Number(sp.net_value) : netOf(m)) * factor);
          if (sp.discount_value != null) sp.discount_value = r2(Number(sp.discount_value) * factor);
        }

        // Absorb the sub-cent rounding remainder onto the largest lines (±0.01 each)
        // so the total lands EXACTLY on target — standard ERP rounding, invisible.
        let remainderCents = Math.round((targetNet - priced.reduce((a, m) => a + Number(m.specs.net_value), 0)) * 100);
        const byNetDesc = [...priced].sort((a, b) => Number(b.specs.net_value) - Number(a.specs.net_value));
        let i = 0;
        while (remainderCents !== 0 && byNetDesc.length > 0) {
          const m = byNetDesc[i % byNetDesc.length];
          m.specs.net_value = r2(Number(m.specs.net_value) + (remainderCents > 0 ? 0.01 : -0.01));
          remainderCents += remainderCents > 0 ? -1 : 1;
          i++;
        }

        await persistBody(supabase, input.catalog_id, body);

        const newNet = r2(priced.reduce((a, m) => a + Number(m.specs.net_value), 0));
        const newPayable = r2(priced.reduce((a, m) => a + Number(m.specs.net_value) * vatMultOf(m), 0));

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          lines_adjusted: priced.length,
          scale_factor: Math.round(factor * 1e5) / 1e5,
          before: { net: currentNet, payable: currentPayable },
          after: { net: newNet, payable: newPayable },
          note: 'All lines scaled proportionally (discount % preserved). Now call generate_catalog_pdf to re-render.',
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'adjust_catalog_pricing',
      description:
        'Re-price a whole catalog/proforma proportionally to hit a pricing target, WITHOUT inventing numbers. ' +
        'Every line is scaled by the same factor so it reads as a genuine re-quote — each line keeps its discount % ' +
        'and VAT, and the 1–2 cent rounding remainder is absorbed into the largest lines so the total lands EXACTLY. ' +
        'Use this for requests like "make the total €2,438", "add €400", "increase everything by 15%", or "add €25 per ' +
        'item" — never edit individual line prices by hand. mode: "target_total" (amount = the total you want) / ' +
        '"delta" (amount = € to add or subtract across the whole doc, negative lowers) / "percent" (amount = ± percent) / ' +
        '"per_item" (amount = € added to EVERY line\'s unit price — a €25/item bump on 12 lines adds €300; negative ' +
        'lowers). basis applies to target_total + delta only: "payable" = VAT-inclusive total (default) / "net" = ' +
        'pre-VAT subtotal. Only mutates THIS catalog, never the source. After adjusting, call generate_catalog_pdf.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        mode: z.enum(['target_total', 'delta', 'percent', 'per_item']),
        amount: z.number().describe('target total (target_total), € across the doc (delta), ± percent (percent), or € added to each line\'s unit price (per_item). Negative lowers.'),
        basis: z.enum(['payable', 'net']).optional().describe('"payable" = VAT-included total (default), "net" = pre-VAT subtotal.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. publish_catalog
// ─────────────────────────────────────────────────────────────────────────────
export const createPublishCatalogTool = (userId: string, onChunk: ChunkSink) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  return tool(
    async (input: { catalog_id: string; desired_slug?: string; unpublish?: boolean }) => {
      try {
        if (!input.unpublish) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'publish', status: 'running', status_line: 'Minting public slug…' });
        }
        const { catalog, error } = await loadCatalog(supabase, input.catalog_id, userId);
        if (error || !catalog) {
          emitWorkflowStep(onChunk, { catalog_id: input.catalog_id, step_id: 'publish', status: 'failed', error_message: error });
          return JSON.stringify({ error });
        }

        if (input.unpublish) {
          const { error: unpubErr } = await supabase
            .from('presentation_catalogs')
            .update({
              status: 'archived',
              unpublished_at: new Date().toISOString(),
            })
            .eq('id', input.catalog_id);
          if (unpubErr) return JSON.stringify({ error: unpubErr.message });

          emit(onChunk, { type: 'catalog_unpublished', catalog_id: input.catalog_id });
          emit(onChunk, { type: 'workflow_finished', run_id: input.catalog_id, status: 'aborted', summary: 'Unpublished' });
          return JSON.stringify({ success: true, catalog_id: input.catalog_id, status: 'archived' });
        }

        const totalMaterials = (catalog.body_data?.sections || [])
          .reduce((acc: number, s: any) => acc + (s.materials?.length || 0), 0);
        if (totalMaterials === 0) {
          return JSON.stringify({ error: 'Cannot publish an empty catalog. Add materials first.' });
        }

        let slug = catalog.slug;
        if (!slug || input.desired_slug) {
          const base = slugify(input.desired_slug || catalog.title);
          slug = await ensureUniqueSlug(supabase, base);
        }

        const { error: pubErr } = await supabase
          .from('presentation_catalogs')
          .update({
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            unpublished_at: null,
          })
          .eq('id', input.catalog_id);
        if (pubErr) return JSON.stringify({ error: pubErr.message });

        const publicBase = Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
        const publicUrl = `${publicBase}/c/${slug}`;

        emit(onChunk, {
          type: 'catalog_published',
          catalog_id: input.catalog_id,
          slug,
          public_url: publicUrl,
        });

        emitWorkflowStep(onChunk, {
          catalog_id: input.catalog_id, step_id: 'publish', status: 'done',
          status_line: `Published at /c/${slug}`,
          output: { slug, public_url: publicUrl },
        });
        emit(onChunk, {
          type: 'workflow_finished',
          run_id: input.catalog_id,
          status: 'done',
          summary: `Published as ${publicUrl}. Use "Send to Customers" on /admin/catalogs/${input.catalog_id} to email it via CRM categories.`,
        });

        return JSON.stringify({
          success: true,
          catalog_id: input.catalog_id,
          slug,
          public_url: publicUrl,
          status: 'published',
        });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
    {
      name: 'publish_catalog',
      description:
        'Publish a draft catalog. Mints a unique slug (from desired_slug or the title) and flips status ' +
        'to "published". Returns the public URL — visitors land on the email-gate at /c/:slug. Pass ' +
        'unpublish:true to flip back to archived without deleting.',
      schema: z.object({
        catalog_id: z.string().uuid(),
        desired_slug: z.string().optional().describe('Custom slug. Will be sanitized and made unique.'),
        unpublish: z.boolean().optional(),
      }),
    },
  );
};
