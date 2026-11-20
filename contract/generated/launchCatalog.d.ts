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
  launch: LaunchRecord;
  name: string;
}
export interface LaunchRecord {
  argv?: string[] | null;
  effort?: Effort | null;
  kind: string;
  model?: string | null;
  permissions?: Permissions | null;
}
