// MDXEditor parses markdown as MDX, where a bare `<` opens a JSX tag: `Low (<30%)` or
// `superseded by <file>` fails the whole parse and the editor renders EMPTY.
const EDITOR_OWN_TAG = /^<(?:!--|\/?(?:u|sub|sup|span|mark)\b[^<>]*>)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[^`][\s\S]*?\1(?!`)/g;

function escapeAngles(text: string): string {
  return text.replace(/</g, (lt, offset: number) =>
    EDITOR_OWN_TAG.test(text.slice(offset)) || text[offset - 1] === '\\' ? lt : '\\<',
  );
}

function escapeOutsideInlineCode(line: string): string {
  let out = '';
  let last = 0;
  for (const m of line.matchAll(INLINE_CODE)) {
    out += escapeAngles(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + escapeAngles(line.slice(last));
}

export function toEditorMarkdown(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const open = FENCE.exec(line)?.[1];
      if (fence) {
        if (open && open[0] === fence[0] && open.length >= fence.length) fence = null;
        return line;
      }
      if (open) {
        fence = open;
        return line;
      }
      return escapeOutsideInlineCode(line);
    })
    .join('\n');
}
