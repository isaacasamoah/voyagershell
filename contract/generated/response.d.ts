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
  contents: Content[];
  context: Context;
  nextId: string;
  savedLayouts?: SavedLayout[];
  selectedFleet?: string | null;
  selectedVoyage?: string | null;
  view?: WorkspaceView & string;
  voyages: Voyage[];
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
