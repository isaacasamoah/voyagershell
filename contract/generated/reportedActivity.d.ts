export type ActivityState = "unknown" | "working" | "blocked" | "idle" | "done" | "error";

export interface Projection {
  limited: boolean;
  reason?: string | null;
  terminals: {
    [k: string]: ReportedActivity;
  };
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
