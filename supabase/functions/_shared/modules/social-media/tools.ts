/**
 * Social Media Tools: callSocialFunction helper + all social tool factories
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════════
// Social Media Tools
// ═══════════════════════════════════════════════════════════════

/** Helper to call social media edge functions */
export async function callSocialFunction(functionName: string, body: unknown, timeoutMs = 60_000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `${functionName} error ${response.status}: ${text}` };
    }
    return await response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Social Media Tool: Connect Account
 * Returns a Late.dev OAuth URL for the user to connect a social platform
 */
export const createSocialConnectAccountTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ platform }) => {
      try {
        onProgress?.(`Generating OAuth URL for ${platform}...`);
        const result = await callSocialFunction('late-oauth', {
          action: 'connect',
          platform,
          workspace_id: workspaceId,
        });
        if (!result.success) return JSON.stringify({ success: false, error: result.error });
        return JSON.stringify({
          success: true,
          platform,
          oauth_url: result.oauth_url,
          message: `Click this link to connect your ${platform} account: ${result.oauth_url}`,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_connect_account',
      description: 'Connect a social media account (Instagram, LinkedIn, Facebook, TikTok, Pinterest, YouTube, Twitter/X, Threads) via OAuth. Returns a URL the user must visit to authorise the connection.',
      schema: z.object({
        platform: z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'pinterest', 'youtube', 'twitter', 'threads'])
          .describe('The social media platform to connect'),
      }),
    }
  );
};

/**
 * Social Media Tool: List Connected Accounts
 */
export const createSocialListAccountsTool = (userId: string, workspaceId: string) => {
  return tool(
    async ({ include_inactive }) => {
      try {
        const result = await callSocialFunction('late-oauth', {
          action: 'list',
          workspace_id: workspaceId,
          include_inactive: include_inactive ?? false,
        });
        if (!result.success) return JSON.stringify({ success: false, error: result.error });

        const accounts = (result.accounts || []) as Array<{
          id: string; platform: string; handle: string; display_name: string;
          followers_count: number; is_active: boolean; last_synced_at: string;
        }>;
        return JSON.stringify({
          success: true,
          count: accounts.length,
          accounts: accounts.map(a => ({
            id: a.id,
            platform: a.platform,
            handle: a.handle,
            display_name: a.display_name,
            followers: a.followers_count,
            active: a.is_active,
            last_synced: a.last_synced_at,
          })),
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_list_accounts',
      description: 'List all connected social media accounts for the workspace, showing platform, handle, and follower counts.',
      schema: z.object({
        include_inactive: z.boolean().optional().describe('Include previously disconnected accounts'),
      }),
    }
  );
};

/**
 * Social Media Tool: Disconnect Account
 */
export const createSocialDisconnectAccountTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ social_account_id }) => {
      try {
        onProgress?.('Disconnecting account...');
        const result = await callSocialFunction('late-oauth', {
          action: 'disconnect',
          social_account_id,
        });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_disconnect_account',
      description: 'Disconnect a social media account from the workspace. Requires the account ID from social_list_accounts.',
      schema: z.object({
        social_account_id: z.string().describe('UUID of the social account to disconnect'),
      }),
    }
  );
};

/**
 * Social Media Tool: Generate Post (caption + hashtags)
 * Credits: 2 cr via generate-social-content edge function
 */
export const createSocialGeneratePostTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, platform, tone, product_info, hashtag_count }) => {
      try {
        onProgress?.(`Writing ${platform} caption for: ${topic}...`);
        const result = await callSocialFunction('generate-social-content', {
          user_id: userId,
          workspace_id: workspaceId,
          topic,
          platform,
          tone: tone ?? 'professional',
          product_info,
          include_hashtags: true,
          hashtag_count: hashtag_count ?? 10,
        });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_generate_post',
      description: 'Generate platform-optimised captions and hashtags for a social media post using AI. Costs 2 credits. Returns 3 caption variants to choose from.',
      schema: z.object({
        topic: z.string().describe('What the post is about — e.g. "Calacatta marble kitchen renovation"'),
        platform: z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'pinterest', 'youtube', 'twitter', 'threads'])
          .describe('Target platform (affects caption length and tone)'),
        tone: z.enum(['professional', 'casual', 'inspirational', 'promotional']).optional()
          .describe('Tone of the caption (default: professional)'),
        product_info: z.string().optional().describe('Product details to mention, e.g. material name, specs, finish'),
        hashtag_count: z.number().int().min(1).max(30).optional().describe('Number of hashtags to generate (default: 10)'),
      }),
    }
  );
};

/**
 * Social Media Tool: Generate Image
 * Routes to Aurora (lifestyle), Gemini (product/interior), or FLUX (artistic)
 * Credits: 5-10 cr via generate-social-image edge function
 */
export const createSocialGenerateImageTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ prompt, image_type, model, aspect_ratio, reference_image_url, post_id }) => {
      try {
        onProgress?.(`Generating ${image_type} image${model ? ` with ${model}` : ' (auto-selecting model)'}...`);
        const result = await callSocialFunction('generate-social-image', {
          user_id: userId,
          workspace_id: workspaceId,
          prompt,
          image_type,
          model: model ?? 'auto',
          aspect_ratio: aspect_ratio ?? '1:1',
          reference_image_url,
          post_id,
        }, 90_000);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_generate_image',
      description: `Generate a high-quality image for social media using AI. Costs 5-10 credits depending on model.
Model auto-selection: lifestyle/people → Aurora (xAI, 10cr), product/interior → Gemini Flash (5cr), artistic/textured → FLUX 2 Pro (6cr).
Returns image_url ready to use in a post.`,
      schema: z.object({
        prompt: z.string().describe('Detailed image generation prompt'),
        image_type: z.enum(['lifestyle', 'product', 'interior', 'artistic'])
          .describe('Type of image — determines which AI model is used'),
        model: z.enum(['aurora', 'gemini', 'flux', 'auto']).optional()
          .describe('Override model selection (default: auto)'),
        aspect_ratio: z.enum(['1:1', '4:5', '9:16', '16:9']).optional()
          .describe('Image aspect ratio — 1:1 for feed, 9:16 for stories/reels (default: 1:1)'),
        reference_image_url: z.string().optional().describe('Optional reference image URL for style guidance'),
        post_id: z.string().optional().describe('UUID of an existing draft post to attach this image to'),
      }),
    }
  );
};

/**
 * Social Media Tool: Generate Video
 * Kling 3.0 for social reels (cinematic + audio), Veo 2.0 for premium
 * Credits: 20-30 cr via generate-social-video edge function
 */
export const createSocialGenerateVideoTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ prompt, source_image_url, model, aspect_ratio, duration_seconds, post_id }) => {
      try {
        onProgress?.(`Starting video generation with ${model ?? 'kling-3.0'}...`);
        const result = await callSocialFunction('generate-social-video', {
          user_id: userId,
          workspace_id: workspaceId,
          prompt,
          source_image_url,
          model: model ?? 'kling-3.0',
          aspect_ratio: aspect_ratio ?? '9:16',
          duration_seconds: duration_seconds ?? 10,
          post_id,
        }, 120_000);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_generate_video',
      description: `Generate a short video for social media. Costs 20 cr (Kling 3.0, cinematic + audio) or 30 cr (Veo 2.0, premium).
Best for: Instagram Reels, TikTok, LinkedIn video posts.
Returns a video_url or prediction_id if still processing.`,
      schema: z.object({
        prompt: z.string().describe('Video generation prompt — describe motion, scene, mood'),
        source_image_url: z.string().describe('Source image URL to animate'),
        model: z.enum(['kling-3.0', 'veo-2']).optional()
          .describe('kling-3.0 = 20cr cinematic+audio; veo-2 = 30cr premium (default: kling-3.0)'),
        aspect_ratio: z.enum(['9:16', '16:9', '1:1']).optional()
          .describe('9:16 for Reels/TikTok, 16:9 for YouTube (default: 9:16)'),
        duration_seconds: z.number().int().min(5).max(15).optional()
          .describe('Video duration in seconds (default: 10)'),
        post_id: z.string().optional().describe('UUID of draft post to attach video to'),
      }),
    }
  );
};

/**
 * Social Media Tool: Publish Post Now
 */
export const createSocialPublishPostTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ post_id, social_account_id }) => {
      try {
        onProgress?.('Publishing post...');
        const result = await callSocialFunction('late-publish', {
          user_id: userId,
          workspace_id: workspaceId,
          post_id,
          social_account_id,
          action: 'publish_now',
        });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_publish_post',
      description: 'Publish a post immediately to a connected social media account via Late.dev. No credit cost — uses your Late.dev subscription.',
      schema: z.object({
        post_id: z.string().describe('UUID of the social_posts draft to publish'),
        social_account_id: z.string().describe('UUID of the social account to publish to'),
      }),
    }
  );
};

/**
 * Social Media Tool: Schedule Post
 */
export const createSocialSchedulePostTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ post_id, social_account_id, scheduled_at }) => {
      try {
        onProgress?.(`Scheduling post for ${scheduled_at}...`);
        const result = await callSocialFunction('late-publish', {
          user_id: userId,
          workspace_id: workspaceId,
          post_id,
          social_account_id,
          action: 'schedule',
          scheduled_at,
        });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_schedule_post',
      description: 'Schedule a social media post for a future date/time via Late.dev. No credit cost.',
      schema: z.object({
        post_id: z.string().describe('UUID of the social_posts draft to schedule'),
        social_account_id: z.string().describe('UUID of the social account to post to'),
        scheduled_at: z.string().describe('ISO 8601 datetime to publish, e.g. "2026-03-20T09:00:00Z"'),
      }),
    }
  );
};

/**
 * Social Media Tool: Get Best Time to Post
 */
export const createSocialGetBestTimeTool = (userId: string, workspaceId: string) => {
  return tool(
    async ({ platform, social_account_id }) => {
      try {
        const result = await callSocialFunction('late-analytics', {
          user_id: userId,
          workspace_id: workspaceId,
          action: 'get_best_time',
          platform,
          social_account_id,
        });
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_get_best_time',
      description: 'Get the best times to post on a specific platform based on your account\'s historical engagement data from Late.dev.',
      schema: z.object({
        platform: z.string().describe('Platform to get best times for'),
        social_account_id: z.string().optional().describe('UUID of the social account (optional, uses first active account for platform if omitted)'),
      }),
    }
  );
};

/**
 * Social Media Tool: Get Post Analytics
 */
export const createSocialGetAnalyticsTool = (userId: string, workspaceId: string) => {
  return tool(
    async ({ post_ids, days_back, platform }) => {
      try {
        // Query social_post_analytics joined with social_posts
        let query = supabase
          .from('social_post_analytics')
          .select(`
            impressions, reach, likes, comments, shares, saves, clicks, engagement_rate, synced_at,
            social_posts!inner(id, caption, platform, status, published_at, credits_used, credits_breakdown, image_urls, social_account_id)
          `)
          .eq('workspace_id', workspaceId)
          .order('synced_at', { ascending: false });

        if (post_ids?.length) {
          query = query.in('post_id', post_ids);
        }
        if (platform) {
          query = query.eq('social_posts.platform', platform);
        }
        if (days_back) {
          const since = new Date(Date.now() - days_back * 86400000).toISOString();
          query = query.gte('synced_at', since);
        }

        const { data, error } = await query.limit(50);
        if (error) return JSON.stringify({ success: false, error: error.message });

        // Aggregate totals
        const totals = (data || []).reduce((acc: Record<string, number>, row: any) => {
          acc.impressions = (acc.impressions || 0) + (row.impressions || 0);
          acc.reach = (acc.reach || 0) + (row.reach || 0);
          acc.likes = (acc.likes || 0) + (row.likes || 0);
          acc.comments = (acc.comments || 0) + (row.comments || 0);
          acc.shares = (acc.shares || 0) + (row.shares || 0);
          acc.saves = (acc.saves || 0) + (row.saves || 0);
          acc.credits_used = (acc.credits_used || 0) + (row.social_posts?.credits_used || 0);
          return acc;
        }, {});

        return JSON.stringify({
          success: true,
          period_days: days_back ?? 'all',
          platform: platform ?? 'all',
          totals,
          posts: data,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_get_analytics',
      description: 'Get performance analytics for published social media posts — impressions, reach, likes, comments, shares, saves, engagement rate, and credits spent.',
      schema: z.object({
        post_ids: z.array(z.string()).optional().describe('Specific post UUIDs to fetch analytics for'),
        days_back: z.number().int().min(1).max(365).optional().describe('Number of past days to include (default: all time)'),
        platform: z.string().optional().describe('Filter by platform'),
      }),
    }
  );
};

/**
 * Social Media Tool: Get Account Insights
 */
export const createSocialGetAccountInsightsTool = (userId: string, workspaceId: string) => {
  return tool(
    async ({ social_account_id, platform, days_back }) => {
      try {
        const since = new Date(Date.now() - (days_back ?? 30) * 86400000).toISOString().split('T')[0];

        let query = supabase
          .from('social_account_insights')
          .select(`
            snapshot_date, followers_count, following_count, posts_count,
            avg_engagement, reach_7d, impressions_7d,
            social_accounts!inner(platform, handle, display_name, avatar_url)
          `)
          .eq('workspace_id', workspaceId)
          .gte('snapshot_date', since)
          .order('snapshot_date', { ascending: false });

        if (social_account_id) {
          query = query.eq('social_account_id', social_account_id);
        }
        if (platform) {
          query = query.eq('social_accounts.platform', platform);
        }

        const { data, error } = await query.limit(90);
        if (error) return JSON.stringify({ success: false, error: error.message });

        return JSON.stringify({
          success: true,
          period_days: days_back ?? 30,
          insights: data,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
    {
      name: 'social_get_account_insights',
      description: 'Get account-level insights: follower growth, engagement trends, reach and impressions over time for connected social accounts.',
      schema: z.object({
        social_account_id: z.string().optional().describe('UUID of a specific social account'),
        platform: z.string().optional().describe('Filter by platform'),
        days_back: z.number().int().min(1).max(365).optional().describe('Days of history to return (default: 30)'),
      }),
    }
  );
};
