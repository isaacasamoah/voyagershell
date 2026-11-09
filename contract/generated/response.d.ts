export type Phase = "ready" | "saving" | "incomplete" | "closed";
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
export type Split =
  | {
      kind: "leaf";
      placement: string;
    }
  | {
      axis: Axis;
      first: Split;
      kind: "branch";
      second: Split;
      share?: SplitShare;
    };
export type Axis = "horizontal" | "vertical";
export type SplitShare = number;
export type NameOrigin = "automatic" | "deliberate";
export type PanelOwner =
  | {
      id: string;
      kind: "fleet";
    }
  | {
      kind: "portals";
      voyage: string;
    };
export type WorkspaceView = "home" | "fleet";
export type Status = "applied" | "rejected" | "uncertain";

export interface Response {
  closePlan?: Plan | null;
  createdContents: string[];
  createdWorkspace: boolean;
  fresh: boolean;
  layout: Layout;
  message?: string | null;
  requestId: string;
  status: Status;
  version: string;
}
export interface Plan {
  entries: Entry[];
  id: string;
  message?: string | null;
  name: string;
  phase: Phase;
  uncommittedChanges?: number | null;
  version: string;
  voyage: string;
}
export interface Entry {
  content: string;
  name: string;
  pid?: number | null;
  terminal?: string | null;
  typeId: string;
}
export interface Layout {
  canvas?: Canvas;
  contents: Content[];
  context: Context;
  home?: Voyage | null;
  nextId: string;
  savedLayouts?: SavedLayout[];
  selectedFleet?: string | null;
  selectedVoyage?: string | null;
  view?: WorkspaceView & string;
  voyages: Voyage[];
}
export interface Canvas {
  portalMode?: PortalMode & string;
  root: Node;
  sidebarCollapsed?: boolean;
}
export interface Content {
  backend?: string | null;
  configuration?: {
    [k: string]: unknown;
  } | null;
  cwd: string;
  id: string;
  launch?: Launch | null;
  shellIntent?: string | null;
  startPending?: string | null;
  typeId: string;
}
export interface Voyage {
  closed?: boolean;
  closedOrder?: string;
  cwd?: string | null;
  fleets: Fleet[];
  id: string;
  name: string;
  nameOrigin?: NameOrigin & string;
  portalLayout?: PortalLayout | null;
  portals: Vessel[];
  primaryVessel?: string | null;
}
export interface Fleet {
  closed?: boolean;
  id: string;
  maximizedPlacement?: string | null;
  name: string;
  root?: Split | null;
  vessels: Vessel[];
}
export interface Vessel {
  content: string;
  hidden?: boolean;
  id: string;
  name: string;
  nameOrigin?: NameOrigin;
}
export interface PortalLayout {
  maximizedPlacement?: string | null;
  mode: PortalMode;
  root?: Split | null;
  visible: boolean;
  width: number;
}
export interface SavedLayout {
  name: string;
  owner: PanelOwner;
  root?: Split | null;
}
