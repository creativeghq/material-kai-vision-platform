import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const VIEW_BY_PATH: Record<string, string> = {
  '/admin/relevancy': 'relevancy',
  '/admin/duplicate-detection': 'duplicates',
};

const AIDataRedirect: React.FC = () => {
  const { pathname } = useLocation();
  const view = VIEW_BY_PATH[pathname.replace(/\/+$/, '')];
  const to = `/admin/materials-data?tab=ai-review${view ? `&view=${view}` : ''}`;
  return <Navigate to={to} replace />;
};

export default AIDataRedirect;
