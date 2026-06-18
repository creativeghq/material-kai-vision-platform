/**
 * AgentHub Page
 * Multi-agent AI interface for Materials Hub
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AgentHub as AgentHubComponent } from '@/components/features/ai/AgentHub';
import { supabase } from '@/integrations/supabase/client';

const AgentHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPrompt = searchParams.get('prompt') ?? undefined;
  const initialConversationId = searchParams.get('conversation') ?? undefined;
  const initialMoodboardId = searchParams.get('moodboard') ?? undefined;
  const [userRole, setUserRole] = useState<'viewer' | 'member' | 'admin' | 'owner'>('member');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigate('/auth');
          return;
        }

        // Get user's role from workspace_members
        const { data: workspaceData } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

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

  const handleConversationChange = (conversationId: string | null) => {
    // Preserve the moodboard context across conversation changes so a reload
    // doesn't lose "adding to moodboard X".
    const next: Record<string, string> = {};
    if (conversationId) next.conversation = conversationId;
    if (initialMoodboardId) next.moodboard = initialMoodboardId;
    setSearchParams(next, { replace: true });
  };

  const handleMaterialSelect = (materialId: string) => {
    console.log('Material selected:', materialId);
    navigate(`/compare?ids=${materialId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Agent Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Agent Hub Component - Full Screen */}
      <AgentHubComponent
        userRole={userRole}
        onMaterialSelect={handleMaterialSelect}
        initialPrompt={initialPrompt}
        initialConversationId={initialConversationId}
        initialMoodboardId={initialMoodboardId}
        onConversationChange={handleConversationChange}
      />
    </div>
  );
};

export default AgentHubPage;

