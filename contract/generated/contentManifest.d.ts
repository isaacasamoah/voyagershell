export type Effect =
  | {
      op: "set";
      path: string;
      value: unknown;
    }
  | {
      op: "push";
      path: string;
      value: unknown;
    }
  | {
      op: "remove";
      path: string;
    }
  | {
      index: string;
      op: "move";
      path: string;
      to: string;
    }
  | {
      op: "backend";
    };
export type Rebase = "by-key" | "always" | "refuse";
export type Risk = "confirm";
export type BackendKind = "core-document" | "core-terminal";
export type ConcurrencyMode = "turns" | "merge";
export type Toggle = "on" | "off";
export type DockTrigger = "on-dock" | "while-docked";
export type CloseMode = "keep-state";
export type OpenMode = "render";
export type RetireMode = "refuse-new-actions";
export type OrbitGroup = "act" | "ask";
export type Attribution = "none" | "per-entity";
export type PresenceShow = "avatars" | "last-actor";

export interface Manifest {
  actions: {
    [k: string]: ActionDecl;
  };
  backend?: BackendDecl | null;
  concurrency?: Concurrency;
  contract: number;
  dock?: DockEntry[];
  id: string;
  lifecycle?: Lifecycle;
  local?: StateDecl | null;
  name: string;
  orbit?: OrbitEntry[];
  presence?: Presence;
  state: StateDecl;
  version: number;
  view: ViewDecl;
}
export interface ActionDecl {
  effect: Effect[];
  params?: {
    [k: string]: string;
  };
  rebase: Rebase;
  risk?: Risk | null;
}
export interface BackendDecl {
  kind: BackendKind;
}
export interface Concurrency {
  default?: ConcurrencyMode & string;
  merge?: string[];
}
export interface DockEntry {
  default: Toggle;
  id: string;
  label: string;
  read: string;
  trigger: DockTrigger;
}
export interface Lifecycle {
  close?: CloseMode & string;
  open?: OpenMode & string;
  retire?: RetireMode & string;
}
export interface StateDecl {
  initial: unknown;
  migrations?: Migration[];
  schema: unknown;
}
export interface Migration {
  from: number;
  set: {
    [k: string]: unknown;
  };
}
export interface OrbitEntry {
  group: OrbitGroup;
  icon: string;
  id: string;
  label: string;
  pinned?: boolean | null;
  run: Run;
  short?: string | null;
}
export interface Run {
  action?: string | null;
  agent?: string | null;
  args?: {
    [k: string]: string;
  };
  ask?: {
    [k: string]: string;
  };
  read?: string | null;
}
export interface Presence {
  attribution?: Attribution & string;
  show?: PresenceShow[];
}
export interface ViewDecl {
  islands?: {
    [k: string]: Island;
  };
  source: string;
}
export interface Island {
  actions?: string[];
  budget: Budget;
  props?: {
    [k: string]: string;
  };
  script: string;
}
export interface Budget {
  mb: number;
  ms: number;
}
