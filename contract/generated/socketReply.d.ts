export type SocketReply =
  | {
      kind: "status";
      status: VesselStatus;
    }
  | {
      kind: "overview";
      overview: Overview;
    }
  | {
      focus: Focus;
      kind: "focus";
    }
  | {
      kind: "noted";
    }
  | {
      kind: "workspace";
      reply: Reply;
    }
  | {
      kind: "refused";
      message: string;
    };
export type PlacementOwner =
  | {
      id: string;
      kind: "fleet";
    }
  | {
      kind: "portals";
      voyage: string;
    };
export type ActivityState = "unknown" | "working" | "blocked" | "idle" | "done" | "error";
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
export type Reply = Response | Unanswered;
export type Phase = "ready" | "saving" | "incomplete" | "closed";
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
export type NameOrigin = "automatic" | "deliberate";
export type Launch =
  | {
      kind: "terminal";
    }
  | {
      argv: string[];
      kind: "program";
    };
export type WorkspaceView = "home" | "fleet";
export type Outcome = "applied" | "refused" | "uncertain";
export type Unapplied = "refused" | "uncertain";

export interface VesselStatus {
  placements: VesselPlacement[];
  terminal: string;
  version: string;
  vessel: string;
}
export interface VesselPlacement {
  name: string;
  owner: PlacementOwner;
  placement: string;
  voyage: string;
}
export interface Overview {
  status: VesselStatus;
  voyages: VoyageOverview[];
}
export interface VoyageOverview {
  fleets: FleetOverview[];
  id: string;
  name: string;
  portals: PortalsOverview;
  selected: boolean;
}
export interface FleetOverview {
  id: string;
  name: string;
  onScreen: boolean;
  pieces: PieceOverview[];
}
export interface PieceOverview {
  activity?: ActivityState | null;
  name: string;
  onScreen: boolean;
  placement: string;
  terminal?: string | null;
  typeId: string;
  you?: boolean;
}
export interface PortalsOverview {
  pieces: PieceOverview[];
  visible: boolean;
}
export interface Focus {
  cwd?: string | null;
  path: string[];
  preview?: string | null;
  revision: string;
  scope: Context;
}
export interface Response {
  closePlan?: Plan | null;
  createdVessels: string[];
  createdWorkspace: boolean;
  fresh: boolean;
  layout: Layout;
  message?: string | null;
  requestId: string;
  status: Outcome;
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
  name: string;
  pid?: number | null;
  terminal?: string | null;
  typeId: string;
  vessel: string;
}
export interface Layout {
  arrangements?: Arrangement[];
  canvas?: Canvas;
  context: Context;
  home?: Voyage | null;
  lastVessels?: LastVessel[];
  navigation?: LastUsed[];
  nextId: string;
  selectedFleet?: string | null;
  selectedVoyage?: string | null;
  vessels: Vessel[];
  view?: WorkspaceView & string;
  voyages: Voyage[];
}
export interface Arrangement {
  name: string;
  owner: PlacementOwner;
  root?: Split | null;
}
export interface Canvas {
  portalMode?: PortalMode & string;
  root: Node;
  sidebarCollapsed?: boolean;
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
  portals: Placement[];
  primaryPlacement?: string | null;
}
export interface Fleet {
  closed?: boolean;
  id: string;
  maximizedPlacement?: string | null;
  name: string;
  placements: Placement[];
  root?: Split | null;
}
export interface Placement {
  hidden?: boolean;
  id: string;
  name: string;
  nameOrigin?: NameOrigin;
  vessel: string;
}
export interface PortalLayout {
  maximizedPlacement?: string | null;
  mode: PortalMode;
  root?: Split | null;
  visible: boolean;
  width: number;
}
export interface LastVessel {
  fleet: string;
  vessel: string;
}
export interface LastUsed {
  fleet: string;
  voyage: string;
}
export interface Vessel {
  adopted?: boolean;
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
export interface Unanswered {
  message: string;
  requestId: string;
  status: Unapplied;
}
