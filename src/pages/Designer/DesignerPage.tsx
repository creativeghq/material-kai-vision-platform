/**
 * 3D Room Designer - Main Page
 */
import React, { useEffect } from 'react';
import { DesignerLayout } from '@/components/Designer/DesignerLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export const DesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading Designer...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <DesignerLayout />;
};

