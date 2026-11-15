export type Branch =
  | {
      kind: "named";
      name: string;
    }
  | {
      kind: "detached";
    }
  | {
      kind: "unavailable";
    };
export type Directory =
  | {
      kind: "live";
      path: string;
    }
  | {
      kind: "voyage";
      path: string;
    }
  | {
      kind: "starting";
      path: string;
    }
  | {
      kind: "unavailable";
    };

export interface WorkspaceObservation {
  active?: string | null;
  branch: Branch;
  directory: Directory;
  panels: PlacementObservation[];
  version: string;
}
export interface PlacementObservation {
  backend?: string | null;
  conversationName?: string | null;
  directory: Directory;
  effectiveName: string;
  placementId: string;
  program?: string | null;
  vesselId: string;
}
