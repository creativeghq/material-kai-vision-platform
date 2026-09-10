/** "Which template does this workspace want its invoice / quote email to use?" */

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


/** The slug of the template assigned to (workspace, kind), or null to use the built-in body. */
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
