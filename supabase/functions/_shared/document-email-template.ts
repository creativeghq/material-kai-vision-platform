/**
 * "Which template does this workspace want its invoice / quote email to use?"
 *
 * Invoice and quote emails compose their subject + HTML inline in the sending function. That is
 * the DEFAULT, and it stays: it carries the pay link, the Viva RF bank-transfer code and the
 * myDATA MARK/QR, and it must keep working for every workspace that never touches this.
 *
 * A workspace can override the body by assigning one of its own email templates to a document
 * kind (`workspace_document_email_templates`). This resolves that assignment to the slug
 * email-api addresses templates by.
 *
 * Two rules the callers depend on:
 *
 *  1. **Resolution failure is not an override.** Any error here returns null and the built-in
 *     body sends. An invoice that does not go out because a template lookup hiccuped is a worse
 *     outcome than one that goes out looking plain.
 *  2. **Every documented variable is always supplied, even as ''.** `renderTemplateWithVariables`
 *     leaves an unknown `{{key}}` in the output verbatim — so a template that references
 *     `{{pay_url}}` on an invoice that has no pay link would mail the literal text "{{pay_url}}"
 *     to the customer. `withAllVars` below fills the gaps.
 */

import type { DbClient } from './supabase-client.ts';

/** Document kinds a template may be assigned to. Mirrors the CHECK on the mapping table. */
export type DocumentEmailKind = 'invoice' | 'quote';

/**
 * Every variable each kind promises a template author. The assignment guard
 * (`assert_document_email_template_binding`) enforces the REQUIRED subset; this is the full set
 * a template may reference, and the list callers must fill.
 */
export const DOCUMENT_EMAIL_VARIABLES: Record<DocumentEmailKind, readonly string[]> = {
  invoice: [
    'invoice_number', 'customer_name', 'sender_name', 'total', 'currency',
    'due_date', 'pay_url', 'rf_code', 'fiscal_mark', 'fiscal_qr_url',
  ],
  quote: [
    'quote_title', 'quote_number', 'customer_name', 'sender_name', 'total',
    'currency', 'expires_at', 'view_url', 'message',
  ],
} as const;


/**
 * The slug of the template assigned to (workspace, kind), or null to use the built-in body.
 *
 * One RPC, deliberately. The Supabase client here is untyped (`createClient as any` in the app,
 * and no generated types on the edge side either), so a wrong column name or a mis-shaped
 * PostgREST embed result would not be a compile error and is not reachable from a unit test —
 * whereas `resolve_document_email_template` is one SQL function that can be probed directly.
 * It also re-checks `is_active`, so an assignment whose template was deactivated after the fact
 * resolves to null instead of to a slug email-api would 404 on mid-send.
 */
export async function resolveDocumentEmailTemplate(
  supabase: DbClient,
  workspaceId: string | null | undefined,
  kind: DocumentEmailKind,
): Promise<string | null> {
  if (!workspaceId) return null;
  try {
    const { data, error } = await supabase.rpc('resolve_document_email_template', {
      p_workspace_id: workspaceId,
      p_document_kind: kind,
    });
    if (error) {
      console.warn(`[document-email-template] ${kind} lookup failed, using built-in body:`, error.message);
      return null;
    }
    return typeof data === 'string' && data.length > 0 ? data : null;
  } catch (err) {
    // Never block a document send on the override lookup — fall back to the built-in body. An
    // invoice that does not go out because a template lookup hiccuped is worse than one that
    // goes out looking plain.
    console.warn(`[document-email-template] ${kind} lookup threw, using built-in body:`, err);
    return null;
  }
}

/**
 * Fill in every variable the kind documents, so no `{{placeholder}}` can reach a customer as
 * literal text. Values already supplied win; the rest become ''.
 */
export function withAllVars(
  kind: DocumentEmailKind,
  supplied: Record<string, string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of DOCUMENT_EMAIL_VARIABLES[kind]) out[key] = '';
  for (const [k, v] of Object.entries(supplied)) out[k] = v == null ? '' : String(v);
  return out;
}
