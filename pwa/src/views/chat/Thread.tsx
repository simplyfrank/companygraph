// chat-interface rev 3.1 — the agentic chat pane replaces the
// rev-2-era Cypher console. This file is a thin re-export so the
// existing `import { ChatThread } from "./chat/Thread"` in
// views/index.tsx transparently picks up the new AgentChat.
export { AgentChat as default, AgentChat as ChatThread } from "./AgentChat";
