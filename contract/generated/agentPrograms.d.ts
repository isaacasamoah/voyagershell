export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type Permissions = "yolo" | "workspace-write" | "read-only";

export interface AgentTable {
  agents: AgentProgram[];
}
export interface AgentProgram {
  icon?: string | null;
  id: string;
  launch?: AgentLaunch;
  name: string;
  programs: string[];
  seeded?: boolean;
}
export interface AgentLaunch {
  argv?: string[];
  effort?: EffortSetting | null;
  model?: ModelSetting | null;
  permissions?: PermissionSetting | null;
}
export interface EffortSetting {
  default: Effort;
  flags: string[];
}
export interface ModelSetting {
  default: string;
  flags: string[];
}
export interface PermissionSetting {
  default: Permissions;
  readOnly: string[];
  workspaceWrite: string[];
  yolo: string[];
}
