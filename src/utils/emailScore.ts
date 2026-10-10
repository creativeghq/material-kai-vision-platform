/** A writing score for an email or follow-up: length, questions, sentence length, paragraphs and subject, each with a tip. */
export interface EmailScoreMetric { key: string; label: string; value: string; ok: boolean; tip: string | null }
export interface EmailScore { score: number; verdict: 'good' | 'fair' | 'weak'; metrics: EmailScoreMetric[] }

/** Our own text only: quoted lines and everything below a signature delimiter are not part of what we wrote. */
function ownText(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const sig = lines.findIndex((l) => /^--\s*$/.test(l));
  return (sig >= 0 ? lines.slice(0, sig) : lines).filter((l) => !/^\s*>/.test(l)).join('\n')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[*_#`]/g, '').trim();
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

/** Fraction 0–1 for a value against an ideal band, falling to 0 at the outer limits. */
function band(v: number, lo: number, hi: number, min: number, max: number): number {
  if (v >= lo && v <= hi) return 1;
  if (v < lo) return v <= min ? 0 : (v - min) / (lo - min);
  return v >= max ? 0 : (max - v) / (max - hi);
}

export function scoreEmail(input: { body: string; subject?: string | null }): EmailScore | null {
  const text = ownText(input.body ?? '');
  const w = words(text);
  if (w.length < 3) return null;
  const greek = /[\u0370-\u03FF]/.test(text);
  const sentences = text.split(/(?<=[.!?\u037E])\s+|\n{2,}/).map((x) => x.trim()).filter((x) => words(x).length > 0);
  const questions = (text.match(greek ? /[?;\u037E](?=\s|$)/g : /[?\u037E](?=\s|$)/g) ?? []).length;
  const avgSentence = w.length / Math.max(1, sentences.length);
  const longestParagraph = Math.max(...text.split(/\n{2,}/).map((p) => words(p).length));

  const parts: Array<{ m: EmailScoreMetric; weight: number; fit: number }> = [];
  const add = (m: EmailScoreMetric, weight: number, fit: number) => parts.push({ m, weight, fit });

  const lenFit = band(w.length, 50, 125, 10, 300);
  add({ key: 'length', label: 'Length', value: `${w.length} words`, ok: lenFit >= 0.8,
    tip: w.length < 50 ? 'A little more context helps: emails of 50–125 words get the most replies.' : w.length > 125 ? 'Shorter gets more replies: aim for 50–125 words.' : null }, 3, lenFit);

  const qFit = questions === 0 ? 0.2 : questions <= 3 ? 1 : questions <= 5 ? 0.5 : 0.2;
  add({ key: 'questions', label: 'Questions', value: String(questions), ok: questions >= 1 && questions <= 3,
    tip: questions === 0 ? 'Ask one clear question, so they know what to answer.' : questions > 3 ? 'Too many questions: keep the one or two that matter.' : null }, 3, qFit);

  const sFit = band(avgSentence, 5, 17, 1, 35);
  add({ key: 'sentences', label: 'Sentence length', value: `${Math.round(avgSentence)} words on average`, ok: sFit >= 0.8,
    tip: avgSentence > 17 ? 'Split long sentences: short ones are easier to answer.' : null }, 2, sFit);

  const pFit = band(longestParagraph, 1, 70, 0, 160);
  add({ key: 'paragraphs', label: 'Paragraphs', value: `longest ${longestParagraph} words`, ok: pFit >= 0.8,
    tip: longestParagraph > 70 ? 'Break the long paragraph up: a wall of text gets skimmed.' : null }, 1, pFit);

  if (input.subject != null) {
    const sw = words(input.subject).length;
    const subFit = sw === 0 ? 0 : band(sw, 3, 6, 0, 14);
    add({ key: 'subject', label: 'Subject', value: sw ? `${sw} words` : 'missing', ok: subFit >= 0.8,
      tip: sw === 0 ? 'Add a subject.' : sw > 6 ? 'A short subject of 3–6 words is read more often.' : sw < 3 ? 'Say a little more in the subject: 3–6 words.' : null }, 1, subFit);
  }

  const total = parts.reduce((n, p) => n + p.weight, 0);
  const score = Math.round((parts.reduce((n, p) => n + p.weight * p.fit, 0) / total) * 100);
  return { score, verdict: score >= 75 ? 'good' : score >= 50 ? 'fair' : 'weak', metrics: parts.map((p) => p.m) };
}
