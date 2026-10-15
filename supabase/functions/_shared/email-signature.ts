import type { DbClient } from './supabase-client.ts';
import { escapeHtml } from './html.ts';
import { normalizeSignatureCard, renderSignatureHtml, renderSignatureText } from './emailSignature.generated.ts';

export async function loadEmailSignature(db: DbClient, userId: string, workspaceId: string): Promise<{ text: string; html: string } | null> {
  const { data, error } = await db.from('inbox_composer_settings')
    .select('email_signature, signature_card').eq('user_id', userId).eq('workspace_id', workspaceId).maybeSingle();
  if (error) {
    console.error('[email-signature] signature not loaded, sending unsigned', error.message);
    return null;
  }
  const card = normalizeSignatureCard(data?.signature_card);
  if (card) return { text: renderSignatureText(card), html: renderSignatureHtml(card, escapeHtml) };
  const plain = String(data?.email_signature ?? '').trim();
  return plain
    ? { text: plain, html: `<div style="white-space:pre-wrap;margin-top:18px;color:#555">-- \n${escapeHtml(plain)}</div>` }
    : null;
}

export const FORWARD_MARKER = '---------- Forwarded message ----------';

export function signEmail(
  text: string,
  sig: { text: string; html: string },
  render: (t: string) => string | null,
  bodyHtml?: string | null,
): { text: string; html: string } {
  const toHtml = (t: string) => render(t) ?? `<div style="white-space:pre-wrap">${escapeHtml(t)}</div>`;
  const at = bodyHtml ? -1 : text.indexOf(FORWARD_MARKER);
  if (at < 0) return { text: `${text}\n\n-- \n${sig.text}`, html: `${bodyHtml ?? toHtml(text)}${sig.html}` };
  const note = text.slice(0, at).trimEnd();
  const rest = text.slice(at);
  return { text: `${note}\n\n-- \n${sig.text}\n\n${rest}`, html: `${toHtml(note)}${sig.html}${toHtml(rest)}` };
}
