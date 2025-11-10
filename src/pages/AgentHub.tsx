/**
 * AgentHub Page
 * Multi-agent AI interface for Material Kai Vision Platform
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';

import { AgentHub as AgentHubComponent } from '@/components/AI/AgentHub';
import { supabase } from '@/integrations/supabase/client';

const AgentHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<'viewer' | 'member' | 'admin' | 'owner'>('member');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        // Get user's role from workspace_members
        const { data: workspaceData } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (workspaceData?.role) {
          setUserRole(workspaceData.role as 'viewer' | 'member' | 'admin' | 'owner');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRole();
  }, [navigate]);

  const handleMaterialSelect = (materialId: string) => {
    console.log('Material selected:', materialId);
    navigate(`/catalog?material=${materialId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Agent Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* Header - User-facing style like MoodBoard */}
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Agent Hub</h1>
              <p className="text-muted-foreground">
                Multi-agent AI orchestration powered by Mastra framework
              </p>
            </div>
          </div>

          {/* Agent Hub Component */}
          <AgentHubComponent
            userRole={userRole}
            onMaterialSelect={handleMaterialSelect}
          />
        </div>
      </div>
    </div>
  );
};

export default AgentHubPage;

