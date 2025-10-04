// import React from 'react'; // Not needed for functional components

import { Layout } from '@/components/Layout/Layout';
import { MaterialSuggestionsPanel } from '@/components/Admin/MaterialSuggestionsPanel';

const MaterialSuggestions = () => {
  return (
    <Layout>
      <MaterialSuggestionsPanel />
    </Layout>
  );
};

export default MaterialSuggestions;
