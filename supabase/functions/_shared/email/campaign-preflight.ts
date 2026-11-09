/** What must be true before a marketing campaign may be sent. Blocks refuse the send; warnings ride on the approval card. */
import type { DbClient } from '../supabase-client.ts';
import { resolveWorkspaceEmailSender } from '../email-sender.ts';
import { checkCopy, loadCopyRules, type CopyWarning } from '../copy-check.ts';

export interface PreflightIssue {
  severity: 'block' | 'warn';
  code: string;
  message: string;
}

export interface CampaignPreflight {
  ok: boolean;
  issues: PreflightIssue[];
  subject: string | null;
  preview_text: string | null;
  sender: { from_email: string; from_name: string; reply_to: string } | null;
  copy_warnings: CopyWarning[];
}

const PLACEHOLDER_HOST_RE = /^(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;

/** Every href in a template that would send a reader nowhere. Merge tags ({{…}}) are filled at send time and pass. */
export function templateLinkIssues(html: string | null | undefined): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const seen = new Set<string>();
  for (const m of String(html ?? '').matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gis)) {
    const href = m[2].trim();
    if (seen.has(href)) continue;
    seen.add(href);
    if (/\{\{[^}]+\}\}/.test(href)) continue;
    if (!href || href === '#' || /^javascript:/i.test(href)) {
      issues.push({ severity: 'block', code: 'empty_link', message: `A link in the template goes nowhere (${href || 'empty'}).` });
      continue;
    }
    if (/^(mailto|tel):/i.test(href)) continue;
    let url: URL;
    try { url = new URL(href); } catch {
      issues.push({ severity: 'block', code: 'invalid_link', message: `A link in the template is not a full address: ${href}` });
      continue;
    }
    if (PLACEHOLDER_HOST_RE.test(url.hostname)) {
      issues.push({ severity: 'block', code: 'placeholder_link', message: `A link in the template points at a placeholder address: ${href}` });
    } else if (url.protocol === 'http:') {
      issues.push({ severity: 'warn', code: 'insecure_link', message: `A link in the template is not https: ${href}` });
    }
  }
  return issues;
}

export async function campaignPreflight(
  db: DbClient,
  workspaceId: string,
  campaign: { template_id: string | null; subject_line: string | null; preview_text: string | null },
  avoidList: string[] = [],
): Promise<CampaignPreflight> {
  const issues: PreflightIssue[] = [];
  const block = (code: string, message: string) => issues.push({ severity: 'block', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message });

  let template: { html_template: string | null; subject_template: string | null; preview_text: string | null; is_active: boolean | null; workspace_id: string | null } | null = null;
  if (!campaign.template_id) {
    block('template_missing', 'The campaign has no email template.');
  } else {
    const { data, error } = await db.from('email_templates')
      .select('html_template, subject_template, preview_text, is_active, workspace_id').eq('id', campaign.template_id).maybeSingle();
    if (error) block('template_unreadable', `Could not read the template: ${error.message}`);
    else if (!data || (data.workspace_id && data.workspace_id !== workspaceId)) block('template_missing', 'The campaign template is not in this workspace.');
    else if (data.is_active === false) block('template_inactive', 'The campaign template is switched off.');
    else template = data;
  }
  if (template) issues.push(...templateLinkIssues(template.html_template));

  const subject = (campaign.subject_line ?? '').trim() || (template?.subject_template ?? '').trim() || null;
  const preview = (campaign.preview_text ?? '').trim() || (template?.preview_text ?? '').trim() || null;
  if (!subject) block('subject_missing', 'The campaign has no subject line.');
  if (!preview) warn('preview_missing', 'No preview text: inboxes will show the first line of the body instead.');

  const copyWarnings: CopyWarning[] = [];
  const [subjectRules, preheaderRules] = await Promise.all([loadCopyRules(db, 'email_subject'), loadCopyRules(db, 'email_preheader')]);
  if (subject) copyWarnings.push(...checkCopy({ text: subject, rules: subjectRules, avoidList }).warnings);
  if (preview) copyWarnings.push(...checkCopy({ text: preview, rules: preheaderRules, avoidList }).warnings);
  if (subjectRules.status !== 'ok' || preheaderRules.status !== 'ok') warn('rules_unchecked', 'The email writing rules could not be checked.');

  const sender = await resolveWorkspaceEmailSender(db, workspaceId);
  if (sender.source === 'unconfigured' || !sender.fromEmail) {
    block('sender_missing', sender.reason ?? 'This workspace has no verified email sender.');
  } else if (!sender.replyTo) {
    warn('reply_to_missing', `No reply-to address: replies go to ${sender.fromEmail}.`);
  }

  return {
    ok: !issues.some((i) => i.severity === 'block'),
    issues,
    subject,
    preview_text: preview,
    sender: sender.fromEmail ? { from_email: sender.fromEmail, from_name: sender.fromName, reply_to: sender.replyTo } : null,
    copy_warnings: copyWarnings,
  };
}
