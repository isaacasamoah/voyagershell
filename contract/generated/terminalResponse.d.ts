export type Status = "applied" | "rejected" | "uncertain";

export interface TerminalResponse {
  contentId: string;
  message?: string | null;
  requestId: string;
  status: Status;
}
