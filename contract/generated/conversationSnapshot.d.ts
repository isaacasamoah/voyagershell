export type Context =
  | {
      kind: "workspace";
    }
  | {
      id: string;
      kind: "voyage";
    }
  | {
      id: string;
      kind: "fleet";
    }
  | {
      id: string;
      kind: "vessel";
    }
  | {
      id: string;
      kind: "portal";
    };
export type Role = "user" | "assistant";
export type Phase = "idle" | "starting" | "working" | "completed" | "interrupted" | "failed" | "unconfirmed";

export interface Snapshot {
  error?: string | null;
  limited: boolean;
  messages: Message[];
  model?: string | null;
  omitted: string;
  phase: Phase;
  thread?: string | null;
  turn?: string | null;
  version: string;
}
export interface Message {
  context?: Focus | null;
  id: string;
  requestId: string;
  role: Role;
  text: string;
}
export interface Focus {
  cwd?: string | null;
  path: string[];
  revision: string;
  scope: Context;
}
