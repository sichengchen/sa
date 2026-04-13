import type { AriaMobileAppShell } from "./app.js";

export interface AriaMobileNativeHostModel {
  title: string;
  serverLabel: string;
  availableServers: Array<{
    serverId: string;
    label: string;
    selected: boolean;
  }>;
  sessionId: string;
  sessionStatus: string;
  approvalMode: string;
  securityMode: string;
  transcriptCount: number;
  latestMessage: string;
  pendingApproval: string;
  pendingQuestion: string;
  recentSessions: Array<{
    sessionId: string;
    kind: "live" | "archived";
    preview?: string;
    summary?: string;
    score?: number;
  }>;
}

export function createAriaMobileNativeHostModel(
  shell: AriaMobileAppShell,
): AriaMobileNativeHostModel {
  return {
    title: "Aria Mobile",
    serverLabel: shell.activeServerLabel,
    availableServers: shell.serverSwitcher.availableServers.map((server) => ({
      serverId: server.id,
      label: server.label,
      selected: server.id === shell.activeServerId,
    })),
    sessionId: shell.ariaThread.state.sessionId ?? "disconnected",
    sessionStatus: shell.ariaThread.state.sessionStatus,
    approvalMode: shell.ariaThread.state.approvalMode,
    securityMode: shell.ariaThread.state.securityMode,
    transcriptCount: shell.ariaThread.state.messages.length,
    latestMessage: shell.ariaThread.state.messages.at(-1)?.content ?? "No transcript yet",
    pendingApproval: shell.ariaThread.state.pendingApproval?.toolName ?? "none",
    pendingQuestion: shell.ariaThread.state.pendingQuestion?.question ?? "none",
    recentSessions: shell.ariaRecentSessions.map((session) => ({
      sessionId: session.sessionId,
      kind: session.archived ? "archived" : "live",
      preview: session.preview,
      summary: session.summary,
      score: session.score,
    })),
  };
}
