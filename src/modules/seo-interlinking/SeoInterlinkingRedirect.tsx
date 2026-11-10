import React from 'react';
import { Navigate } from 'react-router-dom';

const SeoInterlinkingRedirect: React.FC = () => (
  <Navigate to="/admin" replace />
);

export default SeoInterlinkingRedirect;
