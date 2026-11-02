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
    };
export type Axis = "horizontal" | "vertical";
export type Status = "applied" | "rejected" | "uncertain";

export interface Response {
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
  selectedFleet?: string | null;
  selectedVoyage?: string | null;
  voyages: Voyage[];
}
export interface Content {
  backend?: string | null;
  cwd: string;
  id: string;
  startPending?: string | null;
  typeId: string;
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
}
