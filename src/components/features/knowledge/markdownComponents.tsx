import React from 'react';
import { type Components } from 'react-markdown';

// Explicit, theme-safe typography for rendered KB / brand markdown. (The repo has
// no @tailwindcss/typography plugin, so `prose-*` classes are dead no-ops and
// content renders flat — no heading hierarchy, no list bullets.) Hierarchy comes
// from size + a section underline, not heavy weights (matches the platform's
// light-weight heading aesthetic). Body stays readable, not bold.
export const mdComponents: Components = {
  h1: ({ node, ...p }) => <h2 className="text-2xl font-medium tracking-tight text-foreground mt-8 mb-3" {...p} />,
  // h2/h3 carry rehype-slug ids on the article view; make them clickable anchor
  // links (a per-headline shareable URL) when an id is present.
  h2: ({ id, children }) => (
    <h2 id={id} className="text-xl font-medium tracking-tight text-foreground mt-8 mb-3 pb-1.5 border-b border-border scroll-mt-24 group">
      {id ? <a href={`#${id}`} className="no-underline text-foreground hover:text-primary">{children}<span className="ml-1 opacity-0 group-hover:opacity-40 text-primary">#</span></a> : children}
    </h2>
  ),
  h3: ({ id, children }) => (
    <h3 id={id} className="text-base font-semibold text-foreground mt-6 mb-2 scroll-mt-24 group">
      {id ? <a href={`#${id}`} className="no-underline text-foreground hover:text-primary">{children}<span className="ml-1 opacity-0 group-hover:opacity-40 text-primary">#</span></a> : children}
    </h3>
  ),
  h4: ({ node, ...p }) => <h4 className="text-sm font-semibold text-foreground mt-4 mb-1.5" {...p} />,
  p: ({ node, ...p }) => <p className="text-[15px] leading-7 text-foreground/80 my-3" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-6 my-3 space-y-1.5 marker:text-muted-foreground/60" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-6 my-3 space-y-1.5 marker:text-muted-foreground/60" {...p} />,
  li: ({ node, ...p }) => <li className="text-[15px] leading-7 text-foreground/80 pl-1" {...p} />,
  a: ({ node, ...p }) => <a className="text-primary underline underline-offset-2 hover:opacity-80" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  hr: () => <hr className="my-6 border-border" />,
  blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-primary/40 pl-4 my-4 italic text-muted-foreground" {...p} />,
  code: ({ node, ...p }) => <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono" {...p} />,
  pre: ({ node, ...p }) => <pre className="bg-muted rounded-xl border border-border p-4 overflow-x-auto my-4 text-sm [&_code]:bg-transparent [&_code]:p-0" {...p} />,
  table: ({ node, ...p }) => (
    <div className="table-scroll my-4 rounded-sm border border-hairline">
      <table className="w-full text-sm border-collapse" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="bg-surface-sunken" {...p} />,
  th: ({ node, ...p }) => <th className="border-b border-hairline px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground" {...p} />,
  td: ({ node, ...p }) => <td className="border-b border-hairline px-3 py-2 align-top break-words text-foreground/80" {...p} />,
};
