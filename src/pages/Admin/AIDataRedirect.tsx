import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const PATH_TO_TAB: Record<string, string> = {
  '/admin/metadata': 'metadata',
  '/admin/relevancy': 'relevancy',
  '/admin/duplicate-detection': 'duplicates',
};

const AIDataRedirect: React.FC = () => {
  const { pathname } = useLocation();
  const tab = PATH_TO_TAB[pathname] || 'metadata';
  return <Navigate to={`/admin/ai-data?tab=${tab}`} replace />;
};

export default AIDataRedirect;
