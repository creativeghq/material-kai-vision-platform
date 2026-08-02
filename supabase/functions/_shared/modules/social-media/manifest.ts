/**
 * Social Media — edge-tier module manifest.
 *
 * Declares the agents + LLM tool factories this module contributes when
 * `public.modules.slug = 'social-media'` is enabled. Consumed by:
 *   - the background-agent runner (gates agents via getRunnerGated)
 *   - the KAI agent edge function (when it builds its tool list, if/when
 *     it adopts dynamic module-tool merging)
 *
 * Adding a new social capability: extend the `manage_social` tool in
 * `_shared/tools/social-tools.ts` and its SERVER_TOOLKITS / client TOOLKITS entries.
 * Do NOT add tool factories here — nothing consumes them.
 */

import type { EdgeModuleManifest } from '../registry.ts';

// NOTE: this module exposes its agent surface through the single consolidated `manage_social`
// tool registered in agent-chat, NOT through per-action tool factories. An 11-entry
// `toolFactories` array used to sit here alongside a 490-line tools.ts, and NOTHING consumed
// either — a maintainer adding a social capability here shipped nothing. Both are deleted, and
// the unconsumed `toolFactories` field is gone from EdgeModuleManifest so it cannot be declared
// again in the belief that it works.
const manifest: EdgeModuleManifest = {
  slug: 'social-media',
  agents: [SocialAnalyticsSyncAgent, SocialInsightsSyncAgent],
};

export default manifest;
