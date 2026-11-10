import React from 'react';
import { Link } from 'react-router-dom';

interface SourceDocumentLinkProps {
  documentId?: string | null;
  filename?: string | null;
}

export const SourceDocumentLink: React.FC<SourceDocumentLinkProps> = ({ documentId, filename }) => {
  if (!documentId) return null;
  return (
    <Link
      to={`/admin/documents/${documentId}`}
      className="block max-w-[220px] truncate text-xs text-primary hover:underline"
      title={filename ?? documentId}
      onClick={(e) => e.stopPropagation()}
    >
      {filename || 'Source Document'}
    </Link>
  );
};
