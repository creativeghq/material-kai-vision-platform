/**
 * AgentHub Page
 * Multi-agent AI interface for Materials Hub
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AgentHub as AgentHubComponent } from '@/components/features/ai/AgentHub';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { resolveCapabilityHandoff } from '@/config/capabilities';
import { useToast } from '@/hooks/use-toast';

const ALERT_PARAM = /^(price|mention|job):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const AgentHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // `q` is honored as an alias of `prompt` — ~8 handoff call sites across the app
  // (dashboard hero, SEO dashboard, catalogs, Pinterest import, …) navigate with
  // `?q=…`, which was silently dropped before. Rail #1 of the Capability Fabric:
  // every page→agent handoff carries its seed text reliably.
  const initialPrompt = searchParams.get('prompt') ?? searchParams.get('q') ?? undefined;
  const initialConversationId = searchParams.get('conversation') ?? undefined;
  const initialMoodboardId = searchParams.get('moodboard') ?? undefined;
  // Capability Fabric rail: `?capability=<id>` resolves the owning agent + a toolkit
  // quick-start from the shared registry, so every capability has ONE uniform handoff into the
  // agent instead of each call site hand-rolling ?agent=/?quickstart=. Explicit params still win.
  const capabilityParam = searchParams.get('capability') ?? undefined;
  const capHandoff = capabilityParam ? resolveCapabilityHandoff(capabilityParam) : {};
  const initialAgent = searchParams.get('agent') ?? capHandoff.agentId ?? undefined;
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
        website: searchParams.get('website') ?? undefined,
        keyword: searchParams.get('keyword') ?? undefined,
      }
    : capHandoff.quickStart;
  // When arriving via `?capability=` with NO specific action, hand the capability's toolkit to the
  // Hub so it auto-enables it and shows its quick-starts (onboarding) — never a blank chat.
  const initialToolkitId = initialQuickStart ? undefined : capHandoff.toolkitId;
  const { workspaceRole } = useWorkspace();
  const userRole = (workspaceRole === 'support' ? 'member' : workspaceRole ?? 'member') as 'viewer' | 'member' | 'admin' | 'owner';
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [liveConversations, setLiveConversations] = useState<ReadonlySet<string>>(new Set());
  const alertParam = searchParams.get('alert');

  // A stale link must not open an empty chat on an id that no longer exists: a monitoring
  // alert gets a new thread built from its log, anything else says the chat is gone.
  useEffect(() => {
    if (!initialConversationId || liveConversations.has(initialConversationId)) return;
    let cancelled = false;
    const resolve = async () => {
      const { data, error } = await supabase
        .from('agent_chat_conversations').select('id').eq('id', initialConversationId).maybeSingle();
      if (cancelled) return;
      if (data || error) {
        setLiveConversations((prev) => new Set(prev).add(initialConversationId));
        return;
      }
      const alert = alertParam?.match(ALERT_PARAM);
      if (alert) {
        const { data: reopened, error: reopenError } = await supabase.rpc('reopen_monitoring_conversation' as never, {
          p_kind: alert[1], p_tracked_id: alert[2],
        } as never);
        if (cancelled) return;
        if (!reopenError && reopened) {
          const id = reopened as unknown as string;
          setLiveConversations((prev) => new Set(prev).add(id));
          setSearchParams({ conversation: id }, { replace: true });
          return;
        }
      }
      toast({ title: 'That chat was deleted', description: 'Starting a new conversation instead.' });
      setSearchParams({}, { replace: true });
    };
    void resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId, alertParam, liveConversations]);

  useEffect(() => {
    const checkSignedIn = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) navigate('/auth');
      } catch (error) {
        console.error('Error checking sign-in:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSignedIn();
  }, [navigate]);

  const handleConversationChange = (conversationId: string | null) => {
    // Preserve the moodboard context across conversation changes so a reload
    // doesn't lose "adding to moodboard X".
    const next: Record<string, string> = {};
    if (conversationId) {
      next.conversation = conversationId;
      setLiveConversations((prev) => (prev.has(conversationId) ? prev : new Set(prev).add(conversationId)));
    }
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
        initialConversationId={initialConversationId && liveConversations.has(initialConversationId) ? initialConversationId : undefined}
        initialMoodboardId={initialMoodboardId}
        initialAgent={initialAgent}
        initialPinnedMaterial={initialPinnedMaterial}
        initialImages={initialImages.length ? initialImages : undefined}
        initialGenerationMode={initialGenerationMode}
        initialQuickStart={initialQuickStart}
        initialToolkitId={initialToolkitId}
        onConversationChange={handleConversationChange}
      />
    </div>
  );
};

export default AgentHubPage;

