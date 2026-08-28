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
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-2 text-sm leading-relaxed">{children}</p>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
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
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-sm border border-white/20 rounded">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/10">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold border-b border-white/20">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-white/10">{children}</td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
