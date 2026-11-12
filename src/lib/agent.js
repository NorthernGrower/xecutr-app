import { base44 } from "@/api/base44Client";

/** The in-app build agent, by its config file name. */
export const AGENT_NAME = "xecutr_agent";

/** Sessions newest first. */
export async function listSessions() {
  const rows = await base44.agents.listConversations({ agent_name: AGENT_NAME });
  return (rows || []).sort(
    (a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0),
  );
}

/** Open a session, creating it on first use. */
export async function createSession(title) {
  return base44.agents.createConversation({
    agent_name: AGENT_NAME,
    metadata: {
      name: title || "new session",
      description: "Conversation with the xecutr build agent",
    },
  });
}