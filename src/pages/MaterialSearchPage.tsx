// Material Search — the platform's primary catalog search surface (7-vector fusion
// via MIVAA /api/rag/search). Mounts the previously-orphaned UnifiedSearchInterface
// (text + image + material/knowledge/PDF results) as a first-class page reachable
// from the top bar. The agent's material_search tool hits the SAME backend, so chat
// search and this page stay consistent.
import React from 'react';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { UnifiedSearchInterface } from '@/components/features/search/UnifiedSearchInterface';

const MaterialSearchPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        icon={Search}
        title="Search"
        subtitle="Search materials, catalogs & knowledge — by text or image"
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        <UnifiedSearchInterface />
      </div>
    </div>
  );
};

export default MaterialSearchPage;
