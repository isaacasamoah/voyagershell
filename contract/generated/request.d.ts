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
      name: string;
      operation: "save-panel-layout";
      owner: PanelOwner;
    }
  | {
      name: string;
      operation: "load-panel-layout";
      owner: PanelOwner;
    }
  | {
      cwd: string;
      name: string;
      operation: "create-voyage";
    }
  | {
      operation: "create-voyage-from-source";
      source: DirectorySource;
    }
  | {
      name: string;
      operation: "create-fleet";
      voyage: string;
    }
  | {
      launch?: Launch | null;
      name: string;
      operation: "create-fleet-with-content";
      source: DirectorySource;
      typeId: string;
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
      operation: "resize-panel-split";
      owner: PanelOwner;
      /**
       * @maxItems 128
       */
      path: SplitChild[];
      share: SplitShare;
    }
  | {
      id: string;
      operation: "move-panel";
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
      operation: "close-voyage";
    }
  | {
      id: string;
      operation: "confirm-voyage-close";
      plan: string;
    }
  | {
      id: string;
      operation: "cancel-voyage-close";
      plan: string;
    }
  | {
      id: string;
      operation: "reopen-voyage";
    }
  | {
      id: string;
      operation: "select-fleet";
    }
  | {
      id: string;
      operation: "close-fleet";
    }
  | {
      id: string;
      operation: "reopen-fleet";
    }
  | {
      id: string;
      operation: "reveal-panel";
    }
  | {
      destination: ContentDestination;
      id: string;
      operation: "reopen-panel";
    }
  | {
      context: Context;
      operation: "dock";
    }
  | {
      id: string;
      maximized: boolean;
      operation: "set-panel-maximized";
    }
  | {
      hidden: boolean;
      id: string;
      operation: "set-panel-hidden";
    }
  | {
      id: string;
      operation: "remove-panel";
    }
  | {
      name: string;
      operation: "remove-panel-layout";
      owner: PanelOwner;
    }
  | {
      mode?: PortalMode | null;
      operation: "set-portal-presentation";
      visible?: boolean | null;
      voyage: string;
      width?: number | null;
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
      children: Node[];
      kind: "stack";
      selected: number;
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
export type PanelOwner =
  | {
      id: string;
      kind: "fleet";
    }
  | {
      kind: "portals";
      voyage: string;
    };
export type DirectorySource =
  | {
      backend: string;
      contentId: string;
      cwd: string;
      kind: "live";
      placementId: string;
    }
  | {
      cwd: string;
      kind: "voyage";
      voyageId: string;
    }
  | {
      contentId: string;
      cwd: string;
      kind: "starting";
      placementId: string;
    };
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
export type ContentDestination = {
  insertion: PanelInsertion;
  kind: "panel";
  owner: PanelOwner;
};
export type PanelInsertion =
  | {
      kind: "empty";
    }
  | {
      id: string;
      kind: "beside";
      side: Side;
    };
export type Side = "left" | "right" | "top" | "bottom";
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
