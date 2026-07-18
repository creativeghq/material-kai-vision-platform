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
  // `q` is honored as an alias of `prompt` — ~8 handoff call sites across the app
  // (dashboard hero, SEO dashboard, catalogs, Pinterest import, …) navigate with
  // `?q=…`, which was silently dropped before. Rail #1 of the Capability Fabric (#275):
  // every page→agent handoff carries its seed text reliably.
  const initialPrompt = searchParams.get('prompt') ?? searchParams.get('q') ?? undefined;
  const initialConversationId = searchParams.get('conversation') ?? undefined;
  const initialMoodboardId = searchParams.get('moodboard') ?? undefined;
  const initialAgent = searchParams.get('agent') ?? undefined;
  // Deep-link from a product's "Test on a room" — pre-pin the material so the
  // interior flow already knows which material to apply.
  const pinnedProductId = searchParams.get('pinned_product_id') ?? undefined;
  const initialPinnedMaterial = pinnedProductId
    ? {
        id: pinnedProductId,
        name: searchParams.get('pinned_product_name') ?? 'Selected material',
        imageUrl: searchParams.get('pinned_product_image') ?? undefined,
      }
    : undefined;
  // Deep-link: preload image attachment(s) — `?image=<url>` or `?images=a,b` —
  // so a flow/prompt from another page acts on them. Public URLs (e.g. the
  // generation-images bucket) work directly.
  const imageParam = searchParams.get('image');
  const imagesParam = searchParams.get('images');
  const initialImages = [
    ...(imageParam ? [imageParam] : []),
    ...(imagesParam ? imagesParam.split(',').map((s) => s.trim()).filter(Boolean) : []),
  ];
  // Deep-link: force the generation pipeline (e.g. `?generation_mode=image-edit`).
  const initialGenerationMode = searchParams.get('generation_mode') ?? undefined;
  // Deep-link: launch a specific guided flow — `?quickstart=<toolkitId>:<label>`
  // (e.g. `generation:Test on a room`). Split on the FIRST colon (labels may contain none).
  const quickstartParam = searchParams.get('quickstart');
  const initialQuickStart = quickstartParam && quickstartParam.includes(':')
    ? {
        toolkitId: quickstartParam.slice(0, quickstartParam.indexOf(':')),
        label: quickstartParam.slice(quickstartParam.indexOf(':') + 1),
      }
    : undefined;
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
        initialPrompt={initialPrompt}
        initialConversationId={initialConversationId}
        initialMoodboardId={initialMoodboardId}
        initialAgent={initialAgent}
        initialPinnedMaterial={initialPinnedMaterial}
        initialImages={initialImages.length ? initialImages : undefined}
        initialGenerationMode={initialGenerationMode}
        initialQuickStart={initialQuickStart}
        onConversationChange={handleConversationChange}
      />
    </div>
  );
};

export default AgentHubPage;

