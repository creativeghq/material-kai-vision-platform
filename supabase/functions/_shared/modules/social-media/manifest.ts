/**
 * Social Media — edge-tier module manifest.
 *
 * Declares the agents + LLM tool factories this module contributes when
 * `public.modules.slug = 'social-media'` is enabled. Consumed by:
 *   - the background-agent runner (gates agents via getRunnerGated)
 *   - the KAI agent edge function (when it builds its tool list, if/when
 *     it adopts dynamic module-tool merging)
 *
 * Adding a new tool: drop the factory into `tools.ts` and add it to
 * `toolFactories` below.
 */

import type { EdgeModuleManifest } from '../registry.ts';
import { SocialAnalyticsSyncAgent } from './agents/social-analytics-sync-agent.ts';
import { SocialInsightsSyncAgent } from './agents/social-insights-sync-agent.ts';
import {
  createSocialConnectAccountTool,
  createSocialListAccountsTool,
  createSocialDisconnectAccountTool,
  createSocialGeneratePostTool,
  createSocialGenerateImageTool,
  createSocialGenerateVideoTool,
  createSocialPublishPostTool,
  createSocialSchedulePostTool,
  createSocialGetBestTimeTool,
  createSocialGetAnalyticsTool,
  createSocialGetAccountInsightsTool,
} from './tools.ts';

const manifest: EdgeModuleManifest = {
  slug: 'social-media',
  agents: [SocialAnalyticsSyncAgent, SocialInsightsSyncAgent],
  toolFactories: [
    createSocialConnectAccountTool,
    createSocialListAccountsTool,
    createSocialDisconnectAccountTool,
    createSocialGeneratePostTool,
    createSocialGenerateImageTool,
    createSocialGenerateVideoTool,
    createSocialPublishPostTool,
    createSocialSchedulePostTool,
    createSocialGetBestTimeTool,
    createSocialGetAnalyticsTool,
    createSocialGetAccountInsightsTool,
  ],
};

export default manifest;
