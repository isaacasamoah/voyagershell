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
export type WorkspaceView = "home" | "fleet";
export type Status = "applied" | "rejected" | "uncertain";

export interface Response {
  createdContents: string[];
  createdWorkspace: boolean;
  fresh: boolean;
  layout: Layout;
  message?: string | null;
  requestId: string;
  status: Status;
  version: string;
}
export interface Layout {
  canvas?: Canvas;
  contents: Content[];
  context: Context;
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
  cwd: string;
  id: string;
  startPending?: string | null;
  typeId: string;
}
export interface SavedLayout {
  fleet: string;
  name: string;
  root: Split;
}
export interface Voyage {
  fleets: Fleet[];
  id: string;
  name: string;
  portals: Vessel[];
}
export interface Fleet {
  id: string;
  name: string;
  root: Split;
  vessels: Vessel[];
}
export interface Vessel {
  content: string;
  id: string;
  name?: string | null;
}
