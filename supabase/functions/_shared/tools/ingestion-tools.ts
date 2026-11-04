/** Catalogue ingestion through the agent (#513): start, watch, review the discovered list, embed once. */

const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { serviceClient as svcClient } from '../supabase-client.ts';
import { mivaaAuthHeaders } from '../mivaa-caller.ts';
import { describeUpstreamError } from '../tool-result-shape.ts';

type ChunkSink = ((chunk: Record<string, unknown>) => void) | undefined;

const INGEST_BUCKET = 'pdf-documents';
const ACTIONS = ['start', 'status', 'review', 'approve', 'cancel', 'embed', 'redo_gemini', 'merge_products', 'drop_product', 'wipe', 'edition_review', 'edition_apply', 'resume', 'enrich_report', 'enrich'] as const;
const ENRICH_BATCH = 3;
const REVIEW_ACTIONS = ['keep', 'drop', 'rename', 'merge_into'] as const;
const MISSING_POLICIES = ['retire', 'needs_replacement', 'keep'] as const;

function mivaaBase(): string {
  return Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
}

async function callMivaa(path: string, jwt: string | undefined, userId: string, workspaceId: string,
  init: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(mivaaAuthHeaders(jwt, { userId, workspaceId }))) headers.set(k, v);
  headers.set('X-Workspace-Id', workspaceId);
  try {
    const resp = await fetch(`${mivaaBase()}${path}`, { ...init, headers });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : describeUpstreamError(resp.status, parsed) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** The latest ingestion job of a document in THIS workspace, by id or file name. */
async function resolveJob(workspaceId: string, jobId?: string, document?: string): Promise<{ jobId: string; documentId: string; filename: string } | null> {
  const sb = svcClient();
  if (jobId) {
    const { data } = await sb.from('background_jobs').select('id, document_id, workspace_id').eq('id', jobId).maybeSingle();
    if (!data || data.workspace_id !== workspaceId) return null;
    const { data: doc } = await sb.from('documents').select('filename').eq('id', data.document_id).maybeSingle();
    return { jobId: data.id, documentId: data.document_id, filename: doc?.filename ?? data.document_id };
  }
  if (!document) return null;
  const docQuery = /^[0-9a-f-]{36}$/i.test(document)
    ? sb.from('documents').select('id, filename').eq('workspace_id', workspaceId).eq('id', document)
    : sb.from('documents').select('id, filename').eq('workspace_id', workspaceId).ilike('filename', `%${document}%`);
  const { data: docs } = await docQuery.order('created_at', { ascending: false }).limit(1);
  if (!docs?.length) return null;
  const { data: job } = await sb.from('background_jobs').select('id').eq('document_id', docs[0].id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return job ? { jobId: job.id, documentId: docs[0].id, filename: docs[0].filename } : null;
}

/** Store an attached PDF under the workspace's own folder and hand MIVAA a short-lived signed URL. */
async function stageAttachment(workspaceId: string, dataUrl: string, title: string): Promise<{ url?: string; path?: string; error?: string }> {
  const match = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl);
  if (!match) return { error: 'That attachment is not a PDF.' };
  const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'catalogue';
  const path = `agent-ingest/${workspaceId}/${crypto.randomUUID()}-${slug}.pdf`;
  const sb = svcClient();
  const up = await sb.storage.from(INGEST_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { error: `Could not store the PDF: ${up.error.message}` };
  const signed = await sb.storage.from(INGEST_BUCKET).createSignedUrl(path, 3600);
  if (signed.error || !signed.data?.signedUrl) return { error: 'Could not sign the stored PDF.' };
  return { url: signed.data.signedUrl, path };
}

function confirmCard(onChunk: ChunkSink, input: Record<string, unknown>, title: string, summary: string) {
  onChunk?.({ type: 'action_confirmation', tool: 'ingest_catalog', input, title, summary, danger: false,
    toolkit_id: 'catalog-ingestion', timestamp: Date.now() });
  return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval. Do not retry.' });
}

export const createIngestCatalogTool = (
  userId: string, workspaceId: string, jwt: string | undefined, documents: string[], onChunk?: ChunkSink,
) => {
  return tool(
    async (args) => {
      const { action, confirm } = args;
      if (!workspaceId) return JSON.stringify({ success: false, error: 'No active workspace.' });

      if (action === 'start') {
        const title = (args.title || '').trim();
        if (!title) return JSON.stringify({ success: false, error: 'start needs a title (the catalogue name).' });
        const attachment = args.attachment;
        const hasAttachment = typeof attachment === 'number' && attachment >= 1 && attachment <= documents.length;
        if (!hasAttachment && !args.source_url) {
          return JSON.stringify({ success: false, error: `start needs the PDF: attachment (1-${documents.length || 0}) or source_url.` });
        }
        if (args.source_url && !/^https:\/\//i.test(args.source_url)) {
          return JSON.stringify({ success: false, error: 'source_url must be https.' });
        }
        const review = args.review_discovery ?? true;
        const defer = args.defer_embedding ?? true;
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action: 'start' }, `Start ingesting "${title}"?`,
            [`Source: ${hasAttachment ? `attached PDF ${attachment}` : args.source_url}`,
              `Category: ${args.material_category || 'not set'}`,
              review ? 'Stops after discovery for you to review the product list.' : 'Creates every discovered product without a review.',
              defer ? 'Builds no vectors until you run the embed step.' : 'Embeds during the run.',
              args.product_limit ? `Dry run: first ${args.product_limit} products only.` : '',
              'Runs on MIVAA and is billed to this workspace.'].filter(Boolean).join('\n'));
        }
        let fileUrl = args.source_url as string | undefined;
        if (hasAttachment) {
          const staged = await stageAttachment(workspaceId, documents[(attachment as number) - 1], title);
          if (staged.error) return JSON.stringify({ success: false, error: staged.error });
          fileUrl = staged.url;
        }
        const form = new FormData();
        const fields: Record<string, string | undefined> = {
          file_url: fileUrl, workspace_id: workspaceId, title, categories: 'products',
          material_category: args.material_category, multi_brand: args.multi_brand ? 'true' : 'false',
          publish_on_complete: 'false', review_discovery: review ? 'true' : 'false',
          defer_embedding: defer ? 'true' : 'false', product_limit: args.product_limit ? String(args.product_limit) : undefined,
          edition_label: args.edition_label, supersedes_document_id: args.supersedes_document_id, missing_policy: args.missing_policy,
          agent_prompt: args.rules,
          exclude_names: args.exclude_names?.join(','),
        };
        for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') form.set(k, v);
        const r = await callMivaa('/api/rag/documents/upload', jwt, userId, workspaceId, { method: 'POST', body: form });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'started', title, job_id: r.data?.job_id, document_id: r.data?.document_id,
          review_discovery: review, defer_embedding: defer, timestamp: Date.now() });
        return JSON.stringify({ success: true, job_id: r.data?.job_id, document_id: r.data?.document_id,
          message: review ? 'Started. It will stop after discovery; check status, then review the list.' : 'Started.' });
      }

      const job = await resolveJob(workspaceId, args.job_id, args.document);
      if (!job) return JSON.stringify({ success: false, error: 'No ingestion job in this workspace matches that job_id or document.' });

      if (action === 'status') {
        const sb = svcClient();
        const [{ data: row }, { data: audit }, { data: open }] = await Promise.all([
          sb.from('background_jobs').select('status, progress, error, last_checkpoint').eq('id', job.jobId).maybeSingle(),
          sb.from('ingestion_audits').select('status, created_at, phase').eq('document_id', job.documentId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
          sb.from('ingestion_corrections').select('outcome, message').eq('document_id', job.documentId)
            .is('acknowledged_at', null).neq('outcome', 'corrected'),
        ]);
        const status = {
          document: job.filename, job_id: job.jobId, document_id: job.documentId,
          status: row?.status, progress: row?.progress, stage: row?.last_checkpoint?.stage ?? null,
          error: row?.error ?? null, audit: audit ? `${audit.status} (${audit.phase})` : 'not audited yet',
          waiting_on_you: (open ?? []).map((c: { outcome: string; message: string }) => `${c.outcome === 'degraded' ? 'Degraded' : 'Needs decision'}: ${c.message}`),
        };
        onChunk?.({ type: 'ingestion_job', action: 'status', ...status, timestamp: Date.now() });
        return JSON.stringify({ success: true, ...status });
      }

      if (action === 'review') {
        const r = await callMivaa(`/api/rag/documents/job/${job.jobId}/discovery-review`, jwt, userId, workspaceId);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        const products = r.data?.review?.products ?? [];
        onChunk?.({ type: 'ingestion_review', document: job.filename, job_id: job.jobId, status: r.data?.status,
          review_status: r.data?.review?.status, products, timestamp: Date.now() });
        return JSON.stringify({ success: true, job_status: r.data?.status, review_status: r.data?.review?.status,
          products: products.map((p: { name: string; page_range: number[] }) => ({ name: p.name, pages: p.page_range })),
          next_step: 'Look for duplicates, mislabelled merges and accessories; then approve with edits or cancel.' });
      }

      if (action === 'approve' || action === 'cancel') {
        const edits = args.edits ?? [];
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId },
            action === 'cancel' ? `Cancel ingesting ${job.filename}?` : `Approve the product list for ${job.filename}?`,
            action === 'cancel' ? 'The job ends; no product is created.'
              : edits.length ? edits.map((e: any) => `${e.action}: ${e.name}${e.new_name ? ` → ${e.new_name}` : ''}${e.into ? ` → into ${e.into}` : ''}`).join('\n')
              : 'Creates every discovered product as listed.');
        }
        const r = await callMivaa(`/api/rag/documents/job/${job.jobId}/discovery-review`, jwt, userId, workspaceId, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: action, edits }),
        });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: action === 'cancel' ? 'cancelled' : 'approved', document: job.filename,
          job_id: job.jobId, applied: r.data?.applied ?? [], products: r.data?.products ?? null, timestamp: Date.now() });
        return JSON.stringify({ success: true, ...r.data });
      }

      if (action === 'embed') {
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Embed ${job.filename}?`,
            'Builds the vectors for this catalogue\'s products, chunks, images and pages in one run, then re-audits it. Billed to this workspace.');
        }
        const r = await callMivaa(`/api/rag/documents/${job.documentId}/embed`, jwt, userId, workspaceId, { method: 'POST' });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'embedding', document: job.filename, document_id: job.documentId, timestamp: Date.now() });
        return JSON.stringify({ success: true, message: 'Embedding started; check status, then the ingestion report.' });
      }

      if (action === 'redo_gemini') {
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Redo ${job.filename}'s patterned repairs with Gemini?`,
            'Replaces the plain clean-ups of patterned crops with Gemini repairs, keeping any that fail the fidelity check. Stops at the first failure to run. Billed to you.');
        }
        const r = await callMivaa(`/api/admin/documents/${job.documentId}/redo-gemini-repairs`, jwt, userId, workspaceId, { method: 'POST' });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'redoing_repairs', document: job.filename, document_id: job.documentId, timestamp: Date.now() });
        return JSON.stringify({ success: true, message: 'Started; the ingestion report shows what was replaced or why it stopped.' });
      }

      if (action === 'merge_products' || action === 'drop_product') {
        const find = async (name?: string) => {
          if (!name) return null;
          const { data } = await svcClient().from('products').select('id, name').eq('workspace_id', workspaceId)
            .eq('source_document_id', job.documentId).eq('name', name).limit(2);
          return data?.length === 1 ? data[0] : null;
        };
        const product = await find(args.product);
        if (!product) return JSON.stringify({ success: false, error: `No single product named "${args.product}" in ${job.filename}.` });
        if (action === 'drop_product') {
          if (confirm !== true) {
            return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Remove ${product.name} from ${job.filename}?`,
              'Deletes the product and its tables and image links; its text stays on the document. Refused if a quote, invoice, price or stock record uses it.');
          }
          const r = await callMivaa('/api/duplicates/drop', jwt, userId, workspaceId, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: product.id, workspace_id: workspaceId }) });
          if (!r.ok) return JSON.stringify({ success: false, error: r.error });
          onChunk?.({ type: 'ingestion_job', action: 'dropped', document: job.filename, product: product.name, timestamp: Date.now() });
          return JSON.stringify({ success: true, ...r.data });
        }
        const into = await find(args.into);
        if (!into) return JSON.stringify({ success: false, error: `No single product named "${args.into}" in ${job.filename} to merge into.` });
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Merge ${product.name} into ${into.name}?`,
            'Moves its text, tables, images and every record using it to the surviving product, then removes it. Refused if a price or quote line would collide.');
        }
        const r = await callMivaa('/api/duplicates/merge', jwt, userId, workspaceId, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_product_id: into.id, source_product_ids: [product.id], workspace_id: workspaceId, user_id: userId, merge_strategy: 'manual' }) });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'merged', document: job.filename, product: product.name, into: into.name, timestamp: Date.now() });
        return JSON.stringify({ success: true, moved: r.data?.moved });
      }

      if (action === 'enrich_report' || action === 'enrich') {
        const invoke = async (body: Record<string, unknown>) => {
          const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-draft-products`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt ?? ''}` },
            body: JSON.stringify({ workspace_id: workspaceId, ...body }),
          });
          const data = await resp.json().catch(() => ({}));
          return resp.ok ? data : { error: data?.error || `The enrichment service answered ${resp.status}.` };
        };
        if (action === 'enrich_report') {
          const report = await invoke({ action: 'report', document_id: job.documentId });
          onChunk?.({ type: 'ingestion_report', action: 'enrich_report', document: job.filename, ...report, timestamp: Date.now() });
          return JSON.stringify({ success: !report.error, summary: report.summary, error: report.error });
        }
        const names: string[] = (args.products ?? []).slice(0, ENRICH_BATCH);
        const { data: rows } = await svcClient().from('products').select('id, name').eq('workspace_id', workspaceId)
          .eq('source_document_id', job.documentId).in('name', names);
        if (!rows?.length) return JSON.stringify({ success: false, error: `Name up to ${ENRICH_BATCH} products of ${job.filename} in products.` });
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Enrich ${rows.length} product(s) from the maker's site?`,
            `${rows.map((r: { name: string }) => r.name).join(', ')}. Fills empty fields only and is billed to this workspace.`);
        }
        const out = await invoke({ action: 'run', product_ids: rows.map((r: { id: string }) => r.id) });
        if (out.error) return JSON.stringify({ success: false, error: out.error });
        onChunk?.({ type: 'ingestion_job', action: 'enriched', document: job.filename, timestamp: Date.now() });
        return JSON.stringify({ success: true, results: out.results });
      }

      if (action === 'resume') {
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Resume ${job.filename}?`,
            'Continues a failed or interrupted job from its last checkpoint. Finished stages are not paid for again.');
        }
        const r = await callMivaa(`/api/rag/jobs/${job.jobId}/restart`, jwt, userId, workspaceId, { method: 'POST' });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'resumed', document: job.filename, timestamp: Date.now() });
        return JSON.stringify({ success: true, message: 'Resumed from the last checkpoint; check status.' });
      }

      if (action === 'wipe') {
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Delete everything ${job.filename} produced?`,
            'Removes the job and all its products, text, images and vectors. This cannot be undone.');
        }
        const r = await callMivaa(`/api/rag/documents/jobs/${job.jobId}?preserve_outputs=false`, jwt, userId, workspaceId, { method: 'DELETE' });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'wiped', document: job.filename, timestamp: Date.now() });
        return JSON.stringify({ success: true, message: 'Deleted. Brand companies and shared registry fields it added are not touched.' });
      }

      if (action === 'edition_review') {
        const r = await callMivaa(`/api/rag/documents/${job.documentId}/edition`, jwt, userId, workspaceId);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        const changes = (r.data?.changes ?? []) as Array<Record<string, unknown>>;
        onChunk?.({ type: 'ingestion_review', action: 'edition', document: job.filename, changes, timestamp: Date.now() });
        return JSON.stringify({ success: true, changes: changes.length, by_kind: changes.reduce<Record<string, number>>((acc, c) => {
          const kind = String(c.change_kind);
          acc[kind] = (acc[kind] ?? 0) + 1;
          return acc;
        }, {}) });
      }

      if (action === 'edition_apply') {
        if (confirm !== true) {
          return confirmCard(onChunk, { ...args, action, job_id: job.jobId }, `Apply the ${job.filename} edition?`,
            'Publishes what it adds, retires or flags what it removes and updates what it changes, per the proposed action on each row.');
        }
        const r = await callMivaa(`/api/rag/documents/${job.documentId}/edition/apply`, jwt, userId, workspaceId, { method: 'POST' });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        onChunk?.({ type: 'ingestion_job', action: 'edition_applied', document: job.filename, timestamp: Date.now() });
        return JSON.stringify({ success: true, ...r.data });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'ingest_catalog',
      description:
        'Ingest a supplier PDF catalogue. start (attached PDF by number, or source_url) stops after discovery by default '
        + 'and builds no vectors; status shows where a job is and what waits on the user; review lists the discovered '
        + 'products; approve applies edits (keep/drop/rename/merge_into) and creates them; cancel ends the job; embed builds '
        + 'every vector once after review; redo_gemini redoes plain clean-ups of patterned crops once Gemini is available. '
        + 'merge_products moves a created product into another and drop_product removes one (both need document or job_id); wipe deletes everything a job produced; resume continues a failed or interrupted job; enrich_report lists a catalogue\'s empty fields and enrich fills them for up to 3 products from the maker\'s site; '
        + 'edition_review and edition_apply handle a catalogue that replaces an older one. '
        + 'Every action that changes something ALWAYS asks the user to Approve first (never set confirm).',
      schema: z.object({
        action: z.enum(ACTIONS).default('status'),
        job_id: z.string().optional().describe('Every action but start: the ingestion job id.'),
        document: z.string().optional().describe('Every action but start: the catalogue file name (partial) instead of job_id.'),
        title: z.string().optional().describe('start: the catalogue name.'),
        attachment: z.number().int().optional().describe('start: which attached PDF (1 = first).'),
        source_url: z.string().optional().describe('start: an https link to the PDF instead of an attachment.'),
        material_category: z.string().optional().describe('start: the material category key (e.g. tiles).'),
        review_discovery: z.boolean().optional().describe('start: stop after discovery for review (default true).'),
        defer_embedding: z.boolean().optional().describe('start: build no vectors until the embed step (default true).'),
        product_limit: z.number().int().min(1).max(500).optional().describe('start: dry run on the first N products.'),
        multi_brand: z.boolean().optional().describe('start: a distributor catalogue carrying several brands.'),
        exclude_names: z.array(z.string()).optional().describe('start: leave out discovered products whose name contains one of these (e.g. sample box).'),
        rules: z.string().optional().describe('start: plain-language rules for discovery (e.g. colours are variants, ignore sample boxes).'),
        edition_label: z.string().optional().describe('start: edition name when this replaces an older catalogue.'),
        supersedes_document_id: z.string().optional().describe('start: the older catalogue document this edition replaces.'),
        missing_policy: z.enum(MISSING_POLICIES).optional().describe('start: what happens to products missing from the new edition.'),
        edits: z.array(z.object({
          name: z.string(),
          action: z.enum(REVIEW_ACTIONS),
          new_name: z.string().optional(),
          into: z.string().optional(),
        })).optional().describe('approve: edits to the discovered list.'),
        products: z.array(z.string()).optional().describe('enrich: up to 3 exact product names.'),
        product: z.string().optional().describe('merge_products, drop_product: the exact product name.'),
        into: z.string().optional().describe('merge_products: the exact name of the product that survives.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
