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
export type Role = "user" | "assistant" | "tool";
export type Action =
  | {
      operation: "inspect";
    }
  | {
      cwd: string;
      name: string;
      operation: "create-voyage";
    }
  | {
      name: string;
      operation: "create-fleet";
      voyage: string;
    }
  | {
      operation: "create-portal";
      voyage: string;
    }
  | {
      name: string;
      operation: "rename";
      target: RenameTarget;
    }
  | {
      after: string;
      axis: Axis;
      fleet: string;
      operation: "split";
    }
  | {
      id: string;
      operation: "move-vessel";
      side: Side;
      target: string;
    }
  | {
      before: boolean;
      id: string;
      operation: "move-voyage";
      target: string;
    }
  | {
      before: boolean;
      id: string;
      operation: "move-fleet";
      target: string;
    }
  | {
      id: string;
      operation: "select-voyage";
    }
  | {
      id: string;
      operation: "select-fleet";
    }
  | {
      context: Context;
      operation: "dock";
    };
export type RenameTarget =
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
export type Axis = "horizontal" | "vertical";
export type Side = "left" | "right" | "top" | "bottom";
export type CallbackId =
  | {
      kind: "string";
      value: string;
    }
  | {
      kind: "integer";
      value: string;
    };
export type Status = "applied" | "rejected" | "uncertain";
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
  tool?: ToolOutcome | null;
}
export interface Focus {
  cwd?: string | null;
  path: string[];
  revision: string;
  scope: Context;
}
export interface ToolOutcome {
  action: Action;
  callId: string;
  callbackIds: CallbackId[];
  name: string;
  requestId: string;
  status: Status;
  version?: string | null;
}
