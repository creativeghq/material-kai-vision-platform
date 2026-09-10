/** Instruction-shaped phrasing in stored knowledge-base content (#365 `AD-37`). */
const INJECTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'overrides earlier instructions', re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|system|all)\b[^.\n]{0,20}\b(instruction|prompt|rule|context|message)/gi },
  { label: 'addresses the assistant directly', re: /\b(you are now|from now on|act as|pretend to be|roleplay as|your new (role|task|instruction))\b/gi },
  { label: 'imitates a system or role turn', re: /(^|\n)\s*(system|assistant|user)\s*:/gi },
  { label: 'reveals or exfiltrates configuration', re: /\b(reveal|repeat|print|output|show)\b[^.\n]{0,30}\b(system prompt|your (instructions|prompt|rules)|api[_ ]?key|secret|credential)/gi },
  { label: 'instructs a tool call or state change', re: /\b(call|invoke|execute|run)\b[^.\n]{0,25}\b(tool|function|endpoint|webhook)\b/gi },
];

export interface InjectionFinding { label: string; excerpt: string }

export function scanForInjectionPhrasing(text: string): InjectionFinding[] {
  const out: InjectionFinding[] = [];
  const seen = new Set<string>();
  for (const { label, re } of INJECTION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text ?? '')) !== null) {
      const start = Math.max(0, m.index - 40);
      const excerpt = (text.slice(start, m.index + m[0].length + 40)).replace(/\s+/g, ' ').trim();
      const key = `${label}::${excerpt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, excerpt });
      if (out.length >= 12) return out;
      if (m[0].length === 0) re.lastIndex++;   // never loop on a zero-width match
    }
  }
  return out;
}
