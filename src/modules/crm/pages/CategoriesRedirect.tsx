import React from 'react';
import { Navigate } from 'react-router-dom';

const CategoriesRedirect: React.FC = () => (
  <Navigate to="/admin/crm?tab=categories" replace />
);

export default CategoriesRedirect;
