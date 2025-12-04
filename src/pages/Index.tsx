// import React from 'react'; // Not needed for functional components

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout/Layout';
import { Dashboard } from '@/components/Dashboard/Dashboard';

const Index = () => {
  return (
    <Layout>
      <div className="p-6 pb-0 flex gap-4 flex-wrap">
        <Link to="/design-preview">
          <Button className="w-full sm:w-auto">
            View Design Preview
          </Button>
        </Link>
        <Link to="/design-preview-v2">
          <Button className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700">
            View Visionary Preview (V2)
          </Button>
        </Link>
      </div>
      <Dashboard />
    </Layout>
  );
};

export default Index;
