/** The server-side refusal behind #592: a question carrying an email, a phone number or a word of the sender's name never leaves the platform. */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(?:\+|00)?\d(?:[\s\-.()]*\d){6,}/;

export function containsPersonalData(question: string, lead: { name: string | null; email: string | null; phone: string | null; company_name: string | null }): boolean {
  if (EMAIL.test(question) || PHONE.test(question)) return true;
  const q = question.toLocaleLowerCase();
  const words = [lead.name, lead.company_name, lead.email?.split('@')[0]]
    .flatMap((s) => (s ?? '').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter((w) => w.length >= 3);
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(q));
}
