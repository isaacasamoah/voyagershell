export type ActivityState = "unknown" | "working" | "blocked" | "idle" | "done" | "error";

export interface Projection {
  terminals: {
    [k: string]: ReportedActivity;
  };
}
export interface ReportedActivity {
  app?: string | null;
  kind?: string | null;
  limited: boolean;
  observedMs?: string | null;
  progress?: number | null;
  reason?: string | null;
  reported: boolean;
  sequence?: string | null;
  sourceMs?: string | null;
  state: ActivityState;
}
