import React from 'react';
import { Navigate } from 'react-router-dom';

const SeoInterlinkingRedirect: React.FC = () => (
  <Navigate to="/admin/operations?tab=seo-toolkit&seotab=interlinking" replace />
);

export default SeoInterlinkingRedirect;
