import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/core/Layout';
import { Dashboard } from '@/components/features/dashboard/Dashboard';
import { usePermissions } from '@/hooks/usePermissions';

const Index = () => {
  const { loading, persona } = usePermissions();
  // Invited sales reps land directly on their Sales portal, not the full dashboard.
  if (loading) return null;
  if (persona === 'sales' || persona === 'sales_manager') return <Navigate to="/sales" replace />;
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

export default Index;
