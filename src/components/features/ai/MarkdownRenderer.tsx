/**
 * Markdown Renderer Component
 * Renders markdown content with proper formatting and styling
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useInRouterContext } from 'react-router-dom';

import { linkifyDestinations } from '@/utils/linkifyDestinations';
import { safeHref } from '@/utils/safeUrl';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /**
   * Turn the platform's own place names ("Profile → Social Accounts") into links.
   * On by default — a reply that names where to go and does not go there is a dead end.
   * Opt out only where the destination would be meaningless (content rendered outside the app).
   */
  linkifyRoutes?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  linkifyRoutes = true,
}) => {
  const inRouter = useInRouterContext();
  const source = linkifyRoutes ? linkifyDestinations(content) : content;
  return (
    <div className={`markdown-content text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — inherit color from parent bubble
          // A heading opens a SECTION, so the space belongs above it — and never above the
          // first one, where it is a gap between the bubble's edge and its own first line.
          h1: ({ children }) => (
            <h1 className="mb-2 mt-6 text-xl font-bold leading-snug first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-lg font-semibold leading-snug first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-4 text-base font-semibold leading-snug first:mt-0">{children}</h3>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-3 text-sm leading-relaxed last:mb-0">{children}</p>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm">{children}</li>
          ),
          // Bold and italic
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic opacity-80">{children}</em>
          ),
          // Code — semi-transparent so it works on any background
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1 py-0.5 rounded bg-white/20 text-xs font-mono">{children}</code>
            ) : (
              <code className="block p-2 rounded bg-white/20 text-xs font-mono overflow-x-auto">{children}</code>
            );
          },
          // Horizontal rule
          hr: () => <hr className="my-3 border-white/30" />,
          // Links. An in-app route is navigated, not opened in a new tab: the reader asked to
          // GO somewhere in the product, and a second tab of the same app is not that.
          a: ({ children, href }) => {
            const internal = !!href && href.startsWith('/') && !href.startsWith('//');
            if (internal && inRouter) {
              return (
                <Link to={href!} className="underline opacity-90 hover:opacity-100">
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={safeHref(href)}
                className="underline opacity-90 hover:opacity-100"
                {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                {children}
              </a>
            );
          },
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/40 pl-3 my-2 italic opacity-80">
              {children}
            </blockquote>
          ),
          // Tables
          table: ({ children }) => (
            <div className="table-scroll my-2 rounded-sm border border-hairline">
              <table className="min-w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface-sunken">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-hairline px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-hairline px-3 py-2 align-top break-words">{children}</td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
