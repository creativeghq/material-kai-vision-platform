/** Social Media — edge-tier module manifest. */

import type { EdgeModuleManifest } from '../registry.ts';

// This module exposes its agent surface through the single consolidated `manage_social`
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
