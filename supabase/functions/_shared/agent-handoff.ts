/** An in-app link that opens `agentId` and sends `prompt` as the first turn (AgentHub auto-sends `?prompt=`). */
export function agentReviewLink(agentId: string, prompt: string): string {
  return `/agent-hub?agent=${encodeURIComponent(agentId)}&prompt=${encodeURIComponent(prompt)}`;
}
