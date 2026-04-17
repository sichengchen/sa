import { type ReactElement } from "react";
import { Card, Button } from "@aria/desktop-ui";
import type { AriaChatPendingApproval } from "@aria/access-client";

export interface ApprovalCardProps {
  approval: AriaChatPendingApproval;
  onApprove: (approved: boolean) => void;
  onAllowForSession: () => void;
  className?: string;
}

export function ApprovalCard({
  approval,
  onApprove,
  onAllowForSession,
  className,
}: ApprovalCardProps): ReactElement {
  return (
    <Card variant="soft" className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
        Approval required
      </div>
      <p className="my-1 text-sm font-medium">Pending approval: {approval.toolName}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => onApprove(true)}>
          Approve
        </Button>
        <Button variant="secondary" size="sm" onClick={onAllowForSession}>
          Allow for session
        </Button>
        <Button variant="danger" size="sm" onClick={() => onApprove(false)}>
          Deny
        </Button>
      </div>
    </Card>
  );
}
