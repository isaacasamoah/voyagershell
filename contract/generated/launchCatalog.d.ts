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

export interface Catalog {
  available: string[];
  errors: string[];
  path?: string | null;
  settings: LaunchSettings;
}
export interface LaunchSettings {
  default: string;
  entries: LaunchEntry[];
}
export interface LaunchEntry {
  id: string;
  launch: Launch;
  name: string;
}
