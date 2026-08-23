/**
 * Skills registry guard (#341).
 *
 * A skill is a playbook the agent loads mid-run via `load_skill`. Four things must line up for one
 * to ever be offered, and EVERY failure among them is silent — the skill simply never appears, no
 * error, no log, nothing a typecheck or a deploy can see:
 *
 *   1. REGISTRATION — the directory exists but `SKILL_FILES` in skills-loader.ts does not import
 *      it. The markdown sits in the repo looking finished and reaches nobody.
 *   2. TWIN DRIFT — SKILL.md is the human/PR-review copy; skill.ts is what actually ships (the
 *      Edge Runtime cannot import .md). They are maintained by hand, so the reviewed text and the
 *      served text are free to diverge — and the review passes on the copy nobody runs.
 *   3. AGENT IDS — `agents:` holds agent IDS (kai, erp, interior-designer), NOT display names.
 *      `getSkillsForAgent` does `skill.agents.includes(agentId)`, so a skill listing "trinity" or
 *      "jarvis" — the names those agents actually show in the UI — is offered to no one. This was
 *      nearly shipped with design-to-quote: [kai, jarvis, trinity, interior-designer], of which
 *      exactly one was a real id.
 *   4. FRONTMATTER — `parseSkillFile` throws on malformed frontmatter and the loader CATCHES it
 *      (console.error), so a typo in the `---` block degrades to the skill not existing.
 *
 * Also pinned: no `String.raw`. String.raw preserves the backslash of an escaped backtick, so
 * three of these skills spent their whole life telling the model to call \`material_search\`
 * instead of `material_search` — 206 mangled code spans across the three files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'supabase/functions/_shared/skills');
const LOADER = join(ROOT, 'supabase/functions/_shared/skills-loader.ts');
const AGENT_CHAT = join(ROOT, 'supabase/functions/agent-chat/index.ts');

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const skillDirs = readdirSync(SKILLS_DIR).filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory());

/** The value skill.ts actually exports — evaluated, not read as source. */
function exportedText(dir: string): string {
  const src = read(join(SKILLS_DIR, dir, 'skill.ts'));
  const body = src.slice(src.indexOf('export default') + 'export default'.length).trim().replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func -- the file is a single template literal; this IS the runtime value.
  return new Function(`return ${body}`)() as string;
}

/** name/slug/description/agents out of the `---` frontmatter, the way the loader reads them. */
function frontmatter(text: string): Record<string, string | string[]> {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('missing or malformed frontmatter');
  const out: Record<string, string | string[]> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    out[k] = v.startsWith('[') && v.endsWith(']')
      ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : v;
  }
  return out;
}

describe('skills registry', () => {
  it('has skills to check (guards a wrong path silently passing everything)', () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });

  it('every skill directory is registered in SKILL_FILES', () => {
    const loader = read(LOADER);
    const unregistered = skillDirs.filter((d) => !loader.includes(`'${d}'`)).sort();
    expect(
      unregistered,
      `Skill(s) on disk but absent from SKILL_FILES in skills-loader.ts — never offered to any ` +
        `agent, with nothing raised: ${unregistered.join(', ')}.`,
    ).toEqual([]);
  });

  it('every registered slug has a directory (no dangling imports)', () => {
    const loader = read(LOADER);
    const registered = [...loader.matchAll(/'([a-z0-9-]+)':\s+\w/g)].map((m) => m[1]);
    const missing = registered.filter((s) => !skillDirs.includes(s)).sort();
    expect(missing, `SKILL_FILES references directories that do not exist: ${missing.join(', ')}`).toEqual([]);
  });

  it('SKILL.md and skill.ts carry byte-identical content', () => {
    for (const d of skillDirs) {
      expect(existsSync(join(SKILLS_DIR, d, 'SKILL.md')), `${d}/SKILL.md is missing`).toBe(true);
      const md = read(join(SKILLS_DIR, d, 'SKILL.md'));
      expect(
        exportedText(d),
        `${d}: skill.ts does not match SKILL.md. The .md is what gets reviewed; the .ts is what ` +
          `ships — regenerate the .ts from the .md rather than editing one of them.`,
      ).toBe(md);
    }
  });

  it('no skill uses String.raw (it leaks the backslash of every escaped backtick)', () => {
    // The tagged-template USAGE, not the words: every one of these files now carries a header
    // comment explaining why String.raw is not used, and a bare substring match flags all of them.
    const offenders = skillDirs.filter((d) => /String\.raw\s*`/.test(read(join(SKILLS_DIR, d, 'skill.ts')))).sort();
    expect(
      offenders,
      `String.raw keeps the backslash in \\\` , so every code span reaches the model as ` +
        `\\\`tool_name\\\` instead of \`tool_name\`: ${offenders.join(', ')}. Use a plain template literal.`,
    ).toEqual([]);
  });

  it('frontmatter parses and carries the fields the loader reads', () => {
    for (const d of skillDirs) {
      const fm = frontmatter(exportedText(d));
      expect(fm.slug, `${d}: slug must equal the directory name (load_skill resolves by slug)`).toBe(d);
      expect(String(fm.name ?? ''), `${d}: missing name`).not.toBe('');
      expect(String(fm.description ?? ''), `${d}: missing description — it is all the agent sees before loading`).not.toBe('');
      expect(Array.isArray(fm.agents) && fm.agents.length > 0, `${d}: agents must be a non-empty [list]`).toBe(true);
    }
  });

  it('every `agents:` entry is a real AGENT_CONFIGS id, not a display name', () => {
    const src = read(AGENT_CHAT);
    const start = src.indexOf('const AGENT_CONFIGS');
    const block = src.slice(start, src.indexOf('\n};', start) + 3);
    const ids = new Set([...block.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]));
    expect(ids.size, 'parsed no agent ids — the AGENT_CONFIGS slice is wrong').toBeGreaterThan(3);

    const bad: string[] = [];
    for (const d of skillDirs) {
      for (const a of frontmatter(exportedText(d)).agents as string[]) {
        if (!ids.has(a)) bad.push(`${d} → "${a}"`);
      }
    }
    expect(
      bad.sort(),
      `Skill(s) targeting an agent id that does not exist — offered to nobody, silently. Note the ` +
        `ids are not the display names: JARVIS is "kai" and Trinity is "erp". Offenders: ${bad.join(', ')}.`,
    ).toEqual([]);
  });

  it('a skill reaches every agent that can actually run it', () => {
    // The bug this exists to stop, measured 2026-08-23: `b2b-manufacturer-research` declared
    // `agents: [kai]`, but 66 of the 67 real `b2b_manufacturer_search` calls came from
    // `product-business` — the orchestrator routes B2B work to Pepper by design. So the playbook
    // was held by the agent doing 1.5% of the work and absent from the one doing the rest.
    //
    // Valid ids and a registered file are not enough: both were correct here. What was wrong was
    // the PAIRING, and nothing looked at it. A skill whose procedure is built on a tool must be
    // offered to every agent that binds that tool, or that agent improvises the procedure.
    const src = read(AGENT_CHAT);
    const start = src.indexOf('const AGENT_CONFIGS');
    const block = src.slice(start, src.indexOf('\n};', start) + 3);

    // agent id -> its declared tool ids.
    //
    // Sliced per entry rather than matched with one cross-entry regex: `demo` declares
    // `tools: []` on a single line, and a lazy `[\s\S]*?` between `id:` and `tools:` simply runs
    // past it into the NEXT agent's multi-line array — which credited demo with Vision's whole
    // toolkit. Anchoring each agent to the span between its own `id:` and the following one is
    // what makes an empty list read as empty.
    const idPositions = [...block.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)',/gm)];
    const toolsByAgent = new Map<string, Set<string>>();
    idPositions.forEach((m, i) => {
      const from = m.index ?? 0;
      const to = i + 1 < idPositions.length ? (idPositions[i + 1].index ?? block.length) : block.length;
      const entry = block.slice(from, to);
      const toolsMatch = entry.match(/tools:\s*\[([\s\S]*?)\]/);
      const ids = toolsMatch ? [...toolsMatch[1].matchAll(/'([a-z0-9_]+)'/g)].map((t) => t[1]) : [];
      // Legacy aliases repeat a real id with an empty list; keep the richest declaration.
      const prev = toolsByAgent.get(m[1]);
      if (!prev || ids.length > prev.size) toolsByAgent.set(m[1], new Set(ids));
    });
    expect(toolsByAgent.size, 'parsed no agent tool lists — the AGENT_CONFIGS slice is wrong').toBeGreaterThan(3);
    expect(toolsByAgent.get('demo')?.size, 'demo declares no tools; a non-empty set means the slice leaked').toBe(0);

    const gaps: string[] = [];
    for (const d of skillDirs) {
      const text = exportedText(d);
      const fm = frontmatter(text);
      const offeredTo = new Set(fm.agents as string[]);

      // The tools this skill's procedure is built on: every `backtick_tool_name` in its body
      // that is a real tool some agent declares. A passing mention still counts — a skill that
      // names a tool is telling the reader how to use it.
      const mentioned = new Set(
        [...text.matchAll(/`([a-z][a-z0-9_]{4,})`/g)].map((m) => m[1])
          .filter((t) => [...toolsByAgent.values()].some((s) => s.has(t))),
      );
      // Fewer than three named tools is not a procedure, it is a mention. Two shared core tools
      // (`material_search`, `analyze_inspiration_url`) are bound by almost every agent, so a
      // 2-tool threshold flags the entire roster on every skill and the signal disappears.
      if (mentioned.size < 3) continue;

      for (const [agentId, agentTools] of toolsByAgent) {
        if (offeredTo.has(agentId)) continue;
        // Only flag an agent that can run essentially the WHOLE procedure. A specialist holding
        // one incidental tool out of eight is not the intended audience, and demanding otherwise
        // would push every skill onto the generalist.
        const covered = [...mentioned].filter((t) => agentTools.has(t));
        if (covered.length >= 3 && covered.length / mentioned.size >= 0.8) {
          gaps.push(`${d} → ${agentId} (binds ${covered.length}/${mentioned.size} of its tools, not offered the skill)`);
        }
      }
    }
    expect(
      gaps.sort(),
      `Agent(s) that bind a skill's tools but are never offered the skill — they will improvise ` +
        `the procedure it exists to specify. Add the id to that skill's \`agents:\` and run ` +
        `\`npm run skills:sync\`. Gaps: ${gaps.join(', ')}.`,
    ).toEqual([]);
  });
});
