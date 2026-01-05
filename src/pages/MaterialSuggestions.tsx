// import React from 'react'; // Not needed for functional components

import { Layout } from '@/components/core/Layout';
import { MaterialSuggestionsPanel } from '@/components/admin/MaterialSuggestionsPanel';

const MaterialSuggestions = () => {
  return (
    <Layout>
      <MaterialSuggestionsPanel />
    </Layout>
  );
};

export default MaterialSuggestions;
