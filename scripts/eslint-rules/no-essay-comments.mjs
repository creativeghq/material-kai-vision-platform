/**
 * ESLint rule: a comment states what the code IS; it does not narrate how it got that way.
 *
 * Consecutive `//` lines count as ONE comment, and `@tag` lines do not count at all, so real
 * JSDoc is never the thing that trips this. Reports only — a fixer that silently deleted
 * someone's rationale would be worse than the essay. `npm run comments:trim` is the explicit fix.
 */
import {
  MAX_PROSE_LINES, contentOf, isDirective, proseLineCount,
} from '../lib/commentBudget.mjs';

function startsLine(text, offset) {
  let k = offset - 1;
  while (k >= 0 && text[k] !== '\n') {
    if (!/\s/.test(text[k])) return false;
    k--;
  }
  return true;
}

export const noEssayComments = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Cap comment prose so a file reads as code, not as an essay.' },
    schema: [{
      type: 'object',
      properties: { max: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    }],
    messages: {
      tooLong:
        'Comment is {{prose}} prose lines; the budget is {{max}}. Lead with what this IS, and put the ' +
        'history in the commit message or docs/. Run `npm run comments:trim` to cut it.',
    },
  },
  create(context) {
    const max = context.options?.[0]?.max ?? MAX_PROSE_LINES;
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const text = sourceCode.getText();

    return {
      Program() {
        const comments = sourceCode.getAllComments()
          .filter((c) => startsLine(text, c.range[0]));

        const groups = [];
        let cur = null;
        for (const c of comments) {
          if (c.type === 'Block') { groups.push({ comments: [c], kind: 'block' }); cur = null; continue; }
          if (cur && c.loc.start.line === cur.comments[cur.comments.length - 1].loc.end.line + 1) {
            cur.comments.push(c);
            continue;
          }
          cur = { comments: [c], kind: 'line' };
          groups.push(cur);
        }

        for (const g of groups) {
          const first = g.comments[0];
          const last = g.comments[g.comments.length - 1];
          const raw = text.slice(first.range[0], last.range[1]);
          if (isDirective(raw)) continue;
          const prose = proseLineCount(contentOf(raw, g.kind));
          if (prose <= max) continue;
          context.report({
            loc: { start: first.loc.start, end: last.loc.end },
            messageId: 'tooLong',
            data: { prose, max },
          });
        }
      },
    };
  },
};

export default { rules: { 'no-essay-comments': noEssayComments } };
