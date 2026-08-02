import React from 'react';
import { Navigate } from 'react-router-dom';

// AI Data moved under AI Configurations. The former per-view routes
// (/admin/metadata, /admin/relevancy, /admin/duplicate-detection) all land on the
// AI Data tab; the sub-view is picked inside the tab.
const AIDataRedirect: React.FC = () => {
  return <Navigate to="/admin/ai-configs?tab=ai-data" replace />;
};

export default AIDataRedirect;
