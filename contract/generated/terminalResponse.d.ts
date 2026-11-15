export type TerminalReason = "ended";
export type Status = "applied" | "rejected" | "uncertain";

export interface TerminalResponse {
  message?: string | null;
  reason?: TerminalReason | null;
  requestId: string;
  status: Status;
  vesselId: string;
}
