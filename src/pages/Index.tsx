// import React from 'react'; // Not needed for functional components

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout/Layout';
import { Dashboard } from '@/components/Dashboard/Dashboard';

const Index = () => {
  return (
    <Layout>
      <div className="p-6 pb-0">
        <Link to="/design-preview">
          <Button className="w-full sm:w-auto">
            View Design Preview
          </Button>
        </Link>
      </div>
      <Dashboard />
    </Layout>
  );
};

export default Index;
