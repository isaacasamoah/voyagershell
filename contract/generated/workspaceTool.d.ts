export type Action =
  | {
      operation: "inspect";
    }
  | {
      operation: "home";
    }
  | {
      fleet: string;
      name: string;
      operation: "save-layout";
    }
  | {
      fleet: string;
      name: string;
      operation: "load-layout";
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
      fleet: string;
      operation: "resize-split";
      /**
       * @maxItems 128
       */
      path: SplitChild[];
      share: SplitShare;
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
      id: string;
      operation: "reveal-vessel";
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
export type SplitChild = "first" | "second";
export type SplitShare = number;
export type Side = "left" | "right" | "top" | "bottom";
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
