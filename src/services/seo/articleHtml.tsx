import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { CALLOUT_KIND_PATTERN } from './calloutKinds';

const CALLOUT_TAG = new RegExp(`^\\[!(${CALLOUT_KIND_PATTERN})\\][ \\t]*`, 'i');
const PLACEHOLDER_ANCHOR = /^\[?(INTERNAL|SOURCE):/i;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const textOf = (n: HastNode): string => n.value ?? (n.children ?? []).map(textOf).join('');

function splitCalloutTitle(nodes: HastNode[]): { title: HastNode[]; body: HastNode[] } {
  const title: HastNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === 'element' && n.tagName === 'br') return { title, body: nodes.slice(i + 1) };
    const nl = n.type === 'text' ? (n.value ?? '').indexOf('\n') : -1;
    if (nl >= 0) {
      const before = (n.value ?? '').slice(0, nl);
      const after = (n.value ?? '').slice(nl + 1);
      if (before) title.push({ type: 'text', value: before });
      return { title, body: [...(after ? [{ type: 'text', value: after }] : []), ...nodes.slice(i + 1)] };
    }
    title.push(n);
  }
  return { title, body: [] };
}

function rehypeCallouts() {
  const walk = (node: HastNode) => {
    for (const child of node.children ?? []) {
      walk(child);
      if (child.type !== 'element' || child.tagName !== 'blockquote') continue;
      const first = child.children?.find((c) => c.type === 'element');
      const text = first?.tagName === 'p' ? first.children?.[0] : undefined;
      const m = text?.type === 'text' ? CALLOUT_TAG.exec(text.value ?? '') : null;
      if (!first || !text || !m) continue;
      text.value = (text.value ?? '').slice(m[0].length);
      const { title, body } = splitCalloutTitle(first.children ?? []);
      first.children = body;
      const keepFirst = body.some((n) => n.type !== 'text' || (n.value ?? '').trim() !== '');
      const rest = (child.children ?? []).filter((c) => c !== first || keepFirst);
      const kind = m[1].toLowerCase();
      child.tagName = 'aside';
      child.properties = { className: ['callout', `callout-${kind}`], dataCallout: kind };
      child.children = textOf({ type: 'root', children: title }).trim()
        ? [{ type: 'element', tagName: 'p', properties: { className: ['callout-title'] }, children: title }, ...rest]
        : rest;
    }
  };
  return (tree: HastNode) => walk(tree);
}

const EXPORT_COMPONENTS: Components = {
  img: ({ src, alt }) => (typeof src === 'string' && /^https:\/\//i.test(src) ? <img src={src} alt={alt ?? ''} /> : <>{alt}</>),
  a: ({ href, children, node }) => {
    const anchor = textOf((node ?? { type: 'text' }) as HastNode);
    if (PLACEHOLDER_ANCHOR.test(anchor)) return <>{anchor.replace(PLACEHOLDER_ANCHOR, '').replace(/\]$/, '').trim()}</>;
    return <a href={href}>{children}</a>;
  },
};

export function renderArticleHtml(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeCallouts]} components={EXPORT_COMPONENTS}>
      {markdown}
    </ReactMarkdown>,
  );
}
