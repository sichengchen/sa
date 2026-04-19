import { MessageSquarePlus } from "lucide-react";
import type { AriaDesktopSessionSummary } from "../../../shared/api.js";
import { DesktopIconButton } from "./DesktopIconButton.js";
import { DesktopSidebarSectionHeader } from "./DesktopSidebarSectionHeader.js";
import { DesktopThreadListItem } from "./DesktopThreadListItem.js";

type AriaChatThreadSectionProps = {
  disabled?: boolean;
  formatMeta: (updatedAt?: number | null) => string | null;
  onCreateChat: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  sessions: AriaDesktopSessionSummary[];
};

export function AriaChatThreadSection({
  disabled = false,
  formatMeta,
  onCreateChat,
  onSelectSession,
  selectedSessionId,
  sessions,
}: AriaChatThreadSectionProps) {
  return (
    <section className="desktop-chat-thread-section">
      <DesktopSidebarSectionHeader
        actions={
          <DesktopIconButton
            disabled={disabled}
            icon={<MessageSquarePlus aria-hidden="true" />}
            label="Create chat"
            onClick={onCreateChat}
          />
        }
        title="Chat"
      />

      <div className="thread-list" role="list">
        {sessions.map((session) => (
          <DesktopThreadListItem
            key={session.sessionId}
            active={session.sessionId === selectedSessionId}
            disabled={disabled}
            meta={formatMeta(session.lastActiveAt)}
            onSelect={() => onSelectSession(session.sessionId)}
            preview={session.preview ?? session.summary ?? null}
            title={session.title}
          />
        ))}
      </div>
    </section>
  );
}
