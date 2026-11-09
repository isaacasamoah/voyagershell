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
  panels: PanelObservation[];
  version: string;
}
export interface PanelObservation {
  backend?: string | null;
  contentId: string;
  conversationName?: string | null;
  directory: Directory;
  effectiveName: string;
  placementId: string;
  program?: string | null;
}
