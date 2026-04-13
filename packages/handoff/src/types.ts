export type HandoffSourceKind =
  | "local_session"
  | "connector_session"
  | "automation"
  | "external_webhook";
export type HandoffStatus =
  | "pending"
  | "accepted"
  | "dispatch_created"
  | "completed"
  | "failed"
  | "cancelled";

export interface HandoffRecord {
  handoffId: string;
  idempotencyKey: string;
  sourceKind: HandoffSourceKind;
  sourceSessionId?: string | null;
  projectId: string;
  taskId?: string | null;
  threadId?: string | null;
  createdDispatchId?: string | null;
  status: HandoffStatus;
  payloadJson?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HandoffSubmission {
  idempotencyKey: string;
  sourceKind: HandoffSourceKind;
  sourceSessionId?: string | null;
  projectId: string;
  taskId?: string | null;
  threadId?: string | null;
  payloadJson?: string | null;
}
