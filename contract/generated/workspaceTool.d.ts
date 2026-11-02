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
      after: string;
      axis: Axis;
      fleet: string;
      operation: "split";
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
export type Axis = "horizontal" | "vertical";
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

export interface WorkspaceInput {
  action: Action;
  expectedVersion: string;
}
