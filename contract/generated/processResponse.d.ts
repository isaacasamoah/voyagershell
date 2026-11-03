export type ProcessOutput =
  | {
      operation: "list";
      processes: ProcessInfo[];
      unavailable: string[];
    }
  | {
      complete: boolean;
      how: string;
      limited: boolean;
      operation: "read";
      target: ProcessInfo;
      text: string;
      why?: string | null;
    }
  | {
      operation: "send";
      started?: boolean | null;
      status?: string | null;
      target: ProcessInfo;
      turn: string;
    }
  | {
      key: string;
      operation: "interrupt";
      outcome: string;
      target: ProcessInfo;
    }
  | {
      observed: ProcessInfo;
      operation: "stop";
      target: ProcessInfo;
    };
export type ActivityState = "unknown" | "working" | "blocked" | "idle" | "done" | "error";
export type Status = "applied" | "rejected" | "uncertain";

export interface ProcessResponse {
  fresh: boolean;
  message?: string | null;
  output?: ProcessOutput | null;
  requestId: string;
  status: Status;
  version: string;
}
export interface ProcessInfo {
  contentId: string;
  cwd: string;
  foreground?: string | null;
  pid?: number | null;
  reportedActivity?: ReportedActivity | null;
  state: string;
  terminalId: string;
}
export interface ReportedActivity {
  app?: string | null;
  kind?: string | null;
  limited: boolean;
  message?: string | null;
  observedMs?: string | null;
  progress?: number | null;
  reason?: string | null;
  reported?: boolean | null;
  sequence?: string | null;
  sourceMs?: string | null;
  state: ActivityState;
  title?: string | null;
}
