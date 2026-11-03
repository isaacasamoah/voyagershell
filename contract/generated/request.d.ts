export type Action =
  | {
      operation: "inspect";
    }
  | {
      operation: "home";
    }
  | {
      canvas: Canvas;
      operation: "update-canvas";
    }
  | {
      collapsed: boolean;
      operation: "set-sidebar";
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
      destination: ContentDestination;
      launch?: Launch | null;
      operation: "create-content";
      typeId: string;
    }
  | {
      contentId: string;
      expectedBackend: string;
      operation: "start-new-shell";
    }
  | {
      operation: "remove-content-package";
      typeId: string;
    }
  | {
      operation: "restore-content-package";
      typeId: string;
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
    }
  | {
      id: string;
      maximized: boolean;
      operation: "set-vessel-maximized";
    };
export type PortalMode = "overlay" | "make-room";
export type Node =
  | {
      children: Node[];
      kind: "row";
      size?: Size;
    }
  | {
      children: Node[];
      kind: "column";
      size?: Size;
    }
  | {
      kind: "block";
      region: Region;
      size?: Size;
    };
export type Size =
  | {
      kind: "fill";
    }
  | {
      kind: "content";
    }
  | {
      kind: "fixed";
      pixels: number;
    };
export type Region = "sidebar" | "fleet-strip" | "active-fleet" | "portals" | "context-bar";
export type ContentDestination =
  | {
      after: string;
      axis: Axis;
      fleet: string;
      kind: "vessel";
    }
  | {
      kind: "portal";
      voyage: string;
    };
export type Axis = "horizontal" | "vertical";
export type Launch =
  | {
      kind: "terminal";
    }
  | {
      effort?: Effort & string;
      kind: "codex";
      model?: string;
      permissions?: Permissions & string;
    }
  | {
      argv: string[];
      kind: "program";
    };
export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type Permissions = "yolo" | "workspace-write" | "read-only";
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

export interface Request {
  action: Action;
  expectedVersion: string;
  requestId: string;
}
export interface Canvas {
  portalMode?: PortalMode & string;
  root: Node;
  sidebarCollapsed?: boolean;
}
