import React from 'react';
import { Navigate } from 'react-router-dom';

const SeoToolkitRedirect: React.FC = () => (
  <Navigate to="/admin" replace />
);

export default SeoToolkitRedirect;
