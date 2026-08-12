import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/core/Layout';
import { Dashboard } from '@/components/features/dashboard/Dashboard';
import { usePermissions } from '@/hooks/usePermissions';

const Index = () => {
  const { loading, persona } = usePermissions();
  // Invited sales reps land directly on their Sales portal, not the full dashboard.
  // Only once the persona is actually KNOWN — while it resolves, every user looks
  // like an end user, so redirecting on a loading persona would send nobody anywhere
  // and gating on it blanks the page for everyone.
  if (!loading && (persona === 'sales' || persona === 'sales_manager')) {
    return <Navigate to="/sales" replace />;
  }
  // Deliberately NOT gated on `loading`. Returning null while WorkspaceContext
  // resolved memberships meant the whole app — nav bar included — was absent for the
  // length of two queries, then appeared at once: the first and most visible stage of
  // the dashboard "blink". The chrome and the hero are static, and every data child
  // below already holds its own reserved space, so the page can paint its final
  // geometry immediately and fill in place.
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

export default Index;
