import type { Route } from "../../route";
import { AgentChat } from "./AgentChat";

export function ChatThread({ route }: { route?: Route }): JSX.Element {
  const conversationId = route?.params?.["conversation"];
  return <AgentChat {...(conversationId ? { conversationId } : {})} />;
}

export { AgentChat as default };
