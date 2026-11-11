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
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface WorkspaceObservation {
  active?: string | null;
  branch: Branch;
  directory: Directory;
  panels: PanelObservation[];
  version: string;
}
export interface PanelObservation {
  address: string;
  backend?: string | null;
  contentId: string;
  conversationName?: string | null;
  directory: Directory;
  effectiveName: string;
  placementId: string;
  position?: Position | null;
  program?: string | null;
}
export interface Position {
  column: number;
  columnSpan: number;
  columns: number;
  corners: Corner[];
  row: number;
  rowSpan: number;
  rows: number;
}
