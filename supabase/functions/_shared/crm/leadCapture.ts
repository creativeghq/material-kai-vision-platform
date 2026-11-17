
export interface LeadCaptureRule {
  id: string;
  workspace_id: string;
  label: string;
  channel: 'email' | 'whatsapp';
  match_field: 'subject' | 'body';
  match_mode: 'starts_with' | 'contains';
  pattern: string;
  mail_account_id: string | null;
  assign_to_user_id?: string | null;
}

export interface CapturedLeadFields {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  request: string | null;
}

const fold = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('el');

export function ruleMatches(rule: Pick<LeadCaptureRule, 'match_field' | 'match_mode' | 'pattern'>, msg: { subject?: string | null; body?: string | null }): boolean {
  const hay = fold(String((rule.match_field === 'subject' ? msg.subject : msg.body) ?? ''));
  const needle = fold(rule.pattern);
  if (!needle || !hay) return false;
  return rule.match_mode === 'starts_with' ? hay.startsWith(needle) : hay.includes(needle);
}

export function firstMatchingRule<R extends LeadCaptureRule>(rules: R[], msg: { subject?: string | null; body?: string | null }): R | null {
  return rules.find((r) => ruleMatches(r, msg)) ?? null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (!digits) return null;
  if (v.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 10 && /^(69|2)/.test(digits)) return `+30${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return v;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FORM_LABELS = ['Name', 'Email', 'Phone', 'Subject', 'Message'] as const;
type FormLabel = typeof FORM_LABELS[number];

export function parseContactFormText(text: string): Partial<Record<FormLabel, string>> | null {
  const clean = text.replace(/\*/g, '').replace(/\r/g, '');
  const out: Partial<Record<FormLabel, string>> = {};
  const re = new RegExp(`^\\s*(${FORM_LABELS.join('|')}):[ \\t]*`, 'gm');
  const hits = [...clean.matchAll(re)];
  for (let i = 0; i < hits.length; i++) {
    const label = hits[i][1] as FormLabel;
    if (out[label] !== undefined) continue;
    const start = (hits[i].index ?? 0) + hits[i][0].length;
    const end = label === 'Message' ? clean.length : (hits[i + 1]?.index ?? clean.length);
    const value = clean.slice(start, end).replace(/\s*\n\s*/g, label === 'Message' ? '\n' : ' ').trim();
    if (value) out[label] = value;
  }
  return out.Name || out.Email || out.Phone ? out : null;
}

export function leadFromEmail(input: {
  subject: string; html: string | null; text: string | null; fromName: string | null; fromAddress: string | null; rulePattern: string;
}): CapturedLeadFields {
  const body = input.html ? htmlToText(input.html) : (input.text ?? '');
  const form = parseContactFormText(body);
  const subjectTail = input.subject.replace(new RegExp(`^\\s*${escapeRegExp(input.rulePattern)}\\s*[—–:-]*\\s*`, 'i'), '').trim();
  if (form) {
    return {
      name: form.Name ?? null,
      email: form.Email?.toLowerCase() ?? null,
      phone: normalizePhone(form.Phone),
      title: form.Subject ?? (subjectTail || input.subject),
      request: form.Message ?? null,
    };
  }
  return {
    name: input.fromName ?? input.fromAddress,
    email: input.fromAddress,
    phone: null,
    title: subjectTail || input.subject,
    request: body.slice(0, 4000) || null,
  };
}

export function parseWhatsAppPageCard(text: string): { pageTitle: string | null; url: string | null } {
  const title = /«([^»]+)»/.exec(text)?.[1]?.trim() ?? null;
  const url = /(https?:\/\/[^\s]+)/.exec(text)?.[1] ?? null;
  return { pageTitle: title, url };
}

export function leadFromWhatsApp(input: { text: string; profileName: string | null; phone: string | null }): CapturedLeadFields {
  const card = parseWhatsAppPageCard(input.text);
  return {
    name: input.profileName?.trim() || null,
    email: null,
    phone: normalizePhone(input.phone),
    title: card.pageTitle,
    request: input.text.trim().slice(0, 4000) || null,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
