// import React from 'react'; // Not needed for functional components

import { Link } from 'react-router-dom';
import { Sparkles, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout/Layout';
import { Dashboard } from '@/components/Dashboard/Dashboard';

const Index = () => {
  return (
    <Layout>
      <div className="relative z-10 p-6 pb-0 flex gap-4 flex-wrap items-center">
        <Link to="/design-preview">
          <Button className="w-full sm:w-auto" variant="outline">
            View Design Preview
          </Button>
        </Link>
        <Link to="/design-preview-v2">
          <Button className="w-full sm:w-auto bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0">
            <Sparkles className="w-4 h-4 mr-2" />
            View Visionary Preview (V2)
          </Button>
        </Link>
        <Link to="/design-preview-v3">
          <Button className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-lime-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0">
            <Leaf className="w-4 h-4 mr-2" />
            View Bio-Tech Preview (V3)
          </Button>
        </Link>
      </div>
      <Dashboard />
    </Layout>
  );
};

export default Index;
